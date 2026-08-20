/**
 * Combined regression runner — lib/ pure-function cases + motor.js
 * vm-sandbox cases + backend auth/persistence checks (Phase A Del 9).
 * Run with: node lib/regression/run.mjs
 */
import { REGRESSION_CASES, runRegressionSuite } from "./suite.mjs";
import { MOTOR_REGRESSION_CASES } from "./motor-cases.mjs";
import { CONFIG_CONTRACT_CASES } from "./config-contract.mjs";
import { MOTOR_CHARACTERIZATION_CASES } from "./motor-characterization.mjs";
import { RELAY_CASES } from "./relay-cases.mjs";
import { runBackendAuthChecks } from "./backend-auth.mjs";
import { runProvisionRateLimitChecks } from "./provision-rate-limit.mjs";
import { runRuntimePublishCollisionChecks } from "./runtime-publish-collision.mjs";
import { runRetentionTimeBoundChecks } from "./retention-time-bound.mjs";
import { runBackendPersistenceCheck, runProductionDataDirGuardCheck } from "./backend-persistence.mjs";
import { runBackupRestoreDrill } from "./backup-restore-drill.mjs";
import { ADAPTER_GOLDEN_CASES } from "./adapter-golden.mjs";
import { ADAPTER_CONTRACT_CASES } from "./adapter-contract.mjs";
import { ADAPTER_FAILURE_CASES } from "./adapter-failure.mjs";
import { PILOT_UX_CASES } from "./pilot-ux-cases.mjs";
import { CRASH_TELEMETRY_CASES } from "./crash-telemetry.mjs";
import { DAY_TRACE_CASES } from "./day-trace-cases.mjs";
import { checkInvariantCoverage } from "./data-invariants.mjs";

const suiteResults = await runRegressionSuite([
  ...REGRESSION_CASES,
  ...MOTOR_REGRESSION_CASES,
  ...CONFIG_CONTRACT_CASES,
  ...MOTOR_CHARACTERIZATION_CASES,
  ...RELAY_CASES,
  ...ADAPTER_GOLDEN_CASES,
  ...ADAPTER_CONTRACT_CASES,
  ...ADAPTER_FAILURE_CASES,
  ...PILOT_UX_CASES,
  ...CRASH_TELEMETRY_CASES,
  ...DAY_TRACE_CASES,
]);
const backendResults = [
  ...runBackendAuthChecks(),
  ...runProvisionRateLimitChecks(),
  ...runRuntimePublishCollisionChecks(),
  ...runRetentionTimeBoundChecks(),
  ...runBackendPersistenceCheck(),
  ...runProductionDataDirGuardCheck(),
  ...runBackupRestoreDrill(),
];
const results = [...suiteResults, ...backendResults];

for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));

// Data-invariant coverage (docs/DATA_INVARIANTS.md). Checked against the ids
// that actually ran, so a renamed or deleted case surfaces as lost coverage
// rather than quietly reducing what the suite protects.
const coverage = checkInvariantCoverage(results.map((r) => r.id));
console.log("");
for (const failure of coverage.failures) console.log("FAIL — invariant coverage: " + failure);
console.log(
  (coverage.passed ? "PASS" : "FAIL") +
    " — data-invariant coverage (" +
    coverage.covered +
    " invariants)",
);

const allPassed = results.every((r) => r.passed) && coverage.passed;
console.log("\n" + results.length + " cases, all passed:", allPassed);
// motor.js's initExportSync()/initTelemetrySync() set setIntervals that have nothing to
// clear them outside a real browser tab — exit explicitly rather than hang.
process.exit(allPassed ? 0 : 1);
