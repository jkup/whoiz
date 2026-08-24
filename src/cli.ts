import { Command } from "commander";
import { dim, red } from "./render/color.js";
import { renderJson } from "./render/json.js";
import { renderPretty } from "./render/pretty.js";
import { VERSION, scan } from "./scan.js";

const program = new Command()
  .name("whoiz")
  .description(
    "Who is actually serving this site? Enumerates endpoints and fingerprints the CDN and host behind each.",
  )
  .version(VERSION)
  .argument("<target>", "domain or URL, e.g. vercel.com")
  .option("--json", "machine-readable output with full evidence", false)
  .option("--why", "show the evidence behind each verdict", false)
  .option("--all", "don't collapse identical siblings or truncate long lists", false)
  .option("-d, --depth <n>", "crawl depth", (v) => Number.parseInt(v, 10), 2)
  .option(
    "-m, --max <n>",
    "maximum URLs to fetch (default 100, or 30 with --no-crawl)",
    (v) => Number.parseInt(v, 10),
    100,
  )
  .option("-c, --concurrency <n>", "parallel requests", (v) => Number.parseInt(v, 10), 8)
  .option("-t, --timeout <ms>", "per-request timeout", (v) => Number.parseInt(v, 10), 8000)
  .option("--no-crawl", "only use sitemap, robots.txt and the homepage")
  .option("--no-subdomains", "ignore other hosts under the same domain")
  .option("--ascii", "plain ASCII tree characters", false)
  .option("--no-color", "disable colours")
  .showHelpAfterError();

program.parse();
const opts = program.opts<{
  json: boolean;
  why: boolean;
  all: boolean;
  depth: number;
  max: number;
  concurrency: number;
  timeout: number;
  crawl: boolean;
  subdomains: boolean;
  ascii: boolean;
}>();
const target = program.args[0]!;
if (!opts.crawl && program.getOptionValueSource("max") === "default") opts.max = 30;

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const interactive = process.stderr.isTTY && !opts.json;
let status = "starting";
let frame = 0;
const tick = interactive
  ? setInterval(() => {
      frame = (frame + 1) % spinnerFrames.length;
      process.stderr.write(`\r\x1b[2K  ${dim(`${spinnerFrames[frame]} ${status}`)}`);
    }, 80)
  : undefined;

try {
  const result = await scan(target, {
    depth: opts.depth,
    max: opts.max,
    concurrency: opts.concurrency,
    timeout: opts.timeout,
    crawl: opts.crawl,
    subdomains: opts.subdomains,
    onProgress: (m) => {
      status = m;
    },
  });
  if (tick) {
    clearInterval(tick);
    process.stderr.write("\r\x1b[2K");
  }
  process.stdout.write(
    opts.json
      ? `${renderJson(result)}\n`
      : renderPretty(result, { why: opts.why, all: opts.all, ascii: opts.ascii }),
  );
  process.exit(result.root.error ? 1 : 0);
} catch (e) {
  if (tick) {
    clearInterval(tick);
    process.stderr.write("\r\x1b[2K");
  }
  process.stderr.write(`${red("error:")} ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
