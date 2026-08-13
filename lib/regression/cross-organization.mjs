/**
 * Phase 10 Del 2: runs the exact same full-day scenario against every
 * organization package, zero per-organization branching. Run with:
 * node lib/regression/cross-organization.mjs
 *
 * Operation Punchout Soft Launch, Phase A finding: ORG_DIRS was a
 * hardcoded 4-entry list (mesta/nordhavn/banenord/nordkraft) that never
 * included `gronnvik` after it was built as the "new customer onboards
 * without a code change" proof — meaning the one regression suite whose
 * entire job is proving that exact claim never actually ran against the
 * org package that was supposed to demonstrate it. Discovering
 * organizations/* dynamically (any subdirectory containing a
 * runtime.json, the one file every real org package has) closes this
 * permanently instead of requiring a human to remember to edit this list
 * the next time a 6th organization is onboarded — the mission's own
 * explicit instruction ("include Grønnvik or any other accepted
 * organization package automatically rather than maintaining a stale
 * hardcoded subset where practical").
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFullDayScenario } from "./full-day-scenario.mjs";

const ORGANIZATIONS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../organizations");

function discoverOrgDirs() {
  return readdirSync(ORGANIZATIONS_ROOT)
    .filter((name) => statSync(path.join(ORGANIZATIONS_ROOT, name)).isDirectory())
    .filter((name) => existsSync(path.join(ORGANIZATIONS_ROOT, name, "runtime.json")))
    .sort()
    .map((name) => "./organizations/" + name);
}

const ORG_DIRS = discoverOrgDirs();
console.log("Discovered organization packages:", ORG_DIRS.join(", "));

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
