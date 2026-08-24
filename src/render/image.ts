import { provider } from "../fingerprint/providers.js";
import type { Guess, ScanResult, Verdict } from "../model.js";
import { type Branch, LABEL_COL, type Row, type Status, layout } from "./layout.js";

/**
 * Renders the scan as a terminal-style SVG card. Tree connectors are drawn as lines and
 * provider markers as dots so nothing depends on the viewer having box-drawing glyphs.
 */
export interface ImageOptions {
  why: boolean;
  all: boolean;
  maxLines?: number;
  /** Attribution shown bottom-right. */
  attribution?: string;
}

const FONT = "JetBrains Mono, SF Mono, Menlo, Consolas, DejaVu Sans Mono, monospace";
const FS = 15; // font size
const CW = FS * 0.6; // monospace advance
const LH = 24; // line height
const PAD = 28;
const MIN_COLS = 72;
const MAX_COLS = 100;

const C = {
  bg: "#0d1117",
  border: "#30363d",
  text: "#e6edf3",
  dim: "#7d8590",
  yellow: "#d29922",
  red: "#f85149",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Run {
  text: string;
  color: string;
  bold?: boolean;
  /** Draw a provider dot before the text in this colour. */
  dot?: string;
}

/** A row's visual content as positioned runs plus the connector geometry to draw. */
interface Line {
  guides: boolean[];
  branch: Branch;
  branchDepth: number;
  runs: { col: number; run: Run }[];
}

function guessRuns(g: Guess): Run[] {
  const p = provider(g.provider);
  if (p.id === "unknown") return [{ text: "Unknown", color: C.dim }];
  const prefix = g.confidence === "medium" ? "~" : g.confidence === "low" ? "?" : "";
  return [
    {
      text: `${prefix}${p.name}`,
      color: g.confidence === "high" ? p.color : C.dim,
      bold: g.confidence === "high",
      dot: p.color,
    },
  ];
}

function verdictRuns(
  v: Verdict,
  parentEdge: string | undefined,
  status?: Status,
  dimAll = false,
): Run[] {
  const runs: Run[] = guessRuns(v.origin);
  if (v.edge && v.edge.provider !== parentEdge)
    runs.push({ text: "  via ", color: C.dim }, ...guessRuns(v.edge));
  if (status) {
    if (status.error)
      runs.push({ text: `  ${status.error.split("\n")[0]?.slice(0, 30)}`, color: C.red });
    else if (status.code >= 500) runs.push({ text: `  ${status.code}`, color: C.red });
    else if (status.code >= 400) runs.push({ text: `  ${status.code}`, color: C.yellow });
    else if (status.code >= 300) runs.push({ text: `  ${status.code}`, color: C.dim });
  }
  if (v.note) runs.push({ text: `  ${v.note}`, color: C.dim });
  return dimAll
    ? runs.map((r) => ({ ...r, color: C.dim, bold: false, dot: r.dot ? C.dim : undefined }))
    : runs;
}

/** Width in columns of a list of runs (a dot takes two columns: dot + space). */
function runsWidth(runs: Run[]): number {
  return runs.reduce((w, r) => w + [...r.text].length + (r.dot ? 2 : 0), 0);
}

function place(startCol: number, runs: Run[]): { col: number; run: Run }[] {
  const out: { col: number; run: Run }[] = [];
  let col = startCol;
  for (const r of runs) {
    out.push({ col, run: r });
    col += [...r.text].length + (r.dot ? 2 : 0);
  }
  return out;
}

function toLine(r: Row): Line {
  const none = (runs: { col: number; run: Run }[], guides: boolean[] = []): Line => ({
    guides,
    branch: "none",
    branchDepth: 0,
    runs,
  });
  switch (r.kind) {
    case "title":
      return none(
        place(0, [
          { text: "whoiz", color: C.text, bold: true },
          { text: `  ${r.input}`, color: C.text },
        ]),
      );
    case "blank":
      return none([]);
    case "spacer":
      return none([], r.guides);
    case "host": {
      const depth = 0;
      const labelCol = r.branch === "none" ? 0 : 3;
      const label: Run[] = [{ text: r.host, color: C.text, bold: r.isRoot }];
      if (r.count) label.push({ text: `  (${r.count} paths)`, color: C.dim });
      const head = place(labelCol, label);
      const vcol = Math.max(LABEL_COL, labelCol + runsWidth(label) + 2);
      const tail = r.error
        ? place(vcol, [{ text: r.error, color: C.red }])
        : place(vcol, verdictRuns(r.verdict, r.parentEdge));
      return { guides: [], branch: r.branch, branchDepth: depth, runs: [...head, ...tail] };
    }
    case "facts":
    case "sample":
    case "more":
      return none(place(r.guides.length * 3, [{ text: r.text, color: C.dim }]), r.guides);
    case "why":
      return none(place(r.guides.length * 3, [{ text: `- ${r.text}`, color: C.dim }]), r.guides);
    case "node": {
      const depth = r.guides.length;
      const labelCol = depth * 3 + 3;
      const label: Run[] = [{ text: r.label, color: r.verdict ? C.text : C.dim }];
      if (r.count) label.push({ text: `  (${r.count} pages)`, color: C.dim });
      const head = place(labelCol, label);
      if (!r.verdict) return { guides: r.guides, branch: r.branch, branchDepth: depth, runs: head };
      const vcol = Math.max(LABEL_COL, labelCol + runsWidth(label) + 2);
      return {
        guides: r.guides,
        branch: r.branch,
        branchDepth: depth,
        runs: [...head, ...place(vcol, verdictRuns(r.verdict, r.parentEdge, r.status))],
      };
    }
    case "group": {
      const depth = r.guides.length;
      const labelCol = depth * 3 + 3;
      const label: Run[] = [{ text: `${r.count} path${r.count === 1 ? "" : "s"}`, color: C.text }];
      const head = place(labelCol, label);
      const vcol = Math.max(LABEL_COL, labelCol + runsWidth(label) + 2);
      const tail = verdictRuns(r.verdict, r.parentEdge, undefined, true);
      if (r.sameAsHost) tail.push({ text: "  same as host", color: C.dim });
      return {
        guides: r.guides,
        branch: r.branch,
        branchDepth: depth,
        runs: [...head, ...place(vcol, tail)],
      };
    }
    case "footer":
      return none(place(0, [{ text: r.text, color: C.dim }]));
  }
}

function lineWidth(l: Line): number {
  return l.runs.reduce(
    (w, { col, run }) => Math.max(w, col + [...run.text].length + (run.dot ? 2 : 0)),
    0,
  );
}

/** Clip a line's trailing run so nothing exceeds `cols`. */
function clip(l: Line, cols: number): Line {
  return {
    ...l,
    runs: l.runs.flatMap(({ col, run }) => {
      const dotW = run.dot ? 2 : 0;
      const avail = cols - col - dotW;
      if (avail <= 0) return [];
      const chars = [...run.text];
      if (chars.length <= avail) return [{ col, run }];
      return [
        { col, run: { ...run, text: `${chars.slice(0, Math.max(0, avail - 1)).join("")}…` } },
      ];
    }),
  };
}

export function renderSvg(scan: ScanResult, opts: ImageOptions): string {
  const rows = layout(scan, { why: opts.why, all: opts.all, maxLines: opts.maxLines, dot: "·" });
  let lines = rows.map(toLine);
  const attribution = opts.attribution ?? `npx @jkup/whoiz ${scan.input}`;
  const cols = Math.max(
    MIN_COLS,
    Math.min(MAX_COLS, Math.max(...lines.map(lineWidth), attribution.length + 2)),
  );
  lines = lines.map((l) => clip(l, cols));

  const width = PAD * 2 + cols * CW;
  const top = PAD + 22; // room for the window dots
  const height = top + lines.length * LH + PAD;
  const x = (col: number) => PAD + col * CW;

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  );
  out.push(
    `<rect width="${width}" height="${height}" rx="14" fill="${C.bg}" stroke="${C.border}"/>`,
  );
  for (const [i, c] of ["#ff5f57", "#febc2e", "#28c840"].entries())
    out.push(`<circle cx="${PAD + 6 + i * 20}" cy="${PAD - 2}" r="6" fill="${c}"/>`);

  lines.forEach((l, i) => {
    const y0 = top + i * LH;
    const yMid = y0 + LH / 2;
    const baseline = y0 + LH / 2 + FS * 0.35;
    const gx = (depth: number) => x(depth * 3) + CW / 2;
    // Vertical guides for ancestor levels.
    l.guides.forEach((on, d) => {
      if (on)
        out.push(
          `<line x1="${gx(d)}" y1="${y0}" x2="${gx(d)}" y2="${y0 + LH}" stroke="${C.border}" stroke-width="1.5"/>`,
        );
    });
    // Connector introducing this row.
    if (l.branch !== "none") {
      const bx = gx(l.branchDepth);
      const yEnd = l.branch === "tee" ? y0 + LH : yMid;
      out.push(
        `<line x1="${bx}" y1="${y0}" x2="${bx}" y2="${yEnd}" stroke="${C.border}" stroke-width="1.5"/>`,
      );
      out.push(
        `<line x1="${bx}" y1="${yMid}" x2="${x(l.branchDepth * 3 + 2) + CW * 0.3}" y2="${yMid}" stroke="${C.border}" stroke-width="1.5"/>`,
      );
    }
    for (const { col, run } of l.runs) {
      let tc = col;
      if (run.dot) {
        out.push(`<circle cx="${x(col) + CW / 2}" cy="${yMid}" r="4.5" fill="${run.dot}"/>`);
        tc += 2;
      }
      const len = [...run.text].length;
      if (!len) continue;
      out.push(
        `<text x="${x(tc)}" y="${baseline}" font-family="${FONT}" font-size="${FS}" fill="${run.color}"${run.bold ? ' font-weight="bold"' : ""} textLength="${len * CW}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${esc(run.text)}</text>`,
      );
    }
  });

  // Attribution, bottom-right on the footer line.
  const footerY = top + (lines.length - 1) * LH + LH / 2 + FS * 0.35;
  out.push(
    `<text x="${width - PAD}" y="${footerY}" font-family="${FONT}" font-size="${FS}" fill="${C.dim}" text-anchor="end">${esc(attribution)}</text>`,
  );
  out.push("</svg>");
  return out.join("\n");
}

export async function renderPng(svg: string, scale: number): Promise<Uint8Array> {
  const { Resvg } = await import("@resvg/resvg-js");
  const r = new Resvg(svg, {
    font: { loadSystemFonts: true, defaultFontFamily: "Menlo" },
    fitTo: { mode: "zoom", value: scale },
  });
  return r.render().asPng();
}
