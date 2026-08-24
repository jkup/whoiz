import { describe, expect, it } from "vitest";
import { matchIp } from "../src/net/ip.js";

describe("matchIp", () => {
  it("matches Cloudflare v4 and v6", () => {
    expect(matchIp("104.16.1.1")).toBe("cloudflare");
    expect(matchIp("2606:4700::6810:1")).toBe("cloudflare");
  });
  it("matches Vercel and GitHub Pages", () => {
    expect(matchIp("76.76.21.21")).toBe("vercel");
    expect(matchIp("185.199.108.153")).toBe("github-pages");
  });
  it("prefers the most specific range (CloudFront over generic AWS)", () => {
    expect(matchIp("13.32.0.1")).toBe("cloudfront");
  });
  it("returns null for unknown / invalid", () => {
    expect(matchIp("203.0.113.1")).toBeNull();
    expect(matchIp("not-an-ip")).toBeNull();
  });
});
