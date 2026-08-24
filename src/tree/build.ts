import { sameVerdict } from "../fingerprint/score.js";
import type { UrlResult, Verdict } from "../model.js";

export interface PathNode {
  /** Display label, e.g. "/blog" or "/blog/posts" for merged chains. */
  label: string;
  path: string;
  result?: UrlResult;
  children: PathNode[];
  /** Number of fetched URLs in this subtree (including self). */
  count: number;
  /** Set when the whole subtree shares one verdict. */
  collapsed?: Verdict;
}

interface Raw {
  seg: string;
  path: string;
  result?: UrlResult;
  children: Map<string, Raw>;
}

export function buildTree(results: UrlResult[]): PathNode {
  const root: Raw = { seg: "", path: "/", children: new Map() };
  for (const r of results) {
    const segs = r.path.split("/").filter(Boolean);
    let node = root;
    let path = "";
    for (const seg of segs) {
      path += `/${seg}`;
      let child = node.children.get(seg);
      if (!child) {
        child = { seg, path, children: new Map() };
        node.children.set(seg, child);
      }
      node = child;
    }
    node.result = r;
  }
  return finish(root, true);
}

function finish(raw: Raw, isRoot: boolean): PathNode {
  const children = [...raw.children.values()]
    .sort((a, b) => a.seg.localeCompare(b.seg))
    .map((c) => finish(c, false));
  let node: PathNode = {
    label: isRoot ? "/" : raw.path,
    path: raw.path,
    result: raw.result,
    children,
    count: (raw.result ? 1 : 0) + children.reduce((s, c) => s + c.count, 0),
  };
  // Merge chains of empty intermediate directories: /a (no result) -> /a/b => "/a/b".
  if (!isRoot && !node.result && node.children.length === 1) {
    const only = node.children[0]!;
    node = { ...only, label: only.label };
  }
  const verdicts = collectVerdicts(node);
  if (verdicts.length > 0 && verdicts.every((v) => sameVerdict(v, verdicts[0]!)))
    node.collapsed = verdicts[0];
  return node;
}

function collectVerdicts(n: PathNode): Verdict[] {
  const out: Verdict[] = [];
  if (n.result) out.push(n.result.verdict);
  for (const c of n.children) out.push(...collectVerdicts(c));
  return out;
}
