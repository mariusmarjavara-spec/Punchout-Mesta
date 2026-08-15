import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Punchout's own strategic review flagged zero jsdom/component testing —
 * only lib/regression/run.mjs's logic-level suite existed. This is
 * additive, separate infrastructure: `npm test` still means
 * lib/regression/run.mjs (documented in Gateway's EXECUTION_PROFILES.md
 * and relied on by CI); component tests run via `npm run test:components`
 * (see package.json) so neither suite's meaning changes for anyone
 * already depending on it.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.tsx", "**/*.test.ts"],
    exclude: ["node_modules/**", "lib/regression/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
