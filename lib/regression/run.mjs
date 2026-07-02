/**
 * Combined regression runner — lib/ pure-function cases + motor.js
 * vm-sandbox cases + backend auth/persistence checks (Phase A Del 9).
 * Run with: node lib/regression/run.mjs
 */
import { REGRESSION_CASES, runRegressionSuite } from "./suite.mjs";
import { MOTOR_REGRESSION_CASES } from "./motor-cases.mjs";
import { runBackendAuthChecks } from "./backend-auth.mjs";
import { runBackendPersistenceCheck } from "./backend-persistence.mjs";

const suiteResults = await runRegressionSuite([...REGRESSION_CASES, ...MOTOR_REGRESSION_CASES]);
const backendResults = [...runBackendAuthChecks(), ...runBackendPersistenceCheck()];
const results = [...suiteResults, ...backendResults];

for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
const allPassed = results.every((r) => r.passed);
console.log("\n" + results.length + " cases, all passed:", allPassed);
// motor.js's initExportSync()/initTelemetrySync() set setIntervals that have nothing to
// clear them outside a real browser tab — exit explicitly rather than hang.
process.exit(allPassed ? 0 : 1);
