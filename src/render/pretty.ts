import { provider } from "../fingerprint/providers.js";
import { sameVerdict } from "../fingerprint/score.js";
import type { Guess, HostResult, ScanResult, Verdict } from "../model.js";
import { type PathNode, buildTree } from "../tree/build.js";
import { bold, dim, padEnd, paint, red, yellow } from "./color.js";

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
  sp: string;
  dot: string;
}
const BOX: Box = { v: "│", t: "├─", l: "└─", sp: "   ", dot: "·" };
const ASCII: Box = { v: "|", t: "|-", l: "`-", sp: "   ", dot: "-" };

const LABEL_COL = 40;

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
  status = "",
): string {
  let s = guessText(v.origin, ascii);
  if (v.edge && v.edge.provider !== parentEdge) s += `  ${dim("via")} ${guessText(v.edge, ascii)}`;
  if (status) s += status;
  if (v.note) s += `  ${dim(v.note)}`;
  return s;
}

function statusTag(status: number, error?: string): string {
  if (error) return red(`  ${error.split("\n")[0]?.slice(0, 30)}`);
  if (status >= 500) return red(`  ${status}`);
  if (status >= 400) return yellow(`  ${status}`);
  if (status >= 300) return dim(`  ${status}`);
  return "";
}

function shortOrg(org: string): string {
  let s = org;
  if (s.includes(" - ")) s = s.split(" - ").slice(1).join(" - ");
  return s.replace(/,?\s*(Inc|LLC|Ltd|Limited|Corp|Corporation|GmbH|S\.?A\.?)\.?$/i, "").trim();
}

export function renderPretty(scan: ScanResult, opts: PrettyOptions): string {
  const b = opts.ascii ? ASCII : BOX;
  const lines: string[] = [];
  const push = (s = "") => lines.push(s ? `  ${s}` : "");

  push(`${bold("whoiz")}  ${scan.input}`);
  push();
  const subs = scan.subdomains;
  renderHost(
    scan.root,
    { prefix: "", indent: "", isRoot: true, hasMore: subs.length > 0 },
    opts,
    b,
    push,
  );

  if (subs.length) {
    push(b.v);
    subs.forEach((sub, i) => {
      const last = i === subs.length - 1;
      renderHost(
        sub,
        {
          prefix: last ? b.l : b.t,
          indent: last ? b.sp : `${b.v}  `,
          isRoot: false,
          hasMore: false,
          parentEdge: scan.root.verdict.edge?.provider,
        },
        opts,
        b,
        push,
      );
    });
  }

  push();
  const s = scan.stats;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  push(
    dim(
      `${n(s.urls, "URL")} ${b.dot} ${n(s.providers.length, "provider")} ${b.dot} ${n(s.subdomains, "subdomain")} ${b.dot} ${(s.ms / 1000).toFixed(1)}s`,
    ),
  );
  return `\n${lines.join("\n")}\n`;
}

interface HostCtx {
  prefix: string;
  /** Indent applied to everything under this host's header line. */
  indent: string;
  isRoot: boolean;
  /** More siblings follow this host's path list (so the last path keeps a `├─`). */
  hasMore: boolean;
  parentEdge?: string;
}

