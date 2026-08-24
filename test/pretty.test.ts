import { describe, expect, it } from "vitest";
import type { HostResult, ScanResult, UrlResult, Verdict } from "../src/model.js";
import { renderPretty } from "../src/render/pretty.js";

const V = (origin: string, edge?: string, note?: string): Verdict => ({
  origin: {
    provider: origin,
    confidence: "high",
    score: 10,
    reasons: [{ rule: "r", provider: origin, layer: "origin", weight: 10, detail: "x-test: 1" }],
  },
  edge: edge ? { provider: edge, confidence: "high", score: 10, reasons: [] } : undefined,
  note,
});
const u = (host: string, path: string, v: Verdict, status = 200): UrlResult => ({
  url: `https://${host}${path}`,
  path,
  host,
  response: { url: `https://${host}${path}`, status, headers: {}, redirectChain: [], finalUrl: "" },
  verdict: v,
});
const root: HostResult = {
  host: "jonkuperman.com",
  evidence: {
    host: "jonkuperman.com",
    cnames: [],
    ips: ["104.26.7.114", "104.26.6.114"],
    asn: { number: 13335, org: "CLOUDFLARENET - Cloudflare, Inc." },
    cert: { issuer: "Google Trust Services", sans: [] },
  },
  verdict: V("vercel", "cloudflare"),
  urls: [
    u("jonkuperman.com", "/", V("vercel", "cloudflare")),
    u("jonkuperman.com", "/about", V("vercel", "cloudflare")),
    u("jonkuperman.com", "/blog/a", V("vercel", "cloudflare")),
    u("jonkuperman.com", "/blog/b", V("vercel", "cloudflare")),
    u("jonkuperman.com", "/contact", V("cloudflare", undefined, "no upstream seen")),
    u("jonkuperman.com", "/old", V("vercel", "cloudflare"), 404),
  ],
};
const api: HostResult = {
  host: "api.jonkuperman.com",
  evidence: { host: "api.jonkuperman.com", cnames: ["x.fly.dev"], ips: ["66.241.1.1"] },
  verdict: V("fly"),
  urls: [u("api.jonkuperman.com", "/", V("fly"))],
};
const scan: ScanResult = {
  input: "jonkuperman.com",
  root,
  subdomains: [api],
  stats: { urls: 7, providers: ["vercel", "cloudflare", "fly"], subdomains: 1, ms: 1834 },
  version: "0.0.0",
};

describe("renderPretty", () => {
  it("renders a grouped, aligned tree", () => {
    const out = renderPretty(scan, { why: false, all: false, ascii: true });
    expect(out).toMatchInlineSnapshot(`
      "
        whoiz  jonkuperman.com

        jonkuperman.com                         Vercel  via Cloudflare
        |  104.26.7.114 +1 - AS13335 Cloudflare - TLS by Google Trust Services
        |
        |- /contact                             Cloudflare  no upstream seen
        |- 5 paths                              Vercel  via Cloudflare  same as host
        |  /, /about, /blog (2), /old
        |
        \`- api.jonkuperman.com                  Fly.io
           |  66.241.1.1 - CNAME x.fly.dev

        7 URLs - 3 providers - 1 subdomain - 1.8s
      "
    `);
  });

  it("--all expands every path and --why prints evidence", () => {
    const out = renderPretty(scan, { why: true, all: true, ascii: true });
    expect(out).toContain("/blog/a");
    expect(out).toMatch(/\/old\s+Vercel {2}404/);
    expect(out).toContain("r: x-test: 1");
  });
});
