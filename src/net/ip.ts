import { isIPv4, isIPv6 } from "node:net";
import ranges from "../data/ranges.json" with { type: "json" };

type Parsed = { bits: bigint; len: number; v6: boolean };

function parseIp(ip: string): { bits: bigint; v6: boolean } | null {
  if (isIPv4(ip)) {
    const [a, b, c, d] = ip.split(".").map(Number) as [number, number, number, number];
    return { bits: BigInt((a << 24) >>> 0) + BigInt((b << 16) | (c << 8) | d), v6: false };
  }
  if (isIPv6(ip)) {
    const full = expandV6(ip);
    if (!full) return null;
    return { bits: BigInt(`0x${full}`), v6: true };
  }
  return null;
}

function expandV6(ip: string): string | null {
  const noZone = ip.split("%")[0]!;
  const halves = noZone.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  return groups.map((g) => g.padStart(4, "0")).join("");
}

function parseCidr(cidr: string): Parsed | null {
  const [ip, lenStr] = cidr.split("/");
  const p = parseIp(ip!);
  if (!p) return null;
  const len = lenStr === undefined ? (p.v6 ? 128 : 32) : Number(lenStr);
  return { bits: p.bits, len, v6: p.v6 };
}

const compiled: { provider: string; cidr: Parsed }[] = [];
for (const [provider, list] of Object.entries(ranges as Record<string, string[]>)) {
  for (const c of list) {
    const p = parseCidr(c);
    if (p) compiled.push({ provider, cidr: p });
  }
}

/** Returns the provider id whose published range contains `ip`, or null. Most specific match wins. */
export function matchIp(ip: string): string | null {
  const p = parseIp(ip);
  if (!p) return null;
  const total = p.v6 ? 128n : 32n;
  let best: { provider: string; len: number } | null = null;
  for (const { provider, cidr } of compiled) {
    if (cidr.v6 !== p.v6) continue;
    const shift = total - BigInt(cidr.len);
    if (p.bits >> shift === cidr.bits >> shift && (!best || cidr.len > best.len)) {
      best = { provider, len: cidr.len };
    }
  }
  return best?.provider ?? null;
}
