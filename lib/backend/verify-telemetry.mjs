/**
 * Del 5 verification: motor.js already produces telemetry (Phase 6.5)
 * — this proves the backend can actually RECEIVE it and that Operations
 * Center reflects it as live, not simulated, data. motor.js has no
 * "flush to backend" function yet (that would be new motor
 * functionality, out of scope this phase) — this test reads
 * Motor.getTelemetryLog() (already-exposed, read-only) and POSTs it,
 * standing in for that future auto-flush.
 *
 * Run with the dev server already running: node lib/backend/verify-telemetry.mjs
 */
import fs from "node:fs";
import vm from "node:vm";

const BASE_URL = process.argv[2] || "http://localhost:3311";
const MOTOR_SRC = fs.readFileSync("./public/motor.js", "utf8");
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function section(t) { console.log("\n=== " + t + " ==="); }

function bootMotor() {
  const kv = {};
  const localStorage = { getItem: (k) => (k in kv ? kv[k] : null), setItem: (k, v) => { kv[k] = String(v); }, removeItem: (k) => { delete kv[k]; } };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const sandbox = {
    window: { PUNCHOUT_CONFIG: { lonnskoder: [], kjoretoy: [], sjaDefaults: {}, externalLinks: [], hovedordre: "HOVED" }, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); }, localStorage },
    localStorage, document: { addEventListener: () => {}, getElementById: () => null }, navigator: {}, CustomEvent, console, crypto: globalThis.crypto,
    fetch: async () => ({ ok: true, status: 200, statusText: "OK" }), TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTOR_SRC, sandbox, { filename: "motor.js" });
  return sandbox.window.Motor;
}

section("Produce real telemetry by running a day (motor.js, unmodified)");
const Motor = bootMotor();
Motor.startDay();
Motor.submitEntry("Det skjedde en nestenulykke", "hendelse");
await tick(30);
const localLog = Motor.getTelemetryLog();
console.log("Local telemetry events produced:", localLog.map((e) => e.type));

section("Flush to the real telemetry endpoint (stand-in for a future motor.js auto-flush)");
const orgId = "phase11_pilot_" + Date.now(); // unique per run — the backend is a long-running process, state persists across separate test invocations
const stamped = localLog.map((e) => ({ ...e, organizationId: orgId }));
const postRes = await fetch(BASE_URL + "/api/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stamped) });
console.log("POST /api/telemetry ->", postRes.status, await postRes.json());

section("Verify via GET — same data, round-tripped");
const getRes = await fetch(BASE_URL + "/api/telemetry?org=" + orgId);
const stored = await getRes.json();
console.log("Backend telemetry for org:", stored.count, "events:", stored.events.map((e) => e.type));

section("Verify Operations Center reflects this as live data");
const ocRes = await fetch(BASE_URL + "/api/operations-center?org=" + orgId);
const oc = await ocRes.json();
console.log("dataSource:", oc.dataSource, "| telemetryEventCount:", oc.telemetryEventCount);

section("Result");
const passed = localLog.length > 0 && stored.count === localLog.length && oc.dataSource === "live" && oc.telemetryEventCount === localLog.length;
console.log(passed ? "DEL 5 PASSED — real telemetry received and reflected in Operations Center." : "DEL 5 FAILED");
// motor.js's initExportSync() setInterval keeps the process alive
// otherwise; the short delay avoids a libuv handle-teardown race on
// Windows when exiting right after an async fetch chain (cosmetic).
await tick(200);
process.exit(passed ? 0 : 1);
