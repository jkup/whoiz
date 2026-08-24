/**
 * Renders docs/providers.svg — the legend of recognised providers, drawn with the same
 * icons and colours the --image card uses. Run: npm run docs:providers
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PROVIDERS } from "../src/fingerprint/providers.js";
import { C, FONT, shape } from "../src/render/image.js";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const list = Object.values(PROVIDERS).filter((p) => p.id !== "unknown");

const COLS = 4;
const CELL_W = 190;
const CELL_H = 30;
const PAD = 20;
const FS = 14;
const rows = Math.ceil(list.length / COLS);
const width = PAD * 2 + COLS * CELL_W;
const height = PAD * 2 + rows * CELL_H;

const out = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  `<rect width="${width}" height="${height}" rx="12" fill="${C.bg}" stroke="${C.border}"/>`,
];
list.forEach((p, i) => {
  const x = PAD + (i % COLS) * CELL_W;
  const y = PAD + Math.floor(i / COLS) * CELL_H + CELL_H / 2;
  out.push(shape(p.glyph, x + 8, y, p.color));
  out.push(
    `<text x="${x + 24}" y="${y + FS * 0.35}" font-family="${FONT}" font-size="${FS}" font-weight="bold" fill="${p.color}">${esc(p.name)}</text>`,
  );
});
out.push("</svg>");

mkdirSync(new URL("../docs", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/providers.svg", import.meta.url), `${out.join("\n")}\n`);
console.log(`docs/providers.svg: ${list.length} providers`);
