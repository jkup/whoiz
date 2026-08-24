import { sameVerdict } from "../fingerprint/score.js";
import type { HostResult, ScanResult, Verdict } from "../model.js";
import { type PathNode, buildTree } from "../tree/build.js";

/**
 * Renderer-independent layout: the tree as a list of rows. `guides` is one entry per
 * nesting level (true = draw a vertical guide in that column); `branch` is the connector
 * that introduces this row. Both the ANSI and the image renderer consume this.
 */
export type Branch = "tee" | "end" | "none";

export interface Status {
  code: number;
  error?: string;
}

export type Row =
  | { kind: "title"; input: string }
  | { kind: "blank" }
  | { kind: "spacer"; guides: boolean[] }
  | {
      kind: "host";
      guides: boolean[];
      branch: Branch;
      host: string;
      isRoot: boolean;
      count?: number;
      verdict: Verdict;
      parentEdge?: string;
      error?: string;
    }
  | { kind: "facts"; guides: boolean[]; text: string }
  | { kind: "why"; guides: boolean[]; text: string }
  | {
      kind: "node";
      guides: boolean[];
      branch: Branch;
      label: string;
      count?: number;
      verdict?: Verdict;
      parentEdge?: string;
      status?: Status;
    }
  | {
      kind: "group";
      guides: boolean[];
      branch: Branch;
      count: number;
      verdict: Verdict;
      parentEdge?: string;
      sameAsHost: boolean;
    }
  | { kind: "sample"; guides: boolean[]; text: string }
  | { kind: "more"; guides: boolean[]; text: string }
  | { kind: "footer"; text: string };

export interface LayoutOptions {
  why: boolean;
  all: boolean;
  maxLines?: number;
  /** Separator between facts (terminal uses "·", ASCII mode "-"). */
  dot?: string;
}

export const LABEL_COL = 40;

export function shortOrg(org: string): string {
  let s = org;
  if (s.includes(" - ")) s = s.split(" - ").slice(1).join(" - ");
  return s.replace(/,?\s*(Inc|LLC|Ltd|Limited|Corp|Corporation|GmbH|S\.?A\.?)\.?$/i, "").trim();
}

export function layout(scan: ScanResult, opts: LayoutOptions): Row[] {
  const rows: Row[] = [];
  const dot = opts.dot ?? "·";
  rows.push({ kind: "title", input: scan.input });
  rows.push({ kind: "blank" });

  const subs = scan.subdomains;
  layoutHost(
    scan.root,
    { guides: [], branch: "none", isRoot: true, hasMore: subs.length > 0 },
    opts,
    dot,
    rows,
  );

  if (subs.length) {
    rows.push({ kind: "spacer", guides: [true] });
    subs.forEach((sub, i) => {
      const last = i === subs.length - 1;
      layoutHost(
        sub,
        {
          guides: [!last],
          branch: last ? "end" : "tee",
          isRoot: false,
          hasMore: false,
          parentEdge: scan.root.verdict.edge?.provider,
        },
        opts,
        dot,
        rows,
      );
    });
  }

  rows.push({ kind: "blank" });
  const s = scan.stats;
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  rows.push({
    kind: "footer",
    text: `${n(s.urls, "URL")} ${dot} ${n(s.providers.length, "provider")} ${dot} ${n(s.subdomains, "subdomain")} ${dot} ${(s.ms / 1000).toFixed(1)}s`,
  });
  return rows;
}

interface HostCtx {
  /** Guides for rows *under* this host's header. */
  guides: boolean[];
  branch: Branch;
  isRoot: boolean;
  /** More siblings follow this host's path list (so the last path keeps a tee). */
  hasMore: boolean;
  parentEdge?: string;
}

