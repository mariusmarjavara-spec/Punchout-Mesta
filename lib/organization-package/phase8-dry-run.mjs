/**
 * Phase 8 consolidated dry run: Mesta v1 -> v2 (one rule priority
 * change, one new schema), Runtime Documentation, Runtime Diff,
 * Operations Center Runtime Health, and the full Regression Library.
 * Run with: node lib/organization-package/phase8-dry-run.mjs
 */
import { loadOrganizationPackage } from "./loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";
import { generateRuntimeDocumentation } from "../runtime/document.mjs";
import { diffRuntimes } from "../runtime/diff.mjs";
import { runtimeHealth } from "../operations-center/runtime-health.mjs";
import { runRegressionSuite } from "../regression/suite.mjs";

function section(t) { console.log("\n=== " + t + " ==="); }

section("Mesta Runtime v1 (from organizations/mesta package)");
const { input } = loadOrganizationPackage("./organizations/mesta");
const v1 = compileRuntime(input, { runtimeVersion: 1 }).runtime;
console.log("v1 checksum:", v1.checksum, "| rules:", v1.rules.map((r) => r.id + "@" + r.priority));

section("Phase 4: Runtime Documentation (generated, never hand-maintained)");
console.log(generateRuntimeDocumentation(v1));

section("Mesta Runtime v2 — one rule priority change, one new preferred candidate");
const inputV2 = {
  ...input,
  rules: input.rules.map((r) => (r.id === "rule_ruh_on_incident" ? { ...r, priority: 150 } : r)),
  preferredCandidates: [{ category: "order", value: "204481-0149", bonus: 3 }],
};
const v2 = compileRuntime(inputV2, { runtimeVersion: 2 }).runtime;

section("Phase 6: Runtime Diff (v1 -> v2)");
const diff = diffRuntimes(v1, v2);
console.log(JSON.stringify(diff, null, 2));

section("Phase 8: Operations Center — Runtime Health");
const syntheticTelemetry = [
  { type: "RuleTriggered", occurredAt: new Date().toISOString(), organizationId: "mesta", data: { ruleId: "rule_ruh_on_incident" } },
  // rule_required_schema_from_machine deliberately never triggered in this synthetic window
];
const health = runtimeHealth(v2, syntheticTelemetry, [], []);
console.log(JSON.stringify(health, null, 2));

section("Phase 9: Regression Library");
const results = runRegressionSuite();
for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
const allPassed = results.every((r) => r.passed);
console.log("\nAll regression cases passed:", allPassed);
if (!allPassed) process.exit(1);
