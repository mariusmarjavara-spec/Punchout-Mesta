/**
 * Combined regression runner — lib/ pure-function cases + motor.js
 * vm-sandbox cases. Run with: node lib/regression/run.mjs
 */
import { REGRESSION_CASES, runRegressionSuite } from "./suite.mjs";
import { MOTOR_REGRESSION_CASES } from "./motor-cases.mjs";

const results = await runRegressionSuite([...REGRESSION_CASES, ...MOTOR_REGRESSION_CASES]);
for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
const allPassed = results.every((r) => r.passed);
console.log("\n" + results.length + " cases, all passed:", allPassed);
// motor.js's initExportSync() sets a setInterval that has nothing to clear
// it outside a real browser tab — exit explicitly rather than hang.
process.exit(allPassed ? 0 : 1);
