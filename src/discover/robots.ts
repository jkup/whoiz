import { createRequire } from "node:module";

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getSitemaps(): string[];
}
const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  txt: string,
) => Robot;

export interface Robots {
  isAllowed: (url: string) => boolean;
  sitemaps: string[];
}

export async function loadRobots(origin: string, ua: string, timeout: number): Promise<Robots> {
  const url = `${origin}/robots.txt`;
  let text = "";
  try {
    const r = await fetch(url, {
      headers: { "user-agent": ua },
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });
    if (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) {
      text = (await r.text()).slice(0, 256 * 1024);
    }
  } catch {
    /* no robots.txt — everything allowed */
  }
  const parsed = robotsParser(url, text);
  return {
    isAllowed: (u) => parsed.isAllowed(u, "whoiz") !== false,
    sitemaps: parsed.getSitemaps(),
  };
}
