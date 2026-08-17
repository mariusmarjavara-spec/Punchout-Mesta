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
    // Post-pilot baseline finding: this list REPLACES vitest's defaults rather
    // than extending them, so dropping `.next/**` meant that after any
    // production build (`output: "standalone"` copies the whole source tree,
    // test files included, into .next/standalone/) `vitest run` collected each
    // test file twice and failed 3 of 6 files with "Cannot find module
    // './cjs/react.development.js'" — the standalone tree's pruned
    // node_modules. Exit code 1, purely from build output. Reproduced, then
    // fixed here; `dist/**` is listed for the same reason Vitest ships it.
    exclude: ["node_modules/**", "lib/regression/**", ".next/**", "dist/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
});
