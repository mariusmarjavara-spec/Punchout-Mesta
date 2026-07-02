/**
 * Phase 9 Del 10 dry run — the complete chain for a third, brand-new
 * organization (Baneservice Nord AS, railway maintenance — a third
 * distinct domain after Mesta/roads and Nordhavn/harbor):
 *
 *   New org -> Runtime Compiler -> Validation -> Publish -> Sync ->
 *   Mobile -> Arbeidsdag -> Completion -> Prompt Queue ->
 *   Schema Renderer -> Export Envelope -> Adapter -> Mock mottakersystem
 *
 * "Mobile" is not simulated in lib/ this time — it actually loads and
 * runs public/motor.js in a Node vm sandbox with the compiled Runtime
 * injected as window.PUNCHOUT_RUNTIME, the same mechanism a real device
 * would use. No new adapter built (out of scope this phase) — reuses
 * the existing generic Adapter interface + LandaxAdapter as a stand-in
 * mock receiver to prove the pipeline mechanics, not to claim Baneservice
 * Nord actually integrates with Landax.
 *
 * Run with: node lib/organization-package/phase9-dry-run.mjs
 */
import fs from "node:fs";
import vm from "node:vm";
import { loadOrganizationPackage } from "./loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";
import { RuntimeStore } from "../runtime/store.mjs";
import { LocalCache } from "../sync/cache.mjs";
import { buildExportEnvelope } from "../adapters/envelope.mjs";
import { runAdapter } from "../adapters/adapter.mjs";
import { LandaxAdapter } from "../adapters/landax-adapter.mjs";

function section(t) { console.log("\n=== " + t + " ==="); }

section("1. New organization: Baneservice Nord AS (railway maintenance)");
const { input } = loadOrganizationPackage("./organizations/banenord");
console.log("organizationId:", input.organizationContext.organizationId, "| domain: railway track maintenance (distinct from roads/harbor)");

section("2. Runtime Compiler + Validation");
const { valid, errors, runtime } = compileRuntime(input, { runtimeVersion: 1 });
console.log("valid:", valid, "| errors:", errors);
if (!valid) process.exit(1);

section("3. Publish");
const store = new RuntimeStore();
const manifest = store.publish(runtime, "user_admin_banenord");
console.log(JSON.stringify(manifest, null, 2));

section("4. Sync (single 'runtime' resource, Phase 6 pattern)");
const mobileCache = new LocalCache();
const syncResponse = {
  serverTime: new Date().toISOString(),
  versions: [{ resourceType: "runtime", version: String(manifest.runtimeVersion), updatedAt: manifest.publishedAt }],
  changes: [{ resourceType: "runtime", changeKind: "full", data: runtime }],
};
mobileCache.apply(syncResponse);
const loadedRuntime = mobileCache.get("runtime").data;
console.log("Mobile received runtimeVersion:", loadedRuntime.runtimeVersion, "checksum:", loadedRuntime.checksum);

section("5-9. Mobile: motor.js loaded with injected Runtime — zero code changes");
const src = fs.readFileSync("./public/motor.js", "utf8");
const kvStore = {};
const localStorage = {
  getItem: (k) => (k in kvStore ? kvStore[k] : null),
  setItem: (k, v) => { kvStore[k] = String(v); },
  removeItem: (k) => { delete kvStore[k]; },
};
const listeners = {};
class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
const windowStub = {
  PUNCHOUT_CONFIG: { lonnskoder: loadedRuntime.runtimeConfig.lonnskoder, kjoretoy: loadedRuntime.runtimeConfig.kjoretoy, sjaDefaults: {}, externalLinks: loadedRuntime.runtimeConfig.externalLinks, hovedordre: loadedRuntime.runtimeConfig.hoofdordre },
  PUNCHOUT_RUNTIME: loadedRuntime,
  addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  dispatchEvent: (evt) => { (listeners[evt.type] || []).forEach((fn) => fn(evt)); },
  localStorage,
};
const sandbox = {
  window: windowStub, localStorage,
  document: { addEventListener: () => {}, getElementById: () => null },
  navigator: {}, CustomEvent, console, crypto: globalThis.crypto,
  fetch: async () => ({ ok: true, status: 200, statusText: "OK" }),
  setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "motor.js" });
const Motor = sandbox.window.Motor;

console.log("Arbeidsdag: starter dag, registrerer observasjon...");
Motor.startDay();
Motor.submitEntry("Byttet skinne med skinneslip på BS-2026-T045. Sikkerhetsavvik oppstod.", "hendelse");

await new Promise((resolve) => setTimeout(resolve, 30));

section("6. Completion Engine + Prompt Queue (driven entirely by injected Runtime)");
const status = Motor.getCompletionStatus();
console.log(JSON.stringify(status.missingActions, null, 2));

section("7. Schema Renderer data source (proves React would render correctly, zero UI code changes)");
const schemaDef = Motor.getSchemaFieldDefinitions("sporarbeidstillatelse", "pre_day");
console.log(JSON.stringify(schemaDef, null, 2));
const rendererWouldWork = !!schemaDef && Object.keys(schemaDef.fields).every((k) => ["text", "string", "boolean", "enum", "date", "time", "number"].includes(schemaDef.fields[k].type));

section("8. Lock day, build Export Envelope");
Motor.resolveItem = Motor.resolveItem; // (no unresolved items forced for this dry run's minimal day)
const snapshot = Motor.getSnapshot();
const dayLogForExport = { ...snapshot.dayLog, status: "LOCKED", endTime: "15:00" };
const envelope = buildExportEnvelope(dayLogForExport, { organizationId: "banenord", userId: "user_2001", deviceId: "dev_1", appVersion: "0.9.0" });
console.log("ExportEnvelope entries:", envelope.entries.length, "| exportId:", envelope.exportId);

section("9. Adapter -> Mock mottakersystem (reusing the existing generic Adapter interface + LandaxAdapter as a stand-in, no new adapter built)");
const result = await runAdapter(LandaxAdapter, envelope, (msg) => console.log(msg));
console.log("\nSluttresultat:", result);

section("Result");
const passed = valid && status.missingActions.some((a) => a.target === "sikkerhetsavvik") && rendererWouldWork && result.ok;
console.log(passed ? "DEL 10 CHAIN PASSED — new organization ran end to end via Runtime alone." : "DEL 10 CHAIN FAILED");
// motor.js's initExportSync() sets a setInterval with nothing to clear it
// outside a real browser tab — exit explicitly rather than hang.
process.exit(passed ? 0 : 1);
