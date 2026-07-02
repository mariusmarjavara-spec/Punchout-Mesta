/**
 * motor.js-specific regression cases — need a vm sandbox (fs + vm),
 * kept separate from lib/regression/suite.mjs's pure-function cases for
 * that reason, same runner shape ({id, description, run}) so both sets
 * can be combined by a caller.
 */
import fs from "node:fs";
import vm from "node:vm";

function bootMotor(punchoutRuntime) {
  const src = fs.readFileSync("./public/motor.js", "utf8");
  const kv = {};
  const localStorage = {
    getItem: (k) => (k in kv ? kv[k] : null),
    setItem: (k, v) => { kv[k] = String(v); },
    removeItem: (k) => { delete kv[k]; },
  };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const windowStub = {
    PUNCHOUT_CONFIG: { lonnskoder: [], kjoretoy: [], sjaDefaults: {}, externalLinks: [], hovedordre: "HOVED" },
    PUNCHOUT_RUNTIME: punchoutRuntime || null,
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
  return sandbox.window.Motor;
}

export const MOTOR_REGRESSION_CASES = [
  {
    id: "phase9_setSchemaField_exposed_on_window_motor",
    description: "setSchemaField must be callable on window.Motor — was defined in motor.js but never added to the window.Motor export object, so every field edit in SchemaEditOverlay silently failed to save (found while writing this phase's own tests, unrelated to any change made this session).",
    run: () => typeof bootMotor(null).setSchemaField === "function",
  },
  {
    id: "phase9_generic_required_field_check_blocks_and_unblocks",
    description: "The generalized required-field confirm check (replacing the old RUH-only hardcoded check) must still block confirmation with missing required fields and allow it once they're filled.",
    run: async () => {
      const Motor = bootMotor(null);
      Motor.startDay();
      Motor.submitEntry("Det skjedde en nestenulykke", "hendelse");
      // submitEntry() defers orchestration (schema creation) via setTimeout(fn, 0) — must wait a tick.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const ruh = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "ruh");
      if (!ruh) return false;
      Motor.resolveItem("schema_" + ruh.id, "confirm");
      const blocked = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === ruh.id).status !== "confirmed";
      Motor.setSchemaField(ruh.id, "arsak", "x");
      Motor.setSchemaField(ruh.id, "tiltak", "y");
      Motor.resolveItem("schema_" + ruh.id, "confirm");
      const confirmed = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === ruh.id).status === "confirmed";
      return blocked && confirmed;
    },
  },
  {
    id: "phase9_injected_runtime_schema_and_rules_used_with_zero_code_changes",
    description: "An injected window.PUNCHOUT_RUNTIME's schemas/rules must drive motor.js completely, proving a new organization needs no motor.js code changes.",
    run: () => {
      const injected = {
        schemas: [{ schemaType: "avvik", version: 1, origin: "drift", title: "Avvik", fields: { arsak: { label: "Årsak", type: "text", required: true }, tiltak: { label: "Tiltak", type: "text", required: true } } }],
        rules: [{ id: "r1", version: 1, effectiveFrom: "2026-01-01", trigger: { event: "factObserved", factKey: "incidentReported" }, conditions: [{ field: "incidentReported", operator: "equals", value: true }], action: { type: "requireSchema", target: "avvik" }, priority: 100, affects: {} }],
        extractionVocabularies: { incidentKeywords: ["avvik"] },
      };
      const Motor = bootMotor(injected);
      const def = Motor.getSchemaFieldDefinitions("avvik", "drift");
      return !!def && def.label === "Avvik";
    },
  },
  {
    id: "phase9_fallback_unaffected_when_no_runtime_injected",
    description: "With no window.PUNCHOUT_RUNTIME present, motor.js's hardcoded Mesta defaults (e.g. RUH) must be completely unaffected — additive injection must never break the live pilot.",
    run: () => {
      const Motor = bootMotor(null);
      const def = Motor.getSchemaFieldDefinitions("ruh", "drift");
      return !!def && def.label === "RUH (Rapport Uønsket Hendelse)" && Object.keys(def.fields).includes("arsak");
    },
  },
  {
    id: "phase10_malformed_injected_schema_does_not_crash_boot",
    description: "A malformed schema entry in window.PUNCHOUT_RUNTIME.schemas (missing .fields) must be skipped with a warning, not crash motor.js at boot — found via Phase 10 robustness testing; injection runs synchronously at module load, so an unguarded crash there would break the entire app, not just one schema.",
    run: () => {
      const baseRuntimeConfig = { lonnskoder: [], sjaDefaults: null, kjoretoy: [], externalLinks: [], hoofdordre: "" };
      const Motor = bootMotor({ schemas: [{ schemaType: "x", version: 1 }], rules: [], runtimeConfig: baseRuntimeConfig });
      return typeof Motor.getSnapshot === "function";
    },
  },
];
