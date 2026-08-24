import type { ScanResult } from "../model.js";

export function renderJson(scan: ScanResult): string {
  return JSON.stringify(scan, null, 2);
}
