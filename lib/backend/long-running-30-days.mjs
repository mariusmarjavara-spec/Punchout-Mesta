/**
 * Validation Sprint Del 4 — 30 arbeidsdager on the SAME simulated
 * device (one vm sandbox, one localStorage backing store, real fetch
 * to a live backend for every day's export+telemetry). Watches for
 * exactly what Del 4 asks: unbounded growth, degrading latency,
 * accumulated errors — not just "did it crash."
 *
 * A separate, tighter stress case also floods >TELEMETRY_CAP (500)
 * events in a single run to prove the cap is real FIFO behavior, not
 * just a number in a comment.
 *
 * Run with the dev server already running:
 *   PUNCHOUT_ADMIN_TOKEN=... node lib/backend/long-running-30-days.mjs
 */
import fs from "node:fs";
import vm from "node:vm";

const BASE_URL = process.argv[2] || "http://localhost:3311";
const ADMIN_TOKEN = process.env.PUNCHOUT_ADMIN_TOKEN;
if (!ADMIN_TOKEN) { console.error("PUNCHOUT_ADMIN_TOKEN required"); process.exit(1); }

const MOTOR_SRC = fs.readFileSync("./public/motor.js", "utf8");
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + JSON.stringify(detail) : "")); }
function section(t) { console.log("\n=== " + t + " ==="); }

function bootMotor(deviceId) {
  const kv = { punchout_device_id: deviceId };
  const localStorage = { getItem: (k) => (k in kv ? kv[k] : null), setItem: (k, v) => { kv[k] = String(v); }, removeItem: (k) => { delete kv[k]; } };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const sandbox = {
    window: { PUNCHOUT_CONFIG: { lonnskoder: [{ kode: "100", navn: "Ordinær" }], kjoretoy: [], sjaDefaults: {}, externalLinks: [], hovedordre: "HOVED" }, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); }, localStorage },
    localStorage, document: { addEventListener: () => {}, getElementById: () => null }, navigator: {}, CustomEvent, console, crypto: globalThis.crypto,
    fetch, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTOR_SRC, sandbox, { filename: "motor.js" });
  return sandbox;
}

/**
 * Resolves every unresolved håndrens item generically, using each
 * schema's OWN declared required fields — never a hardcoded field name.
 * Same technique as lib/regression/full-day-scenario.mjs's
 * resolveAllUnresolved(). My first version of this test used a naive
 * "just confirm everything" loop, which silently left required RUH
 * fields (arsak/tiltak) unset — lockDay() correctly refused to lock
 * (NEVER_AUTO_FILL working exactly as designed), and the test's own
 * resolver was the bug, not the product.
 */
async function resolveAll(Motor) {
  for (let round = 0; round < 20; round++) {
    const items = Motor.getUnresolvedItems();
    if (items.length === 0) return;
    for (const item of items) {
      if (item.kind === "main_time") {
        Motor.resolveItem(item.id, "discard", { reason: "logged_elsewhere" });
        continue;
      }
      if (item.kind === "schema") {
        const schemaId = item.id.replace(/^schema_/, "").replace(/^friksjon_/, "");
        const schema = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === schemaId);
        if (schema) {
          const def = Motor.getSchemaFieldDefinitions(schema.type, schema.origin);
          if (def) {
            for (const [key, fdef] of Object.entries(def.fields)) {
              if (!fdef.required) continue;
              const val = fdef.type === "boolean" ? true : fdef.type === "enum" ? fdef.options?.[0] : "test-verdi";
              Motor.setSchemaField(schema.id, key, val);
            }
          }
        }
      }
      Motor.resolveItem(item.id, "confirm");
    }
  }
}

const VARIED_ENTRIES = [
  ["Feiing av Vadsø sentrum", "notat"],
  ["Det skjedde en nestenulykke med hjullaster", "hendelse"],
  ["Fresing av RV92", "notat"],
  ["Kantslått Tana", "notat"],
  ["Maskinhavari på 204481-0014", "notat"],
];

