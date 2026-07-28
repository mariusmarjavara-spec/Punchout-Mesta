/**
 * Dry run: a full work day, produced by the motor (simulated here as a
 * hand-built DayLog fixture, since motor.js runs in a browser and isn't
 * invoked from Node), pushed through runDryRun() — the same mechanism
 * lib/regression/full-day-scenario.mjs uses in CI — against every
 * adapter in the registry. No real network call is made anywhere in
 * this script.
 *
 * Run with: node lib/adapters/dry-run.mjs
 */
import { runDryRun } from "./dry-run-framework.mjs";
import { listAdapters, getAdapter } from "./registry.mjs";
import { SAMPLE_DAY_LOG, SAMPLE_CONTEXT } from "./fixtures.mjs";

function section(title) {
  console.log("\n=== " + title + " ===");
}

// ---------------------------------------------------------------
// 1. Motor-data — what the deterministic engine produced for the day
//    (start dag -> SJA -> arbeid -> maskin -> avslutt dag -> lås dag)
// ---------------------------------------------------------------
section("1. Motor-data (DayLog etter lås)");

const dayLog = SAMPLE_DAY_LOG;
const context = SAMPLE_CONTEXT;
console.log(JSON.stringify(dayLog, null, 2));

// ---------------------------------------------------------------
// 2. Full trace against the reference adapter (Landax)
// ---------------------------------------------------------------
section("2. runDryRun() — landax (referanseadapter)");

const landaxResult = await runDryRun(dayLog, context, getAdapter("landax"), (msg) => console.log(msg));
console.log("\nExportEnvelope:");
console.log(JSON.stringify(landaxResult.envelope, null, 2));
console.log("\nTransformert payload:");
console.log(JSON.stringify(landaxResult.adapterResult, null, 2));

// ---------------------------------------------------------------
// 3. Same envelope, every registered adapter — proves the pipeline is
//    receiver-agnostic, not just "works for Landax".
// ---------------------------------------------------------------
section("3. runDryRun() — alle registrerte adaptere");

const allResults = [];
for (const descriptor of listAdapters()) {
  const result = await runDryRun(dayLog, context, descriptor);
  allResults.push(result);
  console.log(
    `${result.ok ? "OK  " : "FAIL"} adapter=${result.adapterName.padEnd(8)} ` +
      `duration=${result.durationMs.toFixed(2)}ms ` +
      `uncoveredCapabilities=[${result.uncoveredCapabilities.join(", ")}]`
  );
}

section("Oppsummering");
const allOk = allResults.every((r) => r.ok);
console.log(`${allResults.length} adaptere kjørt, alle ok: ${allOk}`);
process.exit(allOk ? 0 : 1);
