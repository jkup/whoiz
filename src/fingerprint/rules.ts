import type { HostEvidence, Layer, ResponseEvidence } from "../model.js";
import { matchIp } from "../net/ip.js";

export interface Rule {
  id: string;
  provider: string;
  layer: Layer;
  weight: number;
  test: (host: HostEvidence, res?: ResponseEvidence) => string | null;
}

const cname = (
  id: string,
  provider: string,
  layer: Layer,
  suffixes: string[],
  weight = 10,
): Rule => ({
  id,
  provider,
  layer,
  weight,
  test: (h) => {
    const hit = h.cnames.find((c) => suffixes.some((s) => c === s || c.endsWith(`.${s}`)));
    return hit ? `CNAME → ${hit}` : null;
  },
});

const header = (
  id: string,
  provider: string,
  layer: Layer,
  name: string,
  weight = 8,
  valueRe?: RegExp,
): Rule => ({
  id,
  provider,
  layer,
  weight,
  test: (_h, r) => {
    const v = r?.headers[name];
    if (v === undefined) return null;
    if (valueRe && !valueRe.test(v)) return null;
    return `${name}: ${truncate(v)}`;
  },
});

const asn = (id: string, provider: string, layer: Layer, numbers: number[], weight = 6): Rule => ({
  id,
  provider,
  layer,
  weight,
  test: (h) => (h.asn && numbers.includes(h.asn.number) ? `AS${h.asn.number} ${h.asn.org}` : null),
});

const iprange = (id: string, provider: string, layer: Layer, weight = 7): Rule => ({
  id,
  provider,
  layer,
  weight,
  test: (h) => {
    for (const ip of h.ips) {
      const m = matchIp(ip);
      if (m === provider) return `${ip} in ${provider} range`;
    }
    return null;
  },
});

