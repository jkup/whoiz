import { Agent, request } from "undici";
import type { ResponseEvidence } from "../model.js";

export interface FetchOptions {
  timeout: number;
  userAgent: string;
  /** Read the body when it's HTML (for link extraction). */
  wantBody?: boolean;
  maxBody?: number;
}

export interface Fetched extends ResponseEvidence {
  body?: string;
}

const agent = new Agent({ connect: { timeout: 8000 }, pipelining: 1 });

function flatten(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

/** GET with manual redirect following (max 5) so the whole chain is recorded. */
export async function fetchUrl(url: string, opts: FetchOptions): Promise<Fetched> {
  const chain: string[] = [];
  let current = url;
  let lastHeaders: Record<string, string> = {};
  let lastStatus = 0;
  for (let hop = 0; hop < 6; hop++) {
    try {
      const res = await request(current, {
        method: "GET",
        dispatcher: agent,
        headersTimeout: opts.timeout,
        bodyTimeout: opts.timeout,
        headers: {
          "user-agent": opts.userAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en",
        },
      });
      lastHeaders = flatten(res.headers);
      lastStatus = res.statusCode;
      const loc = lastHeaders.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
        await res.body.dump();
        chain.push(current);
        current = new URL(loc, current).toString();
        continue;
      }
      const ct = lastHeaders["content-type"] ?? "";
      let body: string | undefined;
      if (opts.wantBody && /text\/html|application\/xhtml/i.test(ct)) {
        body = await readCapped(res.body, opts.maxBody ?? 512 * 1024);
      } else {
        await res.body.dump();
      }
      return {
        url,
        status: res.statusCode,
        headers: lastHeaders,
        redirectChain: chain,
        finalUrl: current,
        contentType: ct,
        body,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        url,
        status: lastStatus,
        headers: lastHeaders,
        redirectChain: chain,
        finalUrl: current,
        error: msg,
      };
    }
  }
  return {
    url,
    status: lastStatus,
    headers: lastHeaders,
    redirectChain: chain,
    finalUrl: current,
    error: "too many redirects",
  };
}

async function readCapped(
  body: AsyncIterable<Uint8Array> & { destroy?: () => void },
  max: number,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    chunks.push(chunk);
    size += chunk.length;
    if (size >= max) {
      body.destroy?.();
      break;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}