function renderHost(
  h: HostResult,
  ctx: HostCtx,
  opts: PrettyOptions,
  b: Box,
  push: (s?: string) => void,
): void {
  const label = ctx.isRoot ? bold(h.host) : h.host;
  const head = ctx.prefix ? `${ctx.prefix} ${label}` : label;
  push(
    `${padEnd(head, LABEL_COL)}${h.error ? red(` ${h.error}`) : verdictText(h.verdict, ctx.parentEdge, opts.ascii)}`,
  );

  const ev = h.evidence;
  const facts: string[] = [];
  if (ev.ips[0]) facts.push(ev.ips[0] + (ev.ips.length > 1 ? ` +${ev.ips.length - 1}` : ""));
  if (ev.asn) facts.push(`AS${ev.asn.number} ${shortOrg(ev.asn.org)}`.trim());
  if (ev.cnames.length) facts.push(`CNAME ${ev.cnames[ev.cnames.length - 1]}`);
  if (ev.cert?.issuer) facts.push(`TLS by ${ev.cert.issuer}`);
  const cont = `${ctx.indent}${b.v}`;
  if (facts.length) push(`${cont}  ${dim(facts.join(` ${b.dot} `))}`);
  if (opts.why)
    for (const r of [...h.verdict.origin.reasons, ...(h.verdict.edge?.reasons ?? [])])
      push(`${cont}  ${dim(`↳ ${r.rule}: ${r.detail}`)}`);

  const tree = buildTree(h.urls);
  const items: PathNode[] = [
    ...(tree.result ? [{ ...tree, children: [], count: 1, collapsed: tree.result.verdict }] : []),
    ...tree.children,
  ];
  if (!items.length) return;

  // Paths that look exactly like the host are grouped into one summary line; differences get their own lines.
  const differing = opts.all
    ? items
    : items.filter((n) => !(n.collapsed && sameVerdict(n.collapsed, h.verdict)));
  const same = opts.all
    ? []
    : items.filter((n) => n.collapsed && sameVerdict(n.collapsed, h.verdict));
  const sameCount = same.reduce((s, n) => s + n.count, 0);
  const showSame =
    same.length > 0 && !(sameCount === 1 && same[0]?.path === "/" && differing.length === 0);
  if (!differing.length && !showSame) return;

  push(cont);
  const edge = h.verdict.edge?.provider;
  const limit = opts.all ? Number.POSITIVE_INFINITY : (opts.maxLines ?? 40);
  let printed = 0;
  differing.forEach((n, i) => {
    if (printed >= limit) return;
    const last = i === differing.length - 1 && !showSame && !ctx.hasMore;
    printed += renderNode(n, ctx.indent, last, edge, opts, b, push, limit - printed);
  });
  if (printed >= limit && differing.length > printed)
    push(`${ctx.indent}${b.v}  ${dim(`… ${differing.length - printed} more (use --all)`)}`);

  if (showSame) {
    const branch = ctx.hasMore ? b.t : b.l;
    const label = `${sameCount} path${sameCount === 1 ? "" : "s"}`;
    const tail = differing.length ? dim("  same as host") : "";
    push(
      `${padEnd(`${ctx.indent}${branch} ${label}`, LABEL_COL)}${dim(verdictText(h.verdict, ctx.parentEdge, opts.ascii))}${tail}`,
    );
    const sample = samplePaths(same, 6);
    const more = same.length - sample.length;
    push(
      `${ctx.indent}${ctx.hasMore ? b.v : " "}  ${dim(`${sample.join(", ")}${more > 0 ? `, +${more}` : ""}`)}`,
    );
  }
}

function samplePaths(nodes: PathNode[], max: number): string[] {
  return nodes.slice(0, max).map((n) => (n.count > 1 ? `${n.label} (${n.count})` : n.label));
}

function renderNode(
  n: PathNode,
  indent: string,
  last: boolean,
  parentEdge: string | undefined,
  opts: PrettyOptions,
  b: Box,
  push: (s?: string) => void,
  budget: number,
): number {
  const branch = last ? b.l : b.t;
  const childIndent = indent + (last ? b.sp : `${b.v}  `);
  let printed = 1;

  if (n.collapsed && (!opts.all || n.children.length === 0)) {
    const suffix = n.count > 1 ? dim(`  (${n.count} pages)`) : "";
    const status =
      n.count === 1 && n.result ? statusTag(n.result.response.status, n.result.response.error) : "";
    push(
      `${padEnd(`${indent}${branch} ${n.label}${suffix}`, LABEL_COL)}${verdictText(n.collapsed, parentEdge, opts.ascii, status)}`,
    );
    if (opts.why && n.result)
      for (const r of n.result.verdict.origin.reasons)
        push(`${childIndent}${dim(`↳ ${r.rule}: ${r.detail}`)}`);
    return printed;
  }

  if (n.result) {
    push(
      `${padEnd(`${indent}${branch} ${n.label}`, LABEL_COL)}${verdictText(n.result.verdict, parentEdge, opts.ascii, statusTag(n.result.response.status, n.result.response.error))}`,
    );
  } else {
    push(`${indent}${branch} ${dim(n.label)}`);
  }
  n.children.forEach((c, i) => {
    if (printed >= budget) return;
    printed += renderNode(
      c,
      childIndent,
      i === n.children.length - 1,
      parentEdge,
      opts,
      b,
      push,
      budget - printed,
    );
  });
  return printed;
}
