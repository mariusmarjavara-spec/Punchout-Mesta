/**
 * Phase 10 Del 2: runs the exact same full-day scenario against every
 * organization package, zero per-organization branching. Run with:
 * node lib/regression/cross-organization.mjs
 */
import { runFullDayScenario } from "./full-day-scenario.mjs";

const ORG_DIRS = ["./organizations/mesta", "./organizations/nordhavn", "./organizations/banenord", "./organizations/nordkraft"];

const results = [];
for (const dir of ORG_DIRS) {
  const result = await runFullDayScenario(dir);
  results.push(result);
  console.log((result.ok ? "PASS" : "FAIL") + " — " + dir + " (stage: " + result.stage + ")");
  console.log("  " + JSON.stringify(result.detail));
}

const allPassed = results.every((r) => r.ok);
console.log("\nAll organizations passed the identical scenario:", allPassed);
process.exit(allPassed ? 0 : 1);
