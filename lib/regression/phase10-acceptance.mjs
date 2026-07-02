/**
 * Phase 10 Del 8: the complete chain for a new organization (Nordkraft
 * Vannkraft AS — hydropower, added this phase), followed by the full
 * regression suite and the Operations Center reading the results.
 * Run with: node lib/regression/phase10-acceptance.mjs
 */
import { runFullDayScenario } from "./full-day-scenario.mjs";
import { REGRESSION_CASES, runRegressionSuite } from "./suite.mjs";
import { MOTOR_REGRESSION_CASES } from "./motor-cases.mjs";
import { checkEmptyRuntime, checkMalformedRuntime, checkLargeVolume, checkRefreshMidSchemaEdit } from "./robustness-checks.mjs";
import { loadOrganizationPackage } from "../organization-package/loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";
import { platformHealth } from "../operations-center/platform-health.mjs";
import { productConfidenceIndex } from "../operations-center/confidence-index.mjs";

function section(t) { console.log("\n=== " + t + " ==="); }

const ORG_DIRS = ["./organizations/mesta", "./organizations/nordhavn", "./organizations/banenord", "./organizations/nordkraft"];

section("Del 8: New organization end to end — Nordkraft Vannkraft AS (hydropower)");
const nordkraftResult = await runFullDayScenario("./organizations/nordkraft");
console.log(JSON.stringify(nordkraftResult, null, 2));

section("Cross-Organization Suite (Del 2) — same scenario, all 4 organizations");
const crossOrgResults = [];
for (const dir of ORG_DIRS) {
  const r = await runFullDayScenario(dir);
  crossOrgResults.push({ organizationId: r.organizationId, ok: r.ok });
  console.log((r.ok ? "PASS" : "FAIL") + " " + dir);
}

section("Runtime Validation (Del 3) — compile every package");
const compileAttempts = [];
for (const dir of ORG_DIRS) {
  const { input } = loadOrganizationPackage(dir);
  const { valid, errors } = compileRuntime(input, { runtimeVersion: 1 });
  compileAttempts.push({ valid, errors });
  console.log(dir + ": " + (valid ? "valid" : "INVALID: " + errors.join("; ")));
}

section("Regression Suite (Del 1)");
const allRegression = await runRegressionSuite([...REGRESSION_CASES, ...MOTOR_REGRESSION_CASES]);
for (const r of allRegression) console.log((r.passed ? "PASS" : "FAIL") + " " + r.id);

section("Mobile Robustness (Del 4)");
const robustnessResults = [
  { name: "emptyRuntime", ...(await checkEmptyRuntime()) },
  ...(await checkMalformedRuntime()).map((r) => ({ name: "malformed:" + r.name, ...r })),
  { name: "largeVolume", ...(await checkLargeVolume()) },
  { name: "refreshMidSchemaEdit", ...(await checkRefreshMidSchemaEdit()) },
];
for (const r of robustnessResults) console.log((r.ok ? "PASS" : "FAIL") + " " + r.name);

section("Operations Center (Del 6) — Platform Health");
const health = platformHealth({
  regressionResults: allRegression,
  crossOrgResults,
  compileAttempts,
  telemetry: [],
  correctionEntries: [],
});
console.log(JSON.stringify(health, null, 2));

section("Product Confidence Index (Del 7)");
const motorRegressionResults = allRegression.filter((r) => MOTOR_REGRESSION_CASES.some((c) => c.id === r.id));
const confidence = productConfidenceIndex({
  motorRegressionResults,
  runtimeCompileAttempts: compileAttempts,
  crossOrgResults,
  robustnessResults,
  allRegressionResults: allRegression,
});
console.log(JSON.stringify(confidence, null, 2));

section("Result");
const allOk = nordkraftResult.ok && crossOrgResults.every((r) => r.ok) && compileAttempts.every((a) => a.valid) && allRegression.every((r) => r.passed) && health.overallRobust;
console.log(allOk ? "PHASE 10 DEL 8 ACCEPTANCE PASSED" : "PHASE 10 DEL 8 ACCEPTANCE FAILED");
process.exit(allOk ? 0 : 1);
