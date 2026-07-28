/**
 * Performance measurement (Adapter Platform DEL 10): transform() timing
 * for 100/500/1000 export packages, per adapter. Pure, in-memory,
 * synchronous functions — no I/O, no network (send() is always mocked).
 * This script measures and reports; it does not "optimize" anything,
 * per the brief: optimize only if a measurement actually shows a need.
 *
 * Run with: node lib/regression/adapter-performance.mjs
 */
import { buildExportEnvelope } from "../adapters/envelope.mjs";
import { listAdapters } from "../adapters/registry.mjs";
import { SAMPLE_CONTEXT, buildLargeDayLog } from "../adapters/fixtures.mjs";

const SIZES = [100, 500, 1000];

// Generous upper bound for a pure in-memory transform over 1000 packages
// on a CI runner — this exists to catch an accidental O(n^2)/O(n^3)
// regression, not to enforce a tight performance budget.
const MAX_MS_AT_1000 = 500;

/**
 * @returns {{name: string, size: number, ms: number}[]}
 */
export function measureAdapterPerformance() {
  const results = [];
  for (const size of SIZES) {
    const envelope = buildExportEnvelope(buildLargeDayLog(size), SAMPLE_CONTEXT);
    for (const descriptor of listAdapters()) {
      const validation = descriptor.adapter.validate(envelope);
      if (!validation.valid) continue; // measuring transform(), not re-litigating validation here
      const startedAt = performance.now();
      descriptor.adapter.transform(envelope);
      const ms = performance.now() - startedAt;
      results.push({ name: descriptor.name, size, ms });
    }
  }
  return results;
}

// CLI entry — this file is always invoked directly (node lib/regression/adapter-performance.mjs), same convention as cross-organization.mjs.
const results = measureAdapterPerformance();
console.log("adapter".padEnd(10) + "size".padEnd(8) + "ms");
for (const r of results) console.log(r.name.padEnd(10) + String(r.size).padEnd(8) + r.ms.toFixed(3));

const at1000 = results.filter((r) => r.size === 1000);
const worst = at1000.reduce((max, r) => Math.max(max, r.ms), 0);
console.log(`\nWorst transform() time at 1000 packages: ${worst.toFixed(3)}ms (bound: ${MAX_MS_AT_1000}ms)`);
const withinBound = worst <= MAX_MS_AT_1000;
console.log(withinBound ? "Within bound — no optimization indicated." : "OVER BOUND — investigate before merging.");
process.exit(withinBound ? 0 : 1);
