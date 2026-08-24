import { getDomain } from "tldts";
import { crawl, normalize } from "./discover/crawl.js";
import { loadRobots } from "./discover/robots.js";
import { loadSitemaps } from "./discover/sitemap.js";
import { collectReasons, fingerprint, verdictFrom } from "./fingerprint/score.js";
import type { HostEvidence, HostResult, ScanOptions, ScanResult, UrlResult } from "./model.js";
import { lookupAsn, resolveHost } from "./net/dns.js";
import { type Fetched, fetchUrl } from "./net/fetch.js";
import { certInfo } from "./net/tls.js";

export const VERSION = "0.1.0";
const UA = `whoiz/${VERSION} (+https://github.com/jkup/whoiz)`;

export function parseTarget(input: string): string {
  let s = input.trim();
  if (!/^[a-z]+:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  return u.hostname.toLowerCase();
}

async function hostEvidence(host: string, timeout: number): Promise<HostEvidence> {
  const [dns, cert] = await Promise.all([resolveHost(host), certInfo(host, timeout)]);
  const asn = dns.ips[0] ? await lookupAsn(dns.ips[0]) : undefined;
  return { host, cnames: dns.cnames, ips: dns.ips, asn, cert };
}

function toUrlResult(host: string, ev: HostEvidence, res: Fetched): UrlResult {
  const { body: _body, ...response } = res;
  const path = new URL(res.url).pathname || "/";
  return { url: res.url, path, host, response, verdict: fingerprint(ev, response) };
}

/** Host-level verdict: DNS/TLS evidence + the headers seen on the root response. */
function hostVerdict(ev: HostEvidence, root?: Fetched) {
  return verdictFrom(collectReasons(ev, root));
}

export async function scan(input: string, opts: ScanOptions): Promise<ScanResult> {
  const started = Date.now();
  const progress = opts.onProgress ?? (() => {});
  let host = parseTarget(input);

  progress(`resolving ${host}`);
  let ev = await hostEvidence(host, opts.timeout);
  if (!ev.ips.length) {
    return {
      input,
      root: {
        host,
        evidence: ev,
        verdict: { origin: { provider: "unknown", confidence: "low", score: 0, reasons: [] } },
        urls: [],
        error: "could not resolve",
      },
      subdomains: [],
      stats: { urls: 0, providers: [], subdomains: 0, ms: Date.now() - started },
      version: VERSION,
    };
  }

  progress(`fetching https://${host}/`);
  let rootRes = await fetchUrl(`https://${host}/`, {
    timeout: opts.timeout,
    userAgent: UA,
    wantBody: true,
  });
  // Follow a canonical redirect (apex -> www or vice versa) so the tree is built on the real host.
  const finalHost = new URL(rootRes.finalUrl).hostname.toLowerCase();
  if (finalHost !== host && getDomain(finalHost) === getDomain(host)) {
    host = finalHost;
    progress(`redirected to ${host}, resolving`);
    ev = await hostEvidence(host, opts.timeout);
    rootRes = await fetchUrl(`https://${host}/`, {
      timeout: opts.timeout,
      userAgent: UA,
      wantBody: true,
    });
  }
  const origin = `https://${host}`;

  progress("reading robots.txt and sitemaps");
  const robots = await loadRobots(origin, UA, opts.timeout);
  const sitemapUrls = await loadSitemaps(
    [...robots.sitemaps, `${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`],
    UA,
    opts.timeout,
    opts.max,
  );

  const seeds = [
    { url: `${origin}/`, depth: 0 },
    ...sitemapUrls.map((u) => ({ url: u, depth: opts.depth })),
  ];
  const crawled = await crawl(host, seeds, {
    depth: opts.crawl ? opts.depth : 0,
    max: opts.max,
    concurrency: opts.concurrency,
    timeout: opts.timeout,
    userAgent: UA,
    isAllowed: robots.isAllowed,
    onProgress: (n, q) =>
      progress(`scanned ${n} URL${n === 1 ? "" : "s"}${q ? `, ${q} queued` : ""}`),
  });

  // Re-use the already fetched root response instead of the crawler's copy when present.
  const rootEntry = crawled.results.find((r) => normalize(r.url) === normalize(`${origin}/`));
  if (!rootEntry) crawled.results.unshift(rootRes);
  const urls = crawled.results.map((r) => toUrlResult(host, ev, r));
  const root: HostResult = { host, evidence: ev, verdict: hostVerdict(ev, rootRes), urls };

  const subdomains: HostResult[] = [];
  if (opts.subdomains) {
    const hosts = [...crawled.subdomains.entries()].slice(0, 12);
    for (const [sub, sample] of hosts) {
      progress(`checking ${sub}`);
      const sev = await hostEvidence(sub, opts.timeout);
      if (!sev.ips.length) continue;
      const subRoot = await fetchUrl(`https://${sub}/`, { timeout: opts.timeout, userAgent: UA });
      const extra = [...sample].filter((u) => new URL(u).pathname !== "/").slice(0, 3);
      const extraRes = await Promise.all(
        extra.map((u) => fetchUrl(u, { timeout: opts.timeout, userAgent: UA })),
      );
      const subUrls = [subRoot, ...extraRes].map((r) => toUrlResult(sub, sev, r));
      subdomains.push({
        host: sub,
        evidence: sev,
        verdict: hostVerdict(sev, subRoot),
        urls: subUrls,
      });
    }
  }

  const providers = new Set<string>();
  for (const h of [root, ...subdomains]) {
    providers.add(h.verdict.origin.provider);
    if (h.verdict.edge) providers.add(h.verdict.edge.provider);
    for (const u of h.urls) {
      providers.add(u.verdict.origin.provider);
      if (u.verdict.edge) providers.add(u.verdict.edge.provider);
    }
  }
  providers.delete("unknown");

  return {
    input,
    root,
    subdomains,
    stats: {
      urls: urls.length + subdomains.reduce((s, h) => s + h.urls.length, 0),
      providers: [...providers],
      subdomains: subdomains.length,
      ms: Date.now() - started,
    },
    version: VERSION,
  };
}
