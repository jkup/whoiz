import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

const resolver = new Resolver({ timeout: 4000, tries: 2 });

export interface DnsInfo {
  cnames: string[];
  ips: string[];
}

/** Follow the CNAME chain (max 10 hops) and collect final A/AAAA records. */
export async function resolveHost(host: string): Promise<DnsInfo> {
  if (isIP(host)) return { cnames: [], ips: [host] };
  const cnames: string[] = [];
  let current = host;
  for (let i = 0; i < 10; i++) {
    let next: string[] = [];
    try {
      next = await resolver.resolveCname(current);
    } catch {
      break;
    }
    const target = next[0]?.toLowerCase();
    if (!target || cnames.includes(target)) break;
    cnames.push(target);
    current = target;
  }
  const [a, aaaa] = await Promise.all([
    resolver.resolve4(current).catch(() => [] as string[]),
    resolver.resolve6(current).catch(() => [] as string[]),
  ]);
  return { cnames, ips: [...a, ...aaaa] };
}

/** ASN lookup via Team Cymru's DNS service — no HTTP, no API key. */
export async function lookupAsn(ip: string): Promise<{ number: number; org: string } | undefined> {
  try {
    const name =
      isIP(ip) === 4 ? `${ip.split(".").reverse().join(".")}.origin.asn.cymru.com` : v6Name(ip);
    if (!name) return undefined;
    const txt = (await resolver.resolveTxt(name)).flat()[0];
    const asn = Number(txt?.split("|")[0]?.trim());
    if (!Number.isFinite(asn)) return undefined;
    const orgTxt = (await resolver.resolveTxt(`AS${asn}.asn.cymru.com`).catch(() => [])).flat()[0];
    const org =
      orgTxt
        ?.split("|")[4]
        ?.trim()
        .replace(/,\s*[A-Z]{2}$/, "") ?? "";
    return { number: asn, org };
  } catch {
    return undefined;
  }
}

function v6Name(ip: string): string | null {
  const halves = ip.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const groups = [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const hex = groups.map((g) => g.padStart(4, "0")).join("");
  return `${hex.split("").reverse().join(".")}.origin6.asn.cymru.com`;
}
