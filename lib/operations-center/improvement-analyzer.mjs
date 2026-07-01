/**
 * Improvement Analyzer (Del 7) — deterministic before/after comparison.
 * Never proposes code. Only reports measured effects and, when a
 * threshold is crossed, a plain observation-based recommendation
 * ("vurder rollback") — never a fix.
 */
import { completionRate, promptOutcomeByTarget } from "./metrics.mjs";

/**
 * @param {{completionRate: number|null}} before
 * @param {{completionRate: number|null}} after
 * @param {{completionRateDrop: number}} [thresholds]
 */
export function detectRegression(before, after, thresholds = { completionRateDrop: 0.05 }) {
  if (before.completionRate == null || after.completionRate == null) {
    return { regressed: false, reason: "utilstrekkelig data" };
  }
  const delta = after.completionRate - before.completionRate;
  const pct = (v) => (v * 100).toFixed(1) + "%";
  if (delta <= -thresholds.completionRateDrop) {
    return {
      regressed: true,
      reason: "Completion Rate falt fra " + pct(before.completionRate) + " til " + pct(after.completionRate),
      recommendation: "Vurder rollback",
    };
  }
  return { regressed: false, reason: "Completion Rate endret seg fra " + pct(before.completionRate) + " til " + pct(after.completionRate) };
}

/**
 * @param {import('../telemetry/types.mjs').TelemetryEvent[]} beforeEvents
 * @param {import('../telemetry/types.mjs').TelemetryEvent[]} afterEvents
 */
export function compareRuntimeVersions(beforeEvents, afterEvents) {
  const before = { completionRate: completionRate(beforeEvents), promptOutcomes: promptOutcomeByTarget(beforeEvents) };
  const after = { completionRate: completionRate(afterEvents), promptOutcomes: promptOutcomeByTarget(afterEvents) };
  return { before, after, regression: detectRegression(before, after) };
}
