/**
 * Regenerates src/data/ranges.json from each provider's published IP list.
 * Run: npm run update-ranges
 */
import { writeFileSync } from "node:fs";

type Ranges = Record<string, string[]>;

async function text(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "whoiz-update-ranges" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
}
async function json<T>(url: string): Promise<T> {
  return JSON.parse(await text(url)) as T;
}

const out: Ranges = {};

out.cloudflare = [
  ...(await text("https://www.cloudflare.com/ips-v4")).trim().split("\n"),
  ...(await text("https://www.cloudflare.com/ips-v6")).trim().split("\n"),
];

const aws = await json<{
  prefixes: { ip_prefix: string; service: string }[];
  ipv6_prefixes: { ipv6_prefix: string; service: string }[];
}>("https://ip-ranges.amazonaws.com/ip-ranges.json");
out.cloudfront = [
  ...aws.prefixes.filter((p) => p.service === "CLOUDFRONT").map((p) => p.ip_prefix),
  ...aws.ipv6_prefixes.filter((p) => p.service === "CLOUDFRONT").map((p) => p.ipv6_prefix),
];
// Whole EC2 space is huge; keep only /8–/13 aggregates for a weak "somewhere on AWS" signal.
out.aws = [
  ...new Set(aws.prefixes.filter((p) => p.service === "EC2").map((p) => p.ip_prefix)),
].filter((p) => Number(p.split("/")[1]) <= 13);

const fastly = await json<{ addresses: string[]; ipv6_addresses: string[] }>(
  "https://api.fastly.com/public-ip-list",
);
out.fastly = [...fastly.addresses, ...fastly.ipv6_addresses];

const gh = await json<{ pages: string[] }>("https://api.github.com/meta");
out["github-pages"] = gh.pages;

const gcp = await json<{ prefixes: { ipv4Prefix?: string; ipv6Prefix?: string }[] }>(
  "https://www.gstatic.com/ipranges/cloud.json",
);
out.google = gcp.prefixes
  .map((p) => p.ipv4Prefix ?? p.ipv6Prefix!)
  .filter((p) => Number(p.split("/")[1]) <= 16);

out.vercel = ["76.76.21.0/24", "76.223.126.88/32", "64.29.17.0/24"];

writeFileSync(
  new URL("../src/data/ranges.json", import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(
  Object.entries(out)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join("\n"),
);
