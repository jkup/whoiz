import type {
  Confidence,
  Guess,
  HostEvidence,
  Reason,
  ResponseEvidence,
  Verdict,
} from "../model.js";
import { RULES } from "./rules.js";

function confidence(score: number): Confidence {
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

function rank(reasons: Reason[]): Guess[] {
  const by = new Map<string, Reason[]>();
  for (const r of reasons) by.set(r.provider, [...(by.get(r.provider) ?? []), r]);
  return [...by.entries()]
    .map(([provider, rs]) => {
      const score = rs.reduce((s, r) => s + r.weight, 0);
      return { provider, score, confidence: confidence(score), reasons: rs };
    })
    .sort((a, b) => b.score - a.score);
}

export function collectReasons(host: HostEvidence, res?: ResponseEvidence): Reason[] {
  const out: Reason[] = [];
  for (const rule of RULES) {
    const detail = rule.test(host, res);
    if (detail) {
      out.push({
        rule: rule.id,
        provider: rule.provider,
        layer: rule.layer,
        weight: rule.weight,
        detail,
      });
    }
  }
  return out;
}

/**
 * Turn raw reasons into an edge/origin verdict.
 *
 * Edge = who terminates the connection (CNAME, IP, CDN headers).
 * Origin = whose app-layer headers made it through.
 */
export function verdictFrom(reasons: Reason[]): Verdict {
  const edges = rank(reasons.filter((r) => r.layer === "edge"));
  const origins = rank(reasons.filter((r) => r.layer === "origin"));
  const edge = edges[0];
  let origin = origins[0];
  let note: string | undefined;

  if (!edge && !origin) {
    return { origin: { provider: "unknown", confidence: "low", score: 0, reasons: [] } };
  }

  if (!origin) {
    // Only edge signals: the CDN is serving it, or hiding the origin completely.
    origin = { ...edge!, reasons: edge!.reasons };
    note = "no upstream seen";
    return { origin, note };
  }

  if (!edge) return { origin };

  if (edge.provider === origin.provider) {
    // Merge so the reasons list is complete.
    const merged = rank(reasons.filter((r) => r.provider === edge.provider))[0]!;
    return { origin: merged };
  }

  // A weak cloud-ASN "origin" guess should not beat a strong edge that is also a host (e.g. Vercel on AWS).
  if (origin.confidence === "low" && edge.confidence === "high") {
    return { origin: edge, note: `${origin.provider} network` };
  }

  // A lone weak edge signal (e.g. "this IP belongs to a Microsoft ASN") is not worth a "via".
  if (edge.confidence === "low") return { origin };

  return { edge, origin, note };
}

export function fingerprint(host: HostEvidence, res?: ResponseEvidence): Verdict {
  return verdictFrom(collectReasons(host, res));
}

export function sameVerdict(a: Verdict, b: Verdict): boolean {
  return (
    a.origin.provider === b.origin.provider && (a.edge?.provider ?? "") === (b.edge?.provider ?? "")
  );
}