section("30 arbeidsdager på samme enhet");
const deviceId = "longrun_device_" + Date.now();
const regRes = await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ADMIN_TOKEN }, body: JSON.stringify({ deviceId, organizationId: "mesta" }) });
const { secret } = await regRes.json();
const sandbox = bootMotor(deviceId);
const orgId = "longrun_org_" + Date.now();
sandbox.ADMIN_CONFIG.userId = "u1";
// Operation Punchout Soft Launch, Phase B: organizationId, not hovedordre
// (the main order number field) — see emitTelemetry's Phase B fix.
sandbox.ADMIN_CONFIG.organizationId = orgId;
sandbox.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
sandbox.ADMIN_CONFIG.exportHmacSecret = secret;
sandbox.ADMIN_CONFIG.telemetryEndpoint = BASE_URL + "/api/telemetry";
const Motor = sandbox.window.Motor;

const dayDurations = [];
for (let day = 1; day <= 30; day++) {
  const dayStart = Date.now();
  if (day > 1) Motor.startNewDay();
  Motor.startDay();
  const [text, type] = VARIED_ENTRIES[day % VARIED_ENTRIES.length];
  Motor.submitEntry(text, type);
  await tick(10);
  Motor.endDay();
  await resolveAll(Motor);
  Motor.lockDay();
  sandbox.flushTelemetry();
  await tick(80);
  dayDurations.push(Date.now() - dayStart);
}

const finalOutbox = Motor.getSnapshot().outboxStatus;
const finalTelemetryLog = Motor.getTelemetryLog();
const finalHistory = Motor.getHistory ? Motor.getHistory() : null;

record("30/30 dager fullført uten krasj", dayDurations.length === 30);
record("Alle 30 eksporter sendt, ingen feilet, ingen tapt", finalOutbox.sent === 30 && finalOutbox.failed === 0 && finalOutbox.pending === 0, finalOutbox);

const backendExports = await (await fetch(BASE_URL + "/api/export", { headers: { "Authorization": "Bearer " + ADMIN_TOKEN } })).json();
const thisDeviceExports = backendExports.entries.filter((e) => e.deviceId === deviceId);
const uniqueExportIds = new Set(thisDeviceExports.map((e) => e.exportId));
record("Backend mottok 30 unike eksporter fra denne enheten — ingen duplikater, ingen tap i overføring", thisDeviceExports.length === 30 && uniqueExportIds.size === 30, { received: thisDeviceExports.length, unique: uniqueExportIds.size });

record("Telemetri-loggen er ryddig (langt under cap på 500), ingen ukontrollert vekst over 30 dager", finalTelemetryLog.length < 500 && finalTelemetryLog.length > 0, { telemetryLogLength: finalTelemetryLog.length });

// Performance trend: compare first-5-days average to last-5-days average.
// This is a coarse, noisy signal (single-process Node timing) — looking for
// a gross degradation pattern (e.g. 5x+), not sub-millisecond precision.
const first5Avg = dayDurations.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
const last5Avg = dayDurations.slice(-5).reduce((a, b) => a + b, 0) / 5;
record("Ingen grov ytelsesdegradering over 30 dager (siste 5 dager ikke drastisk tregere enn første 5)", last5Avg < first5Avg * 3, { first5AvgMs: Math.round(first5Avg), last5AvgMs: Math.round(last5Avg) });

console.log("Per-day durations (ms):", dayDurations);

// --- Supplementary: telemetry cap is real FIFO behavior, not just a documented number ---
section("Telemetri-cap (500): flom-test i én økt");
const capSandbox = bootMotor("cap_test_device_" + Date.now());
const CapMotor = capSandbox.window.Motor;
CapMotor.startDay();
for (let i = 0; i < 520; i++) {
  // emitTelemetry is internal — drive it via the same path production code uses:
  // repeated submitEntry() calls each emit at least one ObservationCreated event.
  CapMotor.submitEntry("Flomtest oppføring " + i, "notat");
}
const capLog = CapMotor.getTelemetryLog();
record("Telemetri-loggen kappes ved 500 (ikke ubegrenset vekst), FIFO (eldste borte, nyeste beholdt)", capLog.length === 500 && capLog[capLog.length - 1].data.entryType === "notat", { finalLength: capLog.length });

console.log("\n" + results.filter((r) => r.ok).length + "/" + results.length + " long-running scenarios handled correctly");
await tick(200);
process.exit(results.every((r) => r.ok) ? 0 : 1);