function truncate(s: string, n = 40): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export const RULES: Rule[] = [
  // Cloudflare
  cname("cf-cname", "cloudflare", "edge", ["cdn.cloudflare.net"]),
  cname("cf-pages-cname", "cloudflare-pages", "origin", ["pages.dev"]),
  header("cf-ray", "cloudflare", "edge", "cf-ray", 10),
  header("cf-server", "cloudflare", "edge", "server", 8, /^cloudflare/i),
  header("cf-cache", "cloudflare", "edge", "cf-cache-status", 4),
  asn("cf-asn", "cloudflare", "edge", [13335]),
  iprange("cf-ip", "cloudflare", "edge"),

  // Vercel
  cname("vercel-cname", "vercel", "edge", ["vercel-dns.com", "vercel.app", "vercel-dns-016.com"]),
  header("vercel-id", "vercel", "origin", "x-vercel-id", 10),
  header("vercel-cache", "vercel", "origin", "x-vercel-cache", 4),
  header("vercel-server", "vercel", "edge", "server", 8, /^vercel$/i),
  iprange("vercel-ip", "vercel", "edge"),

  // Netlify
  cname("netlify-cname", "netlify", "edge", ["netlify.app", "netlify.com", "netlifyglobalcdn.com"]),
  header("nf-request-id", "netlify", "origin", "x-nf-request-id", 10),
  header("netlify-server", "netlify", "edge", "server", 8, /^netlify/i),

  // AWS CloudFront + S3 + generic
  cname("cloudfront-cname", "cloudfront", "edge", ["cloudfront.net"]),
  header("cloudfront-id", "cloudfront", "edge", "x-amz-cf-id", 10),
  header("cloudfront-pop", "cloudfront", "edge", "x-amz-cf-pop", 6),
  header("cloudfront-via", "cloudfront", "edge", "via", 6, /cloudfront/i),
  header("s3-server", "aws-s3", "origin", "server", 9, /^AmazonS3$/i),
  header("s3-bucket", "aws-s3", "origin", "x-amz-bucket-region", 6),
  cname("s3-cname", "aws-s3", "origin", ["amazonaws.com"], 8),
  cname("elb-cname", "aws", "origin", ["elb.amazonaws.com", "awsglobalaccelerator.com"], 8),
  header("aws-alb", "aws", "origin", "server", 6, /^awselb/i),
  asn("aws-asn", "aws", "origin", [16509, 14618], 3),
  iprange("aws-ip", "aws", "origin", 3),

  // Fastly
  cname("fastly-cname", "fastly", "edge", ["fastly.net", "fastlylb.net"]),
  header("fastly-served-by", "fastly", "edge", "x-served-by", 9, /cache-[a-z0-9-]+/i),
  header("fastly-restarts", "fastly", "edge", "fastly-restarts", 6),
  header("fastly-debug", "fastly", "edge", "fastly-debug-digest", 6),
  asn("fastly-asn", "fastly", "edge", [54113]),
  iprange("fastly-ip", "fastly", "edge"),

  // GitHub — Pages is recognised by its CNAME / IP range; the request-id header is shared by all of GitHub.
  cname("gh-pages-cname", "github-pages", "origin", ["github.io"], 12),
  iprange("gh-pages-ip", "github-pages", "origin", 12),
  header("gh-request-id", "github", "origin", "x-github-request-id", 10),
  header("gh-server", "github", "origin", "server", 8, /^GitHub\.com$/i),
  asn("gh-asn", "github", "edge", [36459], 4),

  // Fly.io
  cname("fly-cname", "fly", "edge", ["fly.dev"]),
  header("fly-request-id", "fly", "origin", "fly-request-id", 10),
  header("fly-server", "fly", "edge", "server", 8, /^Fly\//i),
  asn("fly-asn", "fly", "edge", [40509]),

  // Render
  cname("render-cname", "render", "edge", ["onrender.com"]),
  header("render-origin", "render", "origin", "x-render-origin-server", 10),
  header("render-id", "render", "origin", "rndr-id", 8),

  // Google / Firebase
  cname("firebase-cname", "firebase", "edge", ["web.app", "firebaseapp.com"]),
  cname("google-cname", "google", "edge", [
    "ghs.googlehosted.com",
    "googleusercontent.com",
    "run.app",
  ]),
  header("firebase-served", "firebase", "origin", "x-served-by", 8, /firebase/i),
  header("google-server", "google", "edge", "server", 6, /^(gws|ESF|Google Frontend|sffe)$/i),
  header("google-trace", "google", "origin", "x-cloud-trace-context", 6),
  header("gcs-server", "google", "origin", "server", 6, /^UploadServer$/i),
  asn("google-asn", "google", "edge", [15169, 396982], 3),
  iprange("google-ip", "google", "edge", 3),

  // Azure
  cname("azure-cname", "azure", "edge", [
    "azurewebsites.net",
    "azureedge.net",
    "azurestaticapps.net",
    "azurefd.net",
    "trafficmanager.net",
    "cloudapp.azure.com",
  ]),
  header("azure-ref", "azure", "edge", "x-azure-ref", 9),
  header("azure-fdid", "azure", "edge", "x-fd-int-roxy-purgeid", 6),
  asn("azure-asn", "azure", "edge", [8075], 3),

  // Akamai
  cname("akamai-cname", "akamai", "edge", [
    "akamaiedge.net",
    "edgekey.net",
    "edgesuite.net",
    "akamaized.net",
    "akamai.net",
  ]),
  header("akamai-server", "akamai", "edge", "server", 8, /AkamaiGHost|AkamaiNetStorage/i),
  header("akamai-cache", "akamai", "edge", "x-akamai-transformed", 8),
  header("akamai-req", "akamai", "edge", "x-akamai-request-id", 8),
  asn("akamai-asn", "akamai", "edge", [20940, 16625], 4),

  // PaaS
  cname("heroku-cname", "heroku", "origin", ["herokuapp.com", "herokudns.com", "herokussl.com"]),
  header("heroku-via", "heroku", "origin", "via", 9, /heroku-router/i),
  cname("railway-cname", "railway", "origin", ["up.railway.app", "railway.app"]),
  header("railway-edge", "railway", "origin", "x-railway-edge", 9),
  header("railway-req", "railway", "origin", "x-railway-request-id", 9),
  cname("do-cname", "digitalocean", "origin", ["ondigitalocean.app"]),
  asn("do-asn", "digitalocean", "origin", [14061], 4),
  asn("hetzner-asn", "hetzner", "origin", [24940], 4),

  // Site builders
  cname("shopify-cname", "shopify", "origin", ["myshopify.com", "shops.myshopify.com"]),
  header("shopify-stage", "shopify", "origin", "x-shopify-stage", 9),
  header("shopify-shopid", "shopify", "origin", "x-shopid", 9),
  header("shopify-sorting", "shopify", "origin", "x-sorting-hat-shopid", 9),
  cname("squarespace-cname", "squarespace", "origin", ["squarespace.com"]),
  header("squarespace-server", "squarespace", "origin", "server", 9, /squarespace/i),
  cname("wix-cname", "wix", "origin", ["wixdns.net", "wixsite.com"]),
  header("wix-req", "wix", "origin", "x-wix-request-id", 9),
  cname("webflow-cname", "webflow", "origin", [
    "proxy-ssl.webflow.com",
    "webflow.io",
    "proxy.webflow.com",
  ]),
  header("webflow-lastmod", "webflow", "origin", "x-lambda-id", 3),
  cname("wp-cname", "wordpress", "origin", ["wordpress.com", "wpcomstaging.com", "pressable.com"]),
  header("wp-hosting", "wordpress", "origin", "x-hacker", 6),
  header("wp-nc", "wordpress", "origin", "x-nc", 5),
  cname("framer-cname", "framer", "origin", ["framer.app", "framer.website", "sites.framer.app"]),
  header("framer-server", "framer", "origin", "x-framer-request-id", 9),

  // Hosted SaaS
  cname("discourse-cname", "discourse", "origin", ["hosted-by-discourse.com", "discourse.cloud"]),
  header("discourse-route", "discourse", "origin", "x-discourse-route", 9),
  header("discourse-username", "discourse", "origin", "x-discourse-username", 6),
  cname("ghost-cname", "ghost", "origin", ["ghost.io"]),
  header("ghost-cache", "ghost", "origin", "x-ghost-cache-status", 9),
  cname("hubspot-cname", "hubspot", "origin", [
    "hs-sites.com",
    "hubspot.net",
    "hubspotpagebuilder.com",
    "sites.hubspot.net",
  ]),
  header("hubspot-hs", "hubspot", "origin", "x-hs-hub-id", 9),
  header("hubspot-cf", "hubspot", "origin", "x-hs-content-id", 6),
  cname("substack-cname", "substack", "origin", ["substack.com", "substackcdn.com"]),
  header("substack-server", "substack", "origin", "x-served-by-substack", 6),
  cname("gitbook-cname", "gitbook", "origin", ["gitbook.io", "hosting.gitbook.io"]),
  header("gitbook-header", "gitbook", "origin", "x-gitbook-site", 9),
  cname("readme-cname", "readme", "origin", ["readme.io", "ssl.readmessl.com"]),
  header("readme-header", "readme", "origin", "x-readme-cache", 6),
  cname("zendesk-cname", "zendesk", "origin", ["zendesk.com"]),
  cname("statuspage-cname", "statuspage", "origin", ["statuspage.io", "stspg-customer.com"]),
  cname("mintlify-cname", "mintlify", "origin", ["mintlify.app", "mintlify.dev"]),
  header("mintlify-header", "mintlify", "origin", "x-mintlify-cache", 6),
];
