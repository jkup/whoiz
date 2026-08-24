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
  while (queue.length && urls.size < max && fetched < 8) {
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
      if (entry?.loc && urls.size < max) urls.add(String(entry.loc).trim());
    }
  }
  return [...urls];
}
