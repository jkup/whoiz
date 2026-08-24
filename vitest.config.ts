import { defineConfig } from "vitest/config";

// Renderer snapshots assert on plain text; force colours off regardless of the host (CI sets FORCE_COLOR).
process.env.NO_COLOR = "1";
process.env.FORCE_COLOR = undefined;

export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
