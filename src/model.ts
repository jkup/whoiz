export type Confidence = "high" | "medium" | "low";

export type Layer = "edge" | "origin";

export interface Provider {
  id: string;
  name: string;
  glyph: string;
  /** Hex brand colour used for truecolor terminals. */
  color: string;
  /** Fallback 16-colour name for basic terminals. */
  fallback: "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white" | "gray";
}

export interface Reason {
  rule: string;
  provider: string;
  layer: Layer;
  weight: number;
  detail: string;
}

export interface Guess {
  provider: string;
  confidence: Confidence;
  score: number;
  reasons: Reason[];
}

export interface Verdict {
  /** The CDN / proxy that terminates the connection. Undefined when the origin is hit directly. */
  edge?: Guess;
  /** Where the content actually comes from. */
  origin: Guess;
  /** Short human hint, e.g. "no upstream seen". */
  note?: string;
}

export interface HostEvidence {
  host: string;
  cnames: string[];
  ips: string[];
  asn?: { number: number; org: string };
  cert?: { issuer: string; sans: string[] };
}

export interface ResponseEvidence {
  url: string;
  status: number;
  headers: Record<string, string>;
  redirectChain: string[];
  finalUrl: string;
  contentType?: string;
  error?: string;
}

export interface UrlResult {
  url: string;
  path: string;
  host: string;
  response: ResponseEvidence;
  verdict: Verdict;
}

export interface HostResult {
  host: string;
  evidence: HostEvidence;
  verdict: Verdict;
  urls: UrlResult[];
  error?: string;
}

export interface ScanResult {
  input: string;
  root: HostResult;
  subdomains: HostResult[];
  stats: { urls: number; providers: string[]; subdomains: number; ms: number };
  version: string;
}

export interface ScanOptions {
  depth: number;
  max: number;
  concurrency: number;
  crawl: boolean;
  subdomains: boolean;
  timeout: number;
  onProgress?: (msg: string) => void;
}
