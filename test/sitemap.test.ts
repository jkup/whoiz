import { describe, expect, it } from "vitest";
import { diversify } from "../src/discover/sitemap.js";

describe("diversify", () => {
  it("round-robins across top-level prefixes", () => {
    const urls = [
      ...Array.from({ length: 50 }, (_, i) => `https://a.com/blog/${i}`),
      "https://a.com/docs/x",
      "https://a.com/pricing",
      "https://a.com/",
    ];
    const out = diversify(urls, 6);
    expect(out).toHaveLength(6);
    expect(out).toContain("https://a.com/docs/x");
    expect(out).toContain("https://a.com/pricing");
    expect(out).toContain("https://a.com/");
    expect(out.filter((u) => u.includes("/blog/"))).toHaveLength(3);
  });
  it("returns input unchanged when under the cap", () => {
    expect(diversify(["https://a.com/x"], 5)).toEqual(["https://a.com/x"]);
  });
});
