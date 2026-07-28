/**
 * Combined regression runner — lib/ pure-function cases + motor.js
 * vm-sandbox cases + backend auth/persistence checks (Phase A Del 9).
 * Run with: node lib/regression/run.mjs
 */
import { REGRESSION_CASES, runRegressionSuite } from "./suite.mjs";
import { MOTOR_REGRESSION_CASES } from "./motor-cases.mjs";
import { runBackendAuthChecks } from "./backend-auth.mjs";
import { runBackendPersistenceCheck } from "./backend-persistence.mjs";
import { runBackupRestoreDrill } from "./backup-restore-drill.mjs";
import { ADAPTER_GOLDEN_CASES } from "./adapter-golden.mjs";
import { ADAPTER_CONTRACT_CASES } from "./adapter-contract.mjs";
import { ADAPTER_FAILURE_CASES } from "./adapter-failure.mjs";
import { PILOT_UX_CASES } from "./pilot-ux-cases.mjs";

const suiteResults = await runRegressionSuite([
  ...REGRESSION_CASES,
  ...MOTOR_REGRESSION_CASES,
  ...ADAPTER_GOLDEN_CASES,
  ...ADAPTER_CONTRACT_CASES,
  ...ADAPTER_FAILURE_CASES,
  ...PILOT_UX_CASES,
]);
const backendResults = [...runBackendAuthChecks(), ...runBackendPersistenceCheck(), ...runBackupRestoreDrill()];
const results = [...suiteResults, ...backendResults];

for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
const allPassed = results.every((r) => r.passed);
console.log("\n" + results.length + " cases, all passed:", allPassed);
// motor.js's initExportSync()/initTelemetrySync() set setIntervals that have nothing to
// clear them outside a real browser tab — exit explicitly rather than hang.
process.exit(allPassed ? 0 : 1);
