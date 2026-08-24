# whoiz

**Who is actually serving this site?**

`whoiz` takes a domain, enumerates its endpoints (sitemap, robots.txt, and a polite shallow crawl), and fingerprints the CDN *and* the hosting provider behind every path and subdomain — then draws you a tree.

```
$ npx @jkup/whoiz jonkuperman.com

  whoiz  jonkuperman.com

  jonkuperman.com                         ▲ Vercel  via ☁ Cloudflare
  │  104.26.7.114 +5 · AS13335 Cloudflare · TLS by Google Trust Services
  │
  ├─ /contact                             ☁ Cloudflare  no upstream seen
  ├─ 12 paths                             ▲ Vercel  via ☁ Cloudflare  same as host
  │  /, /about, /blog (8), /feed (2)
  │
  ├─ api.jonkuperman.com                  ✈ Fly.io
  │  │  66.241.124.7 · AS40509 Fly.io · CNAME x.fly.dev
  └─ docs.jonkuperman.com                 ◆ GitHub Pages  via ☁ Cloudflare
     │  104.21.4.1 +3 · AS13335 Cloudflare · CNAME jon.github.io

  16 URLs · 4 providers · 2 subdomains · 1.8s
```

Paths that are served exactly like the host are folded into one line so the *differences* stand out. Use `--all` to see every path, and `--why` to see the evidence behind each verdict.

## Install

```
npx @jkup/whoiz vercel.com    # no install
npm i -g @jkup/whoiz          # or globally, then just `whoiz`
```

Requires Node 20+.

## Usage

```
whoiz <domain or URL> [options]

  --json               machine-readable output with full evidence
  --why                show the evidence behind each verdict
  --all                don't collapse identical siblings or truncate long lists
  -d, --depth <n>      crawl depth (default 2)
  -m, --max <n>        maximum URLs to fetch (default 100)
  -c, --concurrency    parallel requests (default 4)
  -t, --timeout <ms>   per-request timeout (default 8000)
  --no-crawl           only use sitemap, robots.txt and the homepage
  --no-subdomains      ignore other hosts under the same domain
  --ascii              plain ASCII tree characters
  --no-color           disable colours (also honours NO_COLOR)
```

## How it works

Every host gets resolved (CNAME chain, A/AAAA, ASN via Team Cymru DNS, TLS issuer), and every URL gets one GET with redirects tracked. A table of declarative rules scores the evidence per provider on two layers:

- **edge** — who terminates the connection: CNAME targets, published IP ranges, CDN headers like `cf-ray`, `x-amz-cf-pop`, `x-served-by: cache-…`
- **origin** — whose app-layer headers made it through the proxy: `x-vercel-id`, `x-nf-request-id`, `x-github-request-id`, `fly-request-id`, `x-render-origin-server`, …

If only edge signals fire, the CDN is either serving it directly (Pages, Workers, cached) or hiding the origin; whoiz says `no upstream seen` rather than guessing.

Recognised: Cloudflare (+ Pages), Vercel, Netlify, CloudFront, S3, Fastly, GitHub (+ Pages), Fly.io, Render, Google Cloud, Firebase, Azure, Akamai, Heroku, Railway, DigitalOcean, Hetzner, Shopify, Squarespace, Wix, Webflow, WordPress.com, Framer, Discourse, Ghost, HubSpot, Substack, GitBook, ReadMe, Zendesk, Statuspage, Mintlify. Adding one is a couple of lines in [`src/fingerprint/rules.ts`](src/fingerprint/rules.ts).

## Etiquette

whoiz identifies itself (`whoiz/<version> (+repo)`), obeys `robots.txt`, defaults to 4 concurrent requests and 100 URLs, backs off on the first `429`, and never follows links off the domain — other subdomains are only probed at their root plus a few linked pages. It only talks to the target and to DNS; there are no third-party APIs or telemetry.

## Limitations

- Endpoint discovery is best-effort: there is no way to list a site's routes from outside. SPAs and API-only hosts will mostly show their shell.
- A proxy that strips upstream headers makes the origin invisible. `no upstream seen` is an honest "don't know", not "there is nothing behind it".
- No JavaScript rendering.

## Development

```
npm install
npm run dev -- vercel.com      # run from source
npm test                       # vitest
npm run update-ranges          # refresh bundled CDN IP ranges
npm run build                  # dist/cli.js
```

MIT © Jon Kuperman
