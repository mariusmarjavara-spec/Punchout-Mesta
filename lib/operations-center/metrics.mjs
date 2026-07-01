/**
 * Pure functions over TelemetryEvent[] (lib/telemetry/types.mjs). No AI,
 * no scoring — counting and division only. This is the read side; it
 * never writes anything back, never touches dayLog.
 */

const POSITIVE = ["PromptAccepted", "SchemaCompleted"];
const NEGATIVE = ["PromptDismissed", "SchemaSkipped"];

/** @param {import('../telemetry/types.mjs').TelemetryEvent[]} events */
export function completionRate(events) {
  const positive = events.filter((e) => POSITIVE.includes(e.type)).length;
  const negative = events.filter((e) => NEGATIVE.includes(e.type)).length;
  const total = positive + negative;
  return total === 0 ? null : positive / total;
}

export function ruleFrequency(events) {
  const counts = {};
  for (const e of events) if (e.type === "RuleTriggered") counts[e.data.ruleId] = (counts[e.data.ruleId] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([ruleId, count]) => ({ ruleId, count }));
}

/** Groups Prompt/Schema outcome events by target (schemaType when present, else the item id). */
export function promptOutcomeByTarget(events) {
  const byTarget = {};
  for (const e of events) {
    if (![...POSITIVE, ...NEGATIVE].includes(e.type)) continue;
    const key = e.data.schemaType || e.data.id;
    byTarget[key] = byTarget[key] || { accepted: 0, dismissed: 0 };
    if (POSITIVE.includes(e.type)) byTarget[key].accepted++;
    else byTarget[key].dismissed++;
  }
  return Object.entries(byTarget).map(([target, { accepted, dismissed }]) => ({
    target, accepted, dismissed, total: accepted + dismissed,
    ignoredRate: accepted + dismissed ? dismissed / (accepted + dismissed) : null,
  }));
}

export function exportHealth(events) {
  const success = events.filter((e) => e.type === "ExportSucceeded").length;
  const failed = events.filter((e) => e.type === "ExportFailed").length;
  const total = success + failed;
  return { success, failed, successRate: total ? success / total : null };
}

export function averageMissingActions(dailyCounts) {
  return dailyCounts.length ? dailyCounts.reduce((a, b) => a + b, 0) / dailyCounts.length : null;
}

/** Fraction of events tagged with the newest runtimeVersion seen — how fast the fleet moved to the latest Runtime. */
export function runtimeAdoption(events) {
  const versions = events.map((e) => e.runtimeVersion).filter((v) => v !== undefined);
  if (!versions.length) return null;
  const latest = Math.max(...versions);
  return versions.filter((v) => v === latest).length / versions.length;
}
