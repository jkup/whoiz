import { describe, expect, it } from "vitest";
import type { HostResult, ScanResult, UrlResult, Verdict } from "../src/model.js";
import { renderPng, renderSvg } from "../src/render/image.js";

const V = (origin: string, edge?: string): Verdict => ({
  origin: { provider: origin, confidence: "high", score: 10, reasons: [] },
  edge: edge ? { provider: edge, confidence: "high", score: 10, reasons: [] } : undefined,
});
const u = (path: string, v: Verdict): UrlResult => ({
  url: `https://a.com${path}`,
  path,
  host: "a.com",
  response: {
    url: `https://a.com${path}`,
    status: 200,
    headers: {},
    redirectChain: [],
    finalUrl: "",
  },
  verdict: v,
});
const root: HostResult = {
  host: "a.com",
  evidence: { host: "a.com", cnames: [], ips: ["104.16.1.1"] },
  verdict: V("vercel", "cloudflare"),
  urls: [
    u("/", V("vercel", "cloudflare")),
    u("/shop", V("shopify", "cloudflare")),
    u("/x<y>&z", V("vercel", "cloudflare")),
  ],
};
const scan: ScanResult = {
  input: "a.com",
  root,
  subdomains: [],
  stats: { urls: 3, providers: ["vercel", "cloudflare", "shopify"], subdomains: 0, ms: 900 },
  version: "0.0.0",
};

describe("renderSvg", () => {
  it("emits a well-formed card with providers, connectors and attribution", () => {
    const svg = renderSvg(scan, { why: false, all: false });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(">Vercel<");
    expect(svg).toContain(">Shopify<");
    expect(svg).toContain("via");
    expect(svg).toContain("npx @jkup/whoiz a.com");
    expect(svg).toContain('color="#F38020"'); // Cloudflare cloud icon
    expect(svg).toContain("<line"); // connectors are geometry, not glyphs
    expect(svg).toContain("/x&lt;y&gt;&amp;z"); // escaped
  });
});

describe("renderPng", () => {
  it("rasterises to a PNG", async () => {
    const png = await renderPng(renderSvg(scan, { why: false, all: false }), 1);
    expect(Buffer.from(png.slice(0, 8))).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });
});
