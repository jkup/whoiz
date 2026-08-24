import type { Provider } from "../model.js";

const list: Provider[] = [
  { id: "cloudflare", name: "Cloudflare", glyph: "☁", color: "#F38020", fallback: "yellow" },
  {
    id: "cloudflare-pages",
    name: "Cloudflare Pages",
    glyph: "☁",
    color: "#F38020",
    fallback: "yellow",
  },
  { id: "vercel", name: "Vercel", glyph: "▲", color: "#FFFFFF", fallback: "white" },
  { id: "netlify", name: "Netlify", glyph: "◈", color: "#00C7B7", fallback: "cyan" },
  { id: "cloudfront", name: "CloudFront", glyph: "⌘", color: "#FF9900", fallback: "yellow" },
  { id: "aws", name: "AWS", glyph: "⌘", color: "#FF9900", fallback: "yellow" },
  { id: "aws-s3", name: "AWS S3", glyph: "⌘", color: "#569A31", fallback: "green" },
  { id: "fastly", name: "Fastly", glyph: "⚡", color: "#FF282D", fallback: "red" },
  { id: "github", name: "GitHub", glyph: "◆", color: "#B392F0", fallback: "magenta" },
  { id: "github-pages", name: "GitHub Pages", glyph: "◆", color: "#B392F0", fallback: "magenta" },
  { id: "fly", name: "Fly.io", glyph: "✈", color: "#8B5CF6", fallback: "magenta" },
  { id: "render", name: "Render", glyph: "◉", color: "#46E3B7", fallback: "green" },
  { id: "google", name: "Google Cloud", glyph: "●", color: "#4285F4", fallback: "blue" },
  { id: "firebase", name: "Firebase", glyph: "●", color: "#FFCA28", fallback: "yellow" },
  { id: "azure", name: "Azure", glyph: "◆", color: "#0078D4", fallback: "blue" },
  { id: "akamai", name: "Akamai", glyph: "◢", color: "#0096D6", fallback: "blue" },
  { id: "heroku", name: "Heroku", glyph: "⬢", color: "#A39BE8", fallback: "magenta" },
  { id: "railway", name: "Railway", glyph: "▮", color: "#B26CFF", fallback: "magenta" },
  { id: "digitalocean", name: "DigitalOcean", glyph: "◍", color: "#0080FF", fallback: "blue" },
  { id: "shopify", name: "Shopify", glyph: "◍", color: "#96BF48", fallback: "green" },
  { id: "squarespace", name: "Squarespace", glyph: "■", color: "#D9D9D9", fallback: "white" },
  { id: "wix", name: "Wix", glyph: "◐", color: "#FBBD2E", fallback: "yellow" },
  { id: "webflow", name: "Webflow", glyph: "◑", color: "#4353FF", fallback: "blue" },
  { id: "wordpress", name: "WordPress.com", glyph: "Ⓦ", color: "#21759B", fallback: "blue" },
  { id: "framer", name: "Framer", glyph: "◧", color: "#0055FF", fallback: "blue" },
  { id: "hetzner", name: "Hetzner", glyph: "▣", color: "#D50C2D", fallback: "red" },
  { id: "discourse", name: "Discourse", glyph: "◌", color: "#00A94F", fallback: "green" },
  { id: "ghost", name: "Ghost(Pro)", glyph: "◌", color: "#C8C8C8", fallback: "white" },
  { id: "hubspot", name: "HubSpot", glyph: "◌", color: "#FF7A59", fallback: "yellow" },
  { id: "substack", name: "Substack", glyph: "◌", color: "#FF6719", fallback: "yellow" },
  { id: "gitbook", name: "GitBook", glyph: "◌", color: "#BBDDE5", fallback: "cyan" },
  { id: "readme", name: "ReadMe", glyph: "◌", color: "#018EF5", fallback: "blue" },
  { id: "zendesk", name: "Zendesk", glyph: "◌", color: "#5FCFD8", fallback: "cyan" },
  { id: "statuspage", name: "Statuspage", glyph: "◌", color: "#0052CC", fallback: "blue" },
  { id: "mintlify", name: "Mintlify", glyph: "◌", color: "#18E299", fallback: "green" },
  { id: "unknown", name: "Unknown", glyph: "?", color: "#7A7A7A", fallback: "gray" },
];

export const PROVIDERS: Record<string, Provider> = Object.fromEntries(list.map((p) => [p.id, p]));

export function provider(id: string): Provider {
  return PROVIDERS[id] ?? PROVIDERS.unknown!;
}
