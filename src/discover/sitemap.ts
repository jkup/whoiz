import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: true });

async function getText(url: string, ua: string, timeout: number): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "user-agent": ua },
      signal: AbortSignal.timeout(timeout),
    });
    if (!r.ok) return null;
    if (r.headers.get("content-type")?.includes("text/html")) return null;
    return (await r.text()).slice(0, 4 * 1024 * 1024);
  } catch {
    return null;
  }
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Collects URLs from sitemap.xml (following sitemap indexes) up to `max`. */
export async function loadSitemaps(
  candidates: string[],
  ua: string,
  timeout: number,
  max: number,
): Promise<string[]> {
  const urls = new Set<string>();
  const seen = new Set<string>();
  const queue = [...candidates];
  let fetched = 0;
  // Read well past `max` so sampling can spread across sections instead of taking the first sitemap only.
  const pool = Math.max(max * 20, 2000);
  while (queue.length && urls.size < pool && fetched < 8) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    const xml = await getText(sm, ua, timeout);
    if (!xml) continue;
    fetched++;
    let doc: Record<string, unknown>;
    try {
      doc = parser.parse(xml);
    } catch {
      continue;
    }
    const index = doc.sitemapindex as { sitemap?: unknown } | undefined;
    const set = doc.urlset as { url?: unknown } | undefined;
    for (const entry of asArray(
      index?.sitemap as { loc?: string }[] | { loc?: string } | undefined,
    )) {
      if (entry?.loc) queue.push(String(entry.loc).trim());
    }
    for (const entry of asArray(set?.url as { loc?: string }[] | { loc?: string } | undefined)) {
      if (entry?.loc && urls.size < pool) urls.add(String(entry.loc).trim());
    }
  }
  return diversify([...urls], max);
}

/**
 * Pick up to `max` URLs spread across top-level path prefixes (round-robin) so a
 * 5,000-entry /blog doesn't crowd out /docs, /pricing and /api.
 */
export function diversify(urls: string[], max: number): string[] {
  if (urls.length <= max) return urls;
  const groups = new Map<string, string[]>();
  for (const u of urls) {
    let key = "/";
    try {
      key = new URL(u).pathname.split("/")[1] ?? "/";
    } catch {
      /* keep "/" */
    }
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  const out: string[] = [];
  const lists = [...groups.values()];
  for (let i = 0; out.length < max; i++) {
    let took = false;
    for (const list of lists) {
      const u = list[i];
      if (u !== undefined && out.length < max) {
        out.push(u);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}
