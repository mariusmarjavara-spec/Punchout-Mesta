/**
 * Del 4 verification: motor.js's OWN real export pathway
 * (syncExports/buildExportPacket/computeHmacSignature, the code that
 * actually ships — never exercised by any test before this phase, per
 * Phase 10's own audit finding) against a real running HTTP endpoint.
 * Deliberately does NOT reuse lib/regression/full-day-scenario.mjs's
 * bootMotor(), which mocks fetch — this one uses REAL fetch, pointed at
 * the live Next.js dev server.
 *
 * Run with the dev server already running: node lib/backend/verify-export.mjs
 */
import fs from "node:fs";
import vm from "node:vm";

const BASE_URL = process.argv[2] || "http://localhost:3311";
const MOTOR_SRC = fs.readFileSync("./public/motor.js", "utf8");
const DEVICE_ID = "dev_pilot_1";
const HMAC_SECRET = "phase11-pilot-hmac-secret"; // must match lib/backend/state.mjs's DEVICE_SECRETS

function section(t) { console.log("\n=== " + t + " ==="); }

function bootMotorWithRealFetch() {
  // Pre-seed the device id so it matches lib/backend/state.mjs's
  // DEVICE_SECRETS — motor.js's getOrCreateDeviceId() reads this key
  // first and only generates a random one if absent.
  const kv = { punchout_device_id: DEVICE_ID };
  const localStorage = {
    getItem: (k) => (k in kv ? kv[k] : null),
    setItem: (k, v) => { kv[k] = String(v); },
    removeItem: (k) => { delete kv[k]; },
  };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const windowStub = {
    PUNCHOUT_CONFIG: { lonnskoder: [{ kode: "100", navn: "Ordinær" }], kjoretoy: [], sjaDefaults: {}, externalLinks: [], hovedordre: "HOVED" },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent: (evt) => { (listeners[evt.type] || []).forEach((fn) => fn(evt)); },
    localStorage,
  };
  const sandbox = {
    window: windowStub, localStorage,
    document: { addEventListener: () => {}, getElementById: () => null },
    navigator: {}, CustomEvent, console, crypto: globalThis.crypto,
    fetch, // REAL fetch — the entire point of this test
    TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTOR_SRC, sandbox, { filename: "motor.js" });
  return sandbox; // top-level `var`s (ADMIN_CONFIG included) attach directly to this object
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

section("Boot motor.js with REAL fetch, configure export identity (test-harness-only, no motor.js changes)");
const sandbox = bootMotorWithRealFetch();
// Setting these directly on the vm context object is equivalent to what
// a future config/Runtime field would do — done here without touching
// motor.js because no such field is wired yet (Phase 10's own finding).
sandbox.ADMIN_CONFIG.userId = "pilot_user_1";
sandbox.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
sandbox.ADMIN_CONFIG.exportHmacSecret = HMAC_SECRET;
const Motor = sandbox.window.Motor;
console.log("exportEndpoint:", sandbox.ADMIN_CONFIG.exportEndpoint, "| userId:", sandbox.ADMIN_CONFIG.userId, "| HMAC configured:", !!sandbox.ADMIN_CONFIG.exportHmacSecret);

section("Run a full day, lock it (this calls the REAL enqueueExport() internally)");
Motor.startDay();
Motor.continueFromPreDay();
Motor.submitEntry("Jobbet på 204481-0014 med hjullaster.", "notat");
await tick(30);
Motor.endDay();
// Resolve unresolved items generically (same technique as the regression scenario)
for (let round = 0; round < 10; round++) {
  const items = Motor.getUnresolvedItems();
  if (items.length === 0) break;
  for (const item of items) {
    if (item.kind === "main_time") Motor.resolveItem(item.id, "discard", { reason: "logged_elsewhere" });
    else Motor.resolveItem(item.id, "confirm");
  }
}
Motor.lockDay();
console.log("appState after lock:", Motor.getSnapshot().appState);

section("Call the REAL syncExports() — this is motor.js's actual shipping code, POSTing to a real server");
Motor.syncExports();
await tick(500); // syncExports() is async internally (fetch + HMAC computation)

const outboxStatus = Motor.getSnapshot().outboxStatus;
console.log("outboxStatus after sync:", outboxStatus);

section("Verify the backend actually received and logged it");
const res = await fetch(BASE_URL + "/api/export");
const log = await res.json();
console.log("Backend export log count:", log.count);
console.log("Last entry:", log.entries[log.entries.length - 1]);

const received = log.entries.find((e) => e.deviceId === undefined || true); // device id comes from packet.deviceId (motor-generated), not our test constant
const lastEntry = log.entries[log.entries.length - 1];

section("Result");
const passed = outboxStatus.sent === 1 && outboxStatus.failed === 0 && lastEntry && lastEntry.signatureValid === true;
console.log(passed ? "DEL 4 PASSED — motor.js's real syncExports() successfully exported to a real HTTP endpoint, HMAC-verified." : "DEL 4 FAILED");
if (!passed) console.log({ outboxStatus, lastEntry });
// motor.js's initExportSync() leaves a setInterval running (same
// keep-alive artifact as every vm-sandboxed motor.js test in this
// codebase) — exit explicitly, but after a short delay so the fetch/
// HMAC async chain fully settles first (an immediate process.exit()
// here raced a libuv handle teardown on Windows — cosmetic, not a test
// failure, but worth avoiding for a clean CI signal).
await tick(200);
process.exit(passed ? 0 : 1);
