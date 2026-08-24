import { describe, expect, it } from "vitest";
import { fingerprint, sameVerdict } from "../src/fingerprint/score.js";
import type { HostEvidence, ResponseEvidence } from "../src/model.js";

const host = (over: Partial<HostEvidence> = {}): HostEvidence => ({
  host: "example.com",
  cnames: [],
  ips: [],
  ...over,
});
const res = (headers: Record<string, string>): ResponseEvidence => ({
  url: "https://example.com/",
  status: 200,
  headers,
  redirectChain: [],
  finalUrl: "https://example.com/",
});

describe("fingerprint", () => {
  it("Vercel behind Cloudflare → origin vercel, edge cloudflare", () => {
    const v = fingerprint(
      host({ ips: ["104.16.1.1"], asn: { number: 13335, org: "CLOUDFLARENET" } }),
      res({
        server: "cloudflare",
        "cf-ray": "8b1-LHR",
        "x-vercel-id": "lhr1::abc",
        "x-vercel-cache": "HIT",
      }),
    );
    expect(v.origin.provider).toBe("vercel");
    expect(v.edge?.provider).toBe("cloudflare");
    expect(v.origin.confidence).toBe("high");
  });

  it("Vercel direct → single provider, no edge shown", () => {
    const v = fingerprint(
      host({ cnames: ["cname.vercel-dns.com"], ips: ["76.76.21.21"] }),
      res({ server: "Vercel", "x-vercel-id": "x" }),
    );
    expect(v.origin.provider).toBe("vercel");
    expect(v.edge).toBeUndefined();
  });

  it("Cloudflare only → note no upstream", () => {
    const v = fingerprint(
      host({ ips: ["104.16.1.1"] }),
      res({ server: "cloudflare", "cf-ray": "x" }),
    );
    expect(v.origin.provider).toBe("cloudflare");
    expect(v.note).toBe("no upstream seen");
  });

  it("Cloudflare Pages via CNAME", () => {
    const v = fingerprint(
      host({ cnames: ["my-site.pages.dev"], ips: ["104.16.1.1"] }),
      res({ server: "cloudflare", "cf-ray": "x" }),
    );
    expect(v.origin.provider).toBe("cloudflare-pages");
    expect(v.edge?.provider).toBe("cloudflare");
  });

  it("S3 behind CloudFront", () => {
    const v = fingerprint(
      host({ cnames: ["d123.cloudfront.net"], ips: ["13.32.1.1"] }),
      res({
        server: "AmazonS3",
        "x-amz-cf-id": "abc",
        "x-amz-cf-pop": "LHR3-C1",
        via: "1.1 abc.cloudfront.net (CloudFront)",
      }),
    );
    expect(v.origin.provider).toBe("aws-s3");
    expect(v.edge?.provider).toBe("cloudfront");
  });

  it("GitHub Pages → origin github-pages, edge fastly", () => {
    const v = fingerprint(
      host({ cnames: ["user.github.io"], ips: ["185.199.108.153"] }),
      res({
        server: "GitHub.com",
        "x-github-request-id": "x",
        "x-served-by": "cache-lhr7395-LHR",
        "x-fastly-request-id": "y",
      }),
    );
    expect(v.origin.provider).toBe("github-pages");
    expect(v.edge?.provider).toBe("fastly");
  });

  it("github.com itself is GitHub, not GitHub Pages", () => {
    const v = fingerprint(
      host({ ips: ["140.82.121.4"] }),
      res({ server: "GitHub.com", "x-github-request-id": "x" }),
    );
    expect(v.origin.provider).toBe("github");
  });

  it("Netlify direct", () => {
    const v = fingerprint(
      host({ cnames: ["site.netlify.app"], ips: ["75.2.60.5"] }),
      res({ server: "Netlify", "x-nf-request-id": "x" }),
    );
    expect(v.origin.provider).toBe("netlify");
    expect(v.edge).toBeUndefined();
  });

  it("nothing recognisable → unknown", () => {
    const v = fingerprint(host({ ips: ["203.0.113.1"] }), res({ server: "nginx" }));
    expect(v.origin.provider).toBe("unknown");
    expect(v.origin.confidence).toBe("low");
  });

  it("a weak cloud ASN does not override a strong edge host (Vercel on AWS)", () => {
    const v = fingerprint(
      host({ ips: ["64.239.1.1"], asn: { number: 16509, org: "AMAZON-02" } }),
      res({ server: "Vercel", "x-vercel-id": "x" }),
    );
    expect(v.origin.provider).toBe("vercel");
  });

  it("sameVerdict compares edge and origin", () => {
    const a = fingerprint(
      host({ ips: ["104.16.1.1"] }),
      res({ "cf-ray": "x", "x-vercel-id": "y" }),
    );
    const b = fingerprint(host({ ips: ["104.16.1.1"] }), res({ "cf-ray": "x" }));
    expect(sameVerdict(a, a)).toBe(true);
    expect(sameVerdict(a, b)).toBe(false);
  });
});
