/**
 * Del 4 verification: motor.js's OWN real export pathway
 * (syncExports/buildExportPacket/computeHmacSignature, the code that
 * actually ships) against a real running HTTP endpoint.
 * Deliberately does NOT reuse lib/regression/full-day-scenario.mjs's
 * bootMotor(), which mocks fetch — this one uses REAL fetch, pointed at
 * the live Next.js dev server.
 *
 * Phase A hardening: there is no hardcoded device secret anymore
 * (lib/backend/state.mjs's DEVICE_SECRETS constant is gone). This
 * script now registers a device for real via the admin-gated
 * POST /api/devices/register endpoint first, then configures motor.js
 * with the secret that endpoint actually returned — the same flow a
 * real pilot device provisioning would follow.
 *
 * Run with the dev server already running, PUNCHOUT_ADMIN_TOKEN set to
 * the same value on both:
 *   PUNCHOUT_ADMIN_TOKEN=test-admin-token node lib/backend/verify-export.mjs
 */
import fs from "node:fs";
import vm from "node:vm";

const BASE_URL = process.argv[2] || "http://localhost:3311";
const ADMIN_TOKEN = process.env.PUNCHOUT_ADMIN_TOKEN;
const DEVICE_ID = "verify_export_device_" + Date.now();

if (!ADMIN_TOKEN) {
  console.error("PUNCHOUT_ADMIN_TOKEN env var required (must match the value the dev server was started with)");
  process.exit(1);
}

function section(t) { console.log("\n=== " + t + " ==="); }
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function bootMotorWithRealFetch(deviceId) {
  const kv = { punchout_device_id: deviceId };
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
  vm.runInContext(fs.readFileSync("./public/motor.js", "utf8"), sandbox, { filename: "motor.js" });
  return sandbox;
}

section("Register a device for real, via the admin-gated endpoint (Phase A Del 1/6)");
const regRes = await fetch(BASE_URL + "/api/devices/register", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ADMIN_TOKEN },
  body: JSON.stringify({ deviceId: DEVICE_ID, registeredBy: "verify-export-script", organizationId: "mesta" }),
});
const regBody = await regRes.json();
console.log("Registration:", regRes.status, "deviceId:", DEVICE_ID, "secret received:", !!regBody.secret);
if (regRes.status !== 201 || !regBody.secret) {
  console.log("DEL 4 FAILED — could not register device");
  process.exit(1);
}
const HMAC_SECRET = regBody.secret;

section("Confirm an UNREGISTERED device is rejected before we even try the real one (fail-closed check)");
const rejectRes = await fetch(BASE_URL + "/api/export", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ exportId: "should_be_rejected_" + Date.now(), deviceId: "never_registered_device", userId: "x" }),
});
console.log("Unregistered device export ->", rejectRes.status, "(expect 401)");
const unregisteredRejected = rejectRes.status === 401;

section("Boot motor.js with REAL fetch, configure export identity with the REGISTERED device's secret");
const sandbox = bootMotorWithRealFetch(DEVICE_ID);
sandbox.ADMIN_CONFIG.userId = "pilot_user_1";
sandbox.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
sandbox.ADMIN_CONFIG.exportHmacSecret = HMAC_SECRET;
const Motor = sandbox.window.Motor;

section("Run a full day, lock it (this calls the REAL enqueueExport() internally)");
Motor.startDay();
Motor.continueFromPreDay();
Motor.submitEntry("Jobbet på 204481-0014 med hjullaster.", "notat");
await tick(30);
Motor.endDay();
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
await tick(500);

const outboxStatus = Motor.getSnapshot().outboxStatus;
console.log("outboxStatus after sync:", outboxStatus);

section("Verify the backend actually received and logged it");
const res = await fetch(BASE_URL + "/api/export", { headers: { "Authorization": "Bearer " + ADMIN_TOKEN } });
const log = await res.json();
const lastEntry = log.entries[log.entries.length - 1];
console.log("Backend export log count:", log.count, "| last entry:", lastEntry);

section("Result");
const passed = outboxStatus.sent === 1 && outboxStatus.failed === 0 && lastEntry && lastEntry.signatureValid === true && unregisteredRejected;
console.log(passed ? "DEL 4 PASSED — registered-device export succeeded and was HMAC-verified; unregistered device was rejected." : "DEL 4 FAILED");
if (!passed) console.log({ outboxStatus, lastEntry, unregisteredRejected });
await tick(200);
process.exit(passed ? 0 : 1);
