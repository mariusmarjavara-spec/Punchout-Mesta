/**
 * Del 5 verification (Phase 11) / Del 3 verification (Phase A): proves
 * motor.js's REAL auto-flush (flushTelemetry/initTelemetrySync) sends
 * telemetry to the backend on its own — no test script manually calling
 * getTelemetryLog() and POSTing it standing in for a "future" mechanism
 * anymore. That mechanism now exists in motor.js itself.
 *
 * Also proves idempotency: POSTing the same batch twice must not
 * double-count (recordTelemetry dedupes by event id).
 *
 * Run with the dev server already running:
 *   PUNCHOUT_ADMIN_TOKEN=... node lib/backend/verify-telemetry.mjs
 *
 * Dogfooding Punchout audit finding #1: GET /api/telemetry is now
 * admin-gated (it previously had no auth check at all) — this script's
 * own GET verification calls need a token now, same as every other
 * lib/backend/*.mjs script that reads an admin-gated route.
 */
import fs from "node:fs";
import vm from "node:vm";

const BASE_URL = process.argv[2] || "http://localhost:3311";
const ADMIN_TOKEN = process.env.PUNCHOUT_ADMIN_TOKEN;
if (!ADMIN_TOKEN) { console.error("PUNCHOUT_ADMIN_TOKEN required"); process.exit(1); }
const authHeader = { "Authorization": "Bearer " + ADMIN_TOKEN };
const MOTOR_SRC = fs.readFileSync("./public/motor.js", "utf8");
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function section(t) { console.log("\n=== " + t + " ==="); }

function bootMotorWithRealFetch() {
  const kv = {};
  const localStorage = { getItem: (k) => (k in kv ? kv[k] : null), setItem: (k, v) => { kv[k] = String(v); }, removeItem: (k) => { delete kv[k]; } };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const sandbox = {
    window: { PUNCHOUT_CONFIG: { lonnskoder: [], kjoretoy: [], sjaDefaults: {}, externalLinks: [], hovedordre: "HOVED" }, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); }, localStorage },
    localStorage, document: { addEventListener: () => {}, getElementById: () => null }, navigator: {}, CustomEvent, console, crypto: globalThis.crypto,
    fetch, // REAL fetch — the entire point of this test
    TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTOR_SRC, sandbox, { filename: "motor.js" });
  return sandbox;
}

section("Boot motor.js (auto-flush starts disabled — telemetryEndpoint is null at this point, same as production default)");
const sandbox = bootMotorWithRealFetch();
const Motor = sandbox.window.Motor;
const orgId = "phase_a_telemetry_" + Date.now();
sandbox.ADMIN_CONFIG.userId = "u1";
sandbox.ADMIN_CONFIG.hovedordre = orgId; // emitTelemetry() stamps organizationId from this

section("Produce real telemetry by running a day (motor.js, unmodified logic)");
Motor.startDay();
Motor.submitEntry("Det skjedde en nestenulykke", "hendelse");
await tick(30);
const producedCount = Motor.getTelemetryLog().length;
console.log("Local telemetry events produced:", Motor.getTelemetryLog().map((e) => e.type), "| all unflushed:", Motor.getTelemetryLog().every((e) => e.flushed === false));

section("Enable telemetryEndpoint and call the REAL flushTelemetry() — this is motor.js's actual auto-flush code, not a test-script substitute");
sandbox.ADMIN_CONFIG.telemetryEndpoint = BASE_URL + "/api/telemetry";
sandbox.flushTelemetry();
await tick(300);

const afterFlush = Motor.getTelemetryLog();
const allFlushed = afterFlush.every((e) => e.flushed === true);
console.log("All local events marked flushed:", allFlushed);

section("Verify via GET — same data, round-tripped, arrived without any manual POST from this script");
const getRes = await fetch(BASE_URL + "/api/telemetry?org=" + orgId, { headers: authHeader });
const stored = await getRes.json();
console.log("Backend telemetry for org:", stored.count, "events:", stored.events.map((e) => e.type));

section("Idempotency: call flushTelemetry() again immediately — nothing new to send (all already flushed), and re-POSTing the same ids manually must not double-count");
sandbox.flushTelemetry();
await tick(200);
const dupRes = await fetch(BASE_URL + "/api/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(afterFlush) });
const dupBody = await dupRes.json();
console.log("Manual re-POST of the same batch -> storedNew:", dupBody.storedNew, "(expect 0)");
const getRes2 = await fetch(BASE_URL + "/api/telemetry?org=" + orgId, { headers: authHeader });
const stored2 = await getRes2.json();
console.log("Backend count after duplicate re-POST:", stored2.count, "(expect unchanged:", stored.count, ")");

section("Verify Operations Center reflects this as live, honest data");
// Pre-existing bug, found by actually running this script (not just
// typechecking it): /api/operations-center has been admin-gated since
// Execution Sprint 4, but this specific verification call was never
// updated to send a token — it crashed on oc.dataAvailability being
// undefined (a 401 body has no such field), unrelated to today's slice.
const ocRes = await fetch(BASE_URL + "/api/operations-center?org=" + orgId, { headers: authHeader });
const oc = await ocRes.json();
console.log("dataSource:", oc.dataSource, "| telemetryEventCount:", oc.telemetryEventCount, "| dataAvailability.exportHealth:", oc.dataAvailability.exportHealth);

section("Result");
const passed = producedCount > 0 && allFlushed && stored.count === producedCount && dupBody.storedNew === 0 && stored2.count === stored.count && oc.dataSource === "live" && oc.telemetryEventCount === producedCount;
console.log(passed ? "DEL 3 PASSED — motor.js auto-flushes telemetry with no manual script involvement, and duplicate re-delivery is idempotent." : "DEL 3 FAILED");
if (!passed) console.log({ producedCount, allFlushed, storedCount: stored.count, dupStoredNew: dupBody.storedNew, stored2Count: stored2.count, ocDataSource: oc.dataSource, ocCount: oc.telemetryEventCount });
await tick(200);
process.exit(passed ? 0 : 1);
