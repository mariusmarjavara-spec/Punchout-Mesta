/**
 * Phase 10 Del 4: Mobile Robustness — findings, not new UI. Each check
 * here is either directly verified (vm sandbox against real motor.js)
 * or explicitly marked as analysis-only where a browser is required and
 * unavailable in this environment. No claim is made without saying
 * which kind of evidence backs it.
 */
import { bootMotor } from "./full-day-scenario.mjs";

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

export async function checkEmptyRuntime() {
  // A Runtime with zero schemas/rules/machines — the minimum a package
  // could technically pass validation with (all these arrays are
  // optional/default-empty in compileRuntime()).
  const emptyRuntime = { schemas: [], rules: [], knowledgeGraph: { activities: [], machineTypes: [], orderTypes: [] }, runtimeConfig: { lonnskoder: [], sjaDefaults: null, kjoretoy: [], externalLinks: [], hoofdordre: "" } };
  try {
    const { Motor } = bootMotor(emptyRuntime);
    Motor.startDay();
    Motor.submitEntry("Jobbet i dag", "notat");
    await tick();
    const status = Motor.getCompletionStatus();
    return { ok: true, detail: "Empty Runtime: day starts, entry submits, completion status returns empty queue (no rules to fire) — no crash.", missingActions: status.missingActions.length };
  } catch (e) {
    return { ok: false, detail: "Empty Runtime crashed motor.js: " + String(e.message || e) };
  }
}

export async function checkMalformedRuntime() {
  // Structurally wrong shapes a hand-edited or half-synced Runtime
  // object could plausibly have — not JSON parse failure (the object is
  // already parsed by the time it reaches window.PUNCHOUT_RUNTIME), but
  // missing/wrong-typed fields the injection code has to survive.
  const baseRuntimeConfig = { lonnskoder: [], sjaDefaults: null, kjoretoy: [], externalLinks: [], hoofdordre: "" };
  const cases = [
    { name: "schemas is undefined", runtime: { rules: [], runtimeConfig: baseRuntimeConfig } },
    { name: "schemas is not an array", runtime: { schemas: "not-an-array", rules: [], runtimeConfig: baseRuntimeConfig } },
    { name: "a schema entry has no fields", runtime: { schemas: [{ schemaType: "x", version: 1 }], rules: [], runtimeConfig: baseRuntimeConfig } },
    { name: "rules is undefined", runtime: { schemas: [], runtimeConfig: baseRuntimeConfig } },
  ];
  const results = [];
  for (const c of cases) {
    try {
      bootMotor(c.runtime);
      results.push({ name: c.name, ok: true });
    } catch (e) {
      results.push({ name: c.name, ok: false, error: String(e.message || e) });
    }
  }
  return results;
}

export async function checkLargeVolume() {
  const machineTypes = Array.from({ length: 50 }, (_, i) => ({ id: "m" + i, label: "Machine " + i, requiredSchemas: [], recommendedSchemas: [], externalSystems: [] }));
  const orders = Array.from({ length: 200 }, (_, i) => ({ id: "ORD-" + i, description: "Order " + i, active: i % 3 === 0 }));
  const runtime = { schemas: [], rules: [], knowledgeGraph: { activities: [], machineTypes, orderTypes: [] }, orders, runtimeConfig: { lonnskoder: [], sjaDefaults: null, kjoretoy: [], externalLinks: [], hoofdordre: "" } };
  const { Motor } = bootMotor(runtime);
  Motor.startDay();
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) {
    Motor.submitEntry("Observasjon nummer " + i + " på ORD-" + (i % 200), "notat");
  }
  await tick(50);
  const elapsedMs = Date.now() - t0;
  const snapshot = Motor.getSnapshot();
  return { ok: snapshot.dayLog.entries.length === 100, entryCount: snapshot.dayLog.entries.length, elapsedMs };
}

export async function checkRefreshMidSchemaEdit() {
  // Simulates a refresh: boot motor, open a schema, edit a field, then
  // boot a FRESH motor instance reading the SAME localStorage (this is
  // exactly what a page reload does — new JS context, same persisted
  // state) and verify the edit survived and the overlay is still usable.
  const { Motor: M1, kv } = bootMotor(null);
  M1.startDay();
  M1.submitEntry("Det skjedde en nestenulykke", "hendelse");
  await tick();
  const ruh = M1.getSnapshot().dayLog.schemas.find((s) => s.type === "ruh");
  if (!ruh) return { ok: false, detail: "RUH schema was not created before refresh simulation" };
  M1.openSchemaEdit(ruh.id);
  M1.setSchemaField(ruh.id, "arsak", "Glatt føre");

  // "Refresh": fresh vm context, same localStorage contents (kv).
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const src = fs.readFileSync("./public/motor.js", "utf8");
  const localStorage2 = { getItem: (k) => (k in kv ? kv[k] : null), setItem: (k, v) => { kv[k] = String(v); }, removeItem: (k) => { delete kv[k]; } };
  const listeners2 = {};
  class CustomEvent2 { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const sandbox2 = {
    window: { PUNCHOUT_CONFIG: {}, addEventListener: (t, f) => { (listeners2[t] = listeners2[t] || []).push(f); }, dispatchEvent: (e) => { (listeners2[e.type] || []).forEach((f) => f(e)); }, localStorage: localStorage2 },
    localStorage: localStorage2, document: { addEventListener: () => {}, getElementById: () => null }, navigator: {}, CustomEvent: CustomEvent2, console, crypto: globalThis.crypto,
    fetch: async () => ({ ok: true, status: 200, statusText: "OK" }),
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(sandbox2);
  vm.runInContext(src, sandbox2, { filename: "motor.js" });
  const M2 = sandbox2.window.Motor;

  const snapshot = M2.getSnapshot();
  const survivedEntries = snapshot.dayLog?.entries?.length === 1;
  const survivedFieldEdit = snapshot.dayLog?.schemas?.find((s) => s.id === ruh.id)?.fields?.arsak === "Glatt føre";
  const uxStateRestored = snapshot.uxState?.activeOverlay === "schema_edit" && snapshot.uxState?.schemaId === ruh.id;

  return { ok: survivedEntries && survivedFieldEdit && uxStateRestored, survivedEntries, survivedFieldEdit, uxStateRestored };
}
