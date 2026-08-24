import { describe, expect, it } from "vitest";
import { extractLinks, normalize } from "../src/discover/crawl.js";

describe("normalize", () => {
  it("drops hash, query and trailing slash", () => {
    expect(normalize("https://a.com/x/?q=1#h")).toBe("https://a.com/x");
    expect(normalize("https://a.com/")).toBe("https://a.com/");
  });
  it("rejects non-http and asset URLs", () => {
    expect(normalize("mailto:x@a.com")).toBeNull();
    expect(normalize("https://a.com/logo.png")).toBeNull();
  });
  it("resolves relative links", () => {
    expect(normalize("../b", "https://a.com/x/y")).toBe("https://a.com/b");
  });
});

describe("extractLinks", () => {
  it("collects anchors and canonical/alternate links", () => {
    const html = `<a href="/about">a</a><a href="https://api.a.com/v1">b</a><link rel="alternate" href="/feed.xml"><a href="#top">c</a><a href="/img.png">d</a>`;
    expect(extractLinks(html, "https://a.com/")).toEqual([
      "https://a.com/about",
      "https://api.a.com/v1",
      "https://a.com/feed.xml",
    ]);
  });
});
