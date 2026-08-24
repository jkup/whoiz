import { provider } from "../fingerprint/providers.js";
import type { Guess, ScanResult, Verdict } from "../model.js";
import { bold, dim, padEnd, paint, red, yellow } from "./color.js";
import { type Branch, LABEL_COL, type Status, layout } from "./layout.js";

export interface PrettyOptions {
  why: boolean;
  all: boolean;
  ascii: boolean;
  maxLines?: number;
}

interface Box {
  v: string;
  t: string;
  l: string;
}
const BOX: Box = { v: "│", t: "├─", l: "└─" };
const ASCII: Box = { v: "|", t: "|-", l: "`-" };

function guessText(g: Guess, ascii: boolean): string {
  const p = provider(g.provider);
  if (p.id === "unknown") return dim("Unknown");
  const glyph = ascii ? "" : `${p.glyph} `;
  let name = `${glyph}${p.name}`;
  if (g.confidence === "medium") name = `~${name}`;
  if (g.confidence === "low") name = `?${name}`;
  const painted = paint(p.color, name, p.fallback);
  return g.confidence === "high" ? bold(painted) : dim(painted);
}

function verdictText(
  v: Verdict,
  parentEdge: string | undefined,
  ascii: boolean,
  status?: Status,
): string {
  let s = guessText(v.origin, ascii);
  if (v.edge && v.edge.provider !== parentEdge) s += `  ${dim("via")} ${guessText(v.edge, ascii)}`;
  if (status) s += statusTag(status);
  if (v.note) s += `  ${dim(v.note)}`;
  return s;
}

function statusTag({ code, error }: Status): string {
  if (error) return red(`  ${error.split("\n")[0]?.slice(0, 30)}`);
  if (code >= 500) return red(`  ${code}`);
  if (code >= 400) return yellow(`  ${code}`);
  if (code >= 300) return dim(`  ${code}`);
  return "";
}

export function renderPretty(scan: ScanResult, opts: PrettyOptions): string {
  const b = opts.ascii ? ASCII : BOX;
  const rows = layout(scan, {
    why: opts.why,
    all: opts.all,
    maxLines: opts.maxLines,
    dot: opts.ascii ? "-" : "·",
  });
  const guides = (g: boolean[]) => g.map((on) => (on ? `${b.v}  ` : "   ")).join("");
  const branch = (br: Branch) => (br === "tee" ? `${b.t} ` : br === "end" ? `${b.l} ` : "");
  const lines = rows.map((r) => {
    switch (r.kind) {
      case "title":
        return `${bold("whoiz")}  ${r.input}`;
      case "blank":
        return "";
      case "spacer":
        return guides(r.guides);
      case "host": {
        const label = r.isRoot ? bold(r.host) : r.host;
        const head = `${branch(r.branch)}${label}${r.count ? dim(`  (${r.count} paths)`) : ""}`;
        return `${padEnd(head, LABEL_COL)}${r.error ? red(` ${r.error}`) : verdictText(r.verdict, r.parentEdge, opts.ascii)}`;
      }
      case "facts":
        return `${guides(r.guides)}${dim(r.text)}`;
      case "why":
        return `${guides(r.guides)}${dim(`↳ ${r.text}`)}`;
      case "node": {
        const head = `${guides(r.guides)}${branch(r.branch)}${r.verdict ? r.label : dim(r.label)}${r.count ? dim(`  (${r.count} pages)`) : ""}`;
        return r.verdict
          ? `${padEnd(head, LABEL_COL)}${verdictText(r.verdict, r.parentEdge, opts.ascii, r.status)}`
          : head;
      }
      case "group": {
        const head = `${guides(r.guides)}${branch(r.branch)}${r.count} path${r.count === 1 ? "" : "s"}`;
        return `${padEnd(head, LABEL_COL)}${dim(verdictText(r.verdict, r.parentEdge, opts.ascii))}${r.sameAsHost ? dim("  same as host") : ""}`;
      }
      case "sample":
        return `${guides(r.guides)}${dim(r.text)}`;
      case "more":
        return `${guides(r.guides)}${dim(r.text)}`;
      case "footer":
        return dim(r.text);
    }
  });
  return `\n${lines.map((l) => (l ? `  ${l}`.replace(/\s+$/, "") : "")).join("\n")}\n`;
}
