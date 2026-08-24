import pc from "picocolors";
import type { Provider } from "../model.js";

const truecolor =
  /truecolor|24bit/i.test(process.env.COLORTERM ?? "") ||
  process.env.TERM_PROGRAM === "iTerm.app" ||
  process.env.TERM_PROGRAM === "vscode" ||
  process.env.TERM_PROGRAM === "WezTerm" ||
  process.env.TERM_PROGRAM === "ghostty";

export const colorEnabled = pc.isColorSupported;

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function to256([r, g, b]: [number, number, number]): number {
  const q = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

export function paint(hex: string, text: string, fallback: Provider["fallback"] = "white"): string {
  if (!colorEnabled) return text;
  const rgb = hexToRgb(hex);
  if (truecolor) return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
  if ((process.env.TERM ?? "").includes("256color"))
    return `\x1b[38;5;${to256(rgb)}m${text}\x1b[39m`;
  return pc[fallback](text);
}

export const dim = (s: string) => (colorEnabled ? pc.dim(s) : s);
export const bold = (s: string) => (colorEnabled ? pc.bold(s) : s);
export const green = (s: string) => (colorEnabled ? pc.green(s) : s);
export const red = (s: string) => (colorEnabled ? pc.red(s) : s);
export const yellow = (s: string) => (colorEnabled ? pc.yellow(s) : s);

/** Visible width, ignoring ANSI escapes. */
export function width(s: string): number {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes
  return [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

export function padEnd(s: string, n: number): string {
  const w = width(s);
  return w >= n ? s : s + " ".repeat(n - w);
}
