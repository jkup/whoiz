import { describe, expect, it } from "vitest";
import type { UrlResult, Verdict } from "../src/model.js";
import { buildTree } from "../src/tree/build.js";

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

describe("buildTree", () => {
  it("collapses subtrees with one verdict and keeps mixed ones open", () => {
    const t = buildTree([
      u("/", V("vercel")),
      u("/blog", V("vercel")),
      u("/blog/a", V("vercel")),
      u("/blog/b", V("vercel")),
      u("/docs", V("github-pages", "cloudflare")),
      u("/docs/x", V("vercel")),
    ]);
    expect(t.result?.path).toBe("/");
    const blog = t.children.find((c) => c.label === "/blog")!;
    expect(blog.count).toBe(3);
    expect(blog.collapsed?.origin.provider).toBe("vercel");
    const docs = t.children.find((c) => c.label === "/docs")!;
    expect(docs.collapsed).toBeUndefined();
    expect(docs.children).toHaveLength(1);
  });

  it("merges empty intermediate directories into one label", () => {
    const t = buildTree([u("/a/b/c", V("fly"))]);
    expect(t.children[0]?.label).toBe("/a/b/c");
    expect(t.children[0]?.count).toBe(1);
  });
});
