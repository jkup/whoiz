import { Parser } from "htmlparser2";
import pLimit from "p-limit";
import { getDomain } from "tldts";
import { type Fetched, fetchUrl } from "../net/fetch.js";

const SKIP_EXT =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|pdf|zip|gz|tar|dmg|exe|wasm)$/i;

export interface CrawlOptions {
  depth: number;
  max: number;
  concurrency: number;
  timeout: number;
  userAgent: string;
  isAllowed: (url: string) => boolean;
  onProgress?: (fetched: number, queued: number) => void;
}

export interface CrawlSeed {
  url: string;
  depth: number;
}

export interface Crawled {
  host: string;
  results: Fetched[];
  /** Other hosts under the same registrable domain that were linked to, with sample URLs. */
  subdomains: Map<string, Set<string>>;
}

/** Normalise a URL for dedupe: drop hash + query, trailing slash (except root). */
export function normalize(raw: string, base?: string): string | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.search = "";
  u.hostname = u.hostname.toLowerCase();
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  if (SKIP_EXT.test(u.pathname)) return null;
  return u.toString();
}

export function extractLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const parser = new Parser({
    onopentag(name, attrs) {
      const href =
        name === "a"
          ? attrs.href
          : name === "link" && /alternate|canonical/.test(attrs.rel ?? "")
            ? attrs.href
            : undefined;
      if (!href || href.startsWith("#")) return;
      const n = normalize(href, base);
      if (n) out.add(n);
    },
  });
  parser.write(html);
  parser.end();
  return [...out];
}

export async function crawl(
  host: string,
  seeds: CrawlSeed[],
  opts: CrawlOptions,
): Promise<Crawled> {
  const apex = getDomain(host) ?? host;
  const limit = pLimit(opts.concurrency);
  const seen = new Set<string>();
  const results: Fetched[] = [];
  const subdomains = new Map<string, Set<string>>();
  let queue: CrawlSeed[] = [];
  let backoff = false;

  const enqueue = (url: string, depth: number) => {
    const n = normalize(url);
    if (!n || seen.has(n)) return;
    const h = new URL(n).hostname;
    if (h !== host) {
      if (getDomain(h) === apex && h !== `www.${host}` && `www.${h}` !== host) {
        const set = subdomains.get(h) ?? new Set<string>();
        if (set.size < 5) set.add(n);
        subdomains.set(h, set);
      }
      return;
    }
    if (!opts.isAllowed(n)) return;
    seen.add(n);
    queue.push({ url: n, depth });
  };

  for (const s of seeds) enqueue(s.url, s.depth);

  while (queue.length && results.length < opts.max && !backoff) {
    const batch = queue.splice(0, Math.max(1, Math.min(queue.length, opts.max - results.length)));
    const next: CrawlSeed[] = [];
    await Promise.all(
      batch.map((item) =>
        limit(async () => {
          if (backoff) return;
          const res = await fetchUrl(item.url, {
            timeout: opts.timeout,
            userAgent: opts.userAgent,
            wantBody: item.depth < opts.depth,
          });
          results.push(res);
          opts.onProgress?.(results.length, queue.length + next.length);
          if (res.status === 429) backoff = true;
          if (res.body && item.depth < opts.depth) {
            for (const link of extractLinks(res.body, res.finalUrl))
              next.push({ url: link, depth: item.depth + 1 });
          }
        }),
      ),
    );
    queue = [];
    for (const n of next) enqueue(n.url, n.depth);
  }
  return { host, results, subdomains };
}
