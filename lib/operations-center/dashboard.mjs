/**
 * Operations Center dashboard (Del 8) — not an admin panel; an analysis
 * snapshot for the product team. One function, one deterministic
 * snapshot object, no AI.
 */
import { completionRate, ruleFrequency, promptOutcomeByTarget, exportHealth, averageMissingActions, runtimeAdoption } from "./metrics.mjs";

/**
 * @param {import('../telemetry/types.mjs').TelemetryEvent[]} events
 * @param {{currentRuntimeVersion?: number, dailyMissingActionCounts?: number[], regressionAlerts?: {regressed:boolean,reason:string}[]}} [opts]
 */
export function buildDashboard(events, opts = {}) {
  const health = exportHealth(events);
  const outcomes = promptOutcomeByTarget(events).filter((p) => p.total > 0);
  return {
    systemHealth: health.successRate == null || health.successRate >= 0.95 ? "OK" : "DEGRADED",
    runtimeVersion: opts.currentRuntimeVersion,
    completionRate: completionRate(events),
    averageMissingActions: averageMissingActions(opts.dailyMissingActionCounts || []),
    topTriggeredRules: ruleFrequency(events).slice(0, 5),
    mostIgnoredPrompts: [...outcomes].sort((a, b) => b.ignoredRate - a.ignoredRate).slice(0, 5),
    mostSuccessfulPrompts: [...outcomes].sort((a, b) => a.ignoredRate - b.ignoredRate).slice(0, 5),
    schemaCompletion: promptOutcomeByTarget(events.filter((e) => e.type.indexOf("Schema") === 0)),
    exportHealth: health,
    runtimeAdoption: runtimeAdoption(events),
    regressionAlerts: opts.regressionAlerts || [],
  };
}