function layoutHost(
  h: HostResult,
  ctx: HostCtx,
  opts: LayoutOptions,
  dot: string,
  rows: Row[],
): void {
  const tree = buildTree(h.urls);
  const items: PathNode[] = [
    ...(tree.result ? [{ ...tree, children: [], count: 1, collapsed: tree.result.verdict }] : []),
    ...tree.children,
  ];
  // Paths that look exactly like the host are grouped into one summary line; differences get their own lines.
  const differing = opts.all
    ? items
    : items.filter((n) => !(n.collapsed && sameVerdict(n.collapsed, h.verdict)));
  const same = opts.all
    ? []
    : items.filter((n) => n.collapsed && sameVerdict(n.collapsed, h.verdict));
  const sameCount = same.reduce((s, n) => s + n.count, 0);
  // A uniform subdomain gets its count folded into the header instead of a repeated block.
  const foldIntoHeader = !ctx.isRoot && differing.length === 0 && sameCount > 1;
  const showSame =
    same.length > 0 &&
    !foldIntoHeader &&
    !(sameCount === 1 && same[0]?.path === "/" && differing.length === 0);

  rows.push({
    kind: "host",
    guides: [],
    branch: ctx.branch,
    host: h.host,
    isRoot: ctx.isRoot,
    count: foldIntoHeader ? sameCount : undefined,
    verdict: h.verdict,
    parentEdge: ctx.parentEdge,
    error: h.error,
  });

  const ev = h.evidence;
  const facts: string[] = [];
  if (ev.ips[0]) facts.push(ev.ips[0] + (ev.ips.length > 1 ? ` +${ev.ips.length - 1}` : ""));
  if (ev.asn) facts.push(`AS${ev.asn.number} ${shortOrg(ev.asn.org)}`.trim());
  if (ev.cnames.length) facts.push(`CNAME ${ev.cnames[ev.cnames.length - 1]}`);
  if (ev.cert?.issuer) facts.push(`TLS by ${ev.cert.issuer}`);
  const under = [...ctx.guides, true];
  if (facts.length) rows.push({ kind: "facts", guides: under, text: facts.join(` ${dot} `) });
  if (opts.why)
    for (const r of [...h.verdict.origin.reasons, ...(h.verdict.edge?.reasons ?? [])])
      rows.push({ kind: "why", guides: under, text: `${r.rule}: ${r.detail}` });

  if (!differing.length && !showSame) return;

  rows.push({ kind: "spacer", guides: under });
  const edge = h.verdict.edge?.provider;
  const limit = opts.all ? Number.POSITIVE_INFINITY : (opts.maxLines ?? 40);
  let printed = 0;
  differing.forEach((n, i) => {
    if (printed >= limit) return;
    const last = i === differing.length - 1 && !showSame && !ctx.hasMore;
    printed += layoutNode(n, ctx.guides, last, edge, opts, rows, limit - printed);
  });
  if (printed >= limit && differing.length > printed)
    rows.push({
      kind: "more",
      guides: under,
      text: `… ${differing.length - printed} more (use --all)`,
    });

  if (showSame) {
    rows.push({
      kind: "group",
      guides: ctx.guides,
      branch: ctx.hasMore ? "tee" : "end",
      count: sameCount,
      verdict: h.verdict,
      parentEdge: ctx.parentEdge,
      sameAsHost: differing.length > 0,
    });
    const sample = same.slice(0, 6).map((n) => (n.count > 1 ? `${n.label} (${n.count})` : n.label));
    const more = same.length - sample.length;
    rows.push({
      kind: "sample",
      guides: [...ctx.guides, ctx.hasMore],
      text: `${sample.join(", ")}${more > 0 ? `, +${more}` : ""}`,
    });
  }
}

function layoutNode(
  n: PathNode,
  guides: boolean[],
  last: boolean,
  parentEdge: string | undefined,
  opts: LayoutOptions,
  rows: Row[],
  budget: number,
): number {
  const branch: Branch = last ? "end" : "tee";
  const childGuides = [...guides, !last];
  let printed = 1;

  if (n.collapsed && (!opts.all || n.children.length === 0)) {
    const status =
      n.count === 1 && n.result
        ? { code: n.result.response.status, error: n.result.response.error }
        : undefined;
    rows.push({
      kind: "node",
      guides,
      branch,
      label: n.label,
      count: n.count > 1 ? n.count : undefined,
      verdict: n.collapsed,
      parentEdge,
      status,
    });
    if (opts.why && n.result)
      for (const r of n.result.verdict.origin.reasons)
        rows.push({ kind: "why", guides: childGuides, text: `${r.rule}: ${r.detail}` });
    return printed;
  }

  if (n.result) {
    rows.push({
      kind: "node",
      guides,
      branch,
      label: n.label,
      verdict: n.result.verdict,
      parentEdge,
      status: { code: n.result.response.status, error: n.result.response.error },
    });
  } else {
    rows.push({ kind: "node", guides, branch, label: n.label });
  }
  n.children.forEach((c, i) => {
    if (printed >= budget) return;
    printed += layoutNode(
      c,
      childGuides,
      i === n.children.length - 1,
      parentEdge,
      opts,
      rows,
      budget - printed,
    );
  });
  return printed;
}
