/**
 * Del 9 dry run: 100 simulated workdays. Days 1-50 run under Runtime
 * 128 (a "kjoretoyssjekk" prompt fires unconditionally every day and is
 * mostly ignored). Runtime 129 (day 51) ships one new rule
 * (RUH-on-incident), one new schema (machine_check), and one CHANGED
 * prompt (kjoretoyssjekk only fires once per day instead of nagging —
 * fewer, better-timed prompts). Days 51-100 run under it.
 *
 * Deterministic seeded PRNG, not Math.random() — the simulation itself
 * must be reproducible, consistent with everything else in this
 * platform. No AI anywhere. Run with: node lib/operations-center/dry-run.mjs
 */
import { buildDashboard } from "./dashboard.mjs";
import { compareRuntimeVersions } from "./improvement-analyzer.mjs";

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 0xffffffff;
  };
}
const rng = makeRng(42);

function section(title) {
  console.log("\n=== " + title + " ===");
}

/** @type {import('../telemetry/types.mjs').TelemetryEvent[]} */
const allEvents = [];
function push(type, runtimeVersion, data = {}) {
  allEvents.push({ type, occurredAt: new Date(2026, 6, 1 + allEvents.length).toISOString(), organizationId: "mesta", runtimeVersion, data });
}

const dailyMissingActionCounts = [];

for (let day = 1; day <= 100; day++) {
  const runtimeVersion = day <= 50 ? 128 : 129;
  push("RuntimeLoaded", runtimeVersion, { day });

  push("ObservationCreated", runtimeVersion, { entryType: "notat" });
  push("FactCreated", runtimeVersion, { key: "vehicleCandidate" });
  push("RuleTriggered", runtimeVersion, { ruleId: "rule_kjoretoyssjekk", factKey: "vehicleCandidate" });

  // Runtime 128: unconditional nag, ~82% ignored. Runtime 129: same
  // rule, changed prompt (fires once, better-timed), ~24% ignored.
  const ignoreProbability = runtimeVersion === 128 ? 0.82 : 0.24;
  const ignored = rng() < ignoreProbability;
  push(ignored ? "SchemaSkipped" : "SchemaCompleted", runtimeVersion, { id: "schema_kjoretoyssjekk_" + day, schemaType: "kjoretoyssjekk" });

  // New rule (129 only): incident -> RUH, on ~5% of days, accepted 90% of the time (safety-critical, high completion).
  if (runtimeVersion === 129 && rng() < 0.05) {
    push("FactCreated", runtimeVersion, { key: "incidentReported" });
    push("RuleTriggered", runtimeVersion, { ruleId: "rule_ruh_on_incident", factKey: "incidentReported" });
    push(rng() < 0.9 ? "SchemaCompleted" : "SchemaSkipped", runtimeVersion, { id: "schema_ruh_" + day, schemaType: "ruh" });
  }

  // New schema (129 only): machine_check, ~40% of days, ~70% completion.
  if (runtimeVersion === 129 && rng() < 0.4) {
    push("RuleTriggered", runtimeVersion, { ruleId: "rule_machine_check", factKey: "machineUsed" });
    push(rng() < 0.7 ? "SchemaCompleted" : "SchemaSkipped", runtimeVersion, { id: "schema_machine_check_" + day, schemaType: "machine_check" });
  }

  const exportOk = rng() < 0.97;
  push(exportOk ? "ExportSucceeded" : "ExportFailed", runtimeVersion, { day });

  dailyMissingActionCounts.push(ignored ? 1 : 0);
}

// ---------------------------------------------------------------
section("Runtime 128 (dag 1-50) — dashboard");
const events128 = allEvents.filter((e) => e.runtimeVersion === 128);
console.log(JSON.stringify(buildDashboard(events128, { currentRuntimeVersion: 128, dailyMissingActionCounts: dailyMissingActionCounts.slice(0, 50) }), null, 2));

section("Runtime 129 (dag 51-100) — dashboard");
const events129 = allEvents.filter((e) => e.runtimeVersion === 129);
console.log(JSON.stringify(buildDashboard(events129, { currentRuntimeVersion: 129, dailyMissingActionCounts: dailyMissingActionCounts.slice(50) }), null, 2));

section("Improvement Analyzer — Runtime 128 vs 129");
const comparison = compareRuntimeVersions(events128, events129);
console.log("Completion Rate 128:", (comparison.before.completionRate * 100).toFixed(1) + "%");
console.log("Completion Rate 129:", (comparison.after.completionRate * 100).toFixed(1) + "%");
const kjoretoy128 = comparison.before.promptOutcomes.find((p) => p.target === "kjoretoyssjekk");
const kjoretoy129 = comparison.after.promptOutcomes.find((p) => p.target === "kjoretoyssjekk");
console.log(
  "kjoretoyssjekk ignorert-rate: 128 =", (kjoretoy128.ignoredRate * 100).toFixed(0) + "%,",
  "129 =", (kjoretoy129.ignoredRate * 100).toFixed(0) + "%"
);
console.log("Regresjon:", comparison.regression);

section("Konklusjon (data-utledet, ingen kodeforslag)");
if (!comparison.regression.regressed) {
  console.log("Endringen forbedret Completion Rate. Ingen regresjon oppdaget — ingen anbefaling om rollback.");
} else {
  console.log(comparison.regression.reason + " -> Anbefaling: " + comparison.regression.recommendation);
}
