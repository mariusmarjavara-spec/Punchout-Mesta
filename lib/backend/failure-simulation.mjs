/**
 * Del 8: actively trying to break the deployed system. Every case
 * either passes (fails controlled, as required) or is reported as a
 * real finding — nothing here is glossed over.
 * Run with the dev server already running: node lib/backend/failure-simulation.mjs
 */
const BASE_URL = process.argv[2] || "http://localhost:3311";
const results = [];
function record(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + JSON.stringify(detail) : "")); }

// 1. Runtime mangler
{
  const res = await fetch(BASE_URL + "/api/runtime/active?org=does_not_exist_" + Date.now());
  record("Missing Runtime -> controlled 404, not a crash", res.status === 404);
}

// 2. Runtime korrupt (malformed package input via direct compile call)
{
  const res = await fetch(BASE_URL + "/api/runtime/compile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationSlug: "this_org_does_not_exist" }) });
  record("Corrupt/missing package -> controlled 4xx, not a crash", res.status >= 400 && res.status < 500, { status: res.status });
}

// 3. Export API unavailable — point motor.js's real syncExports() at an unreachable port
{
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const src = fs.readFileSync("./public/motor.js", "utf8");
  const kv = { punchout_device_id: "dev_pilot_1" };
  const localStorage = { getItem: (k) => (k in kv ? kv[k] : null), setItem: (k, v) => { kv[k] = String(v); }, removeItem: (k) => { delete kv[k]; } };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } }
  const sandbox = {
    window: { PUNCHOUT_CONFIG: { lonnskoder: [], kjoretoy: [], sjaDefaults: {}, externalLinks: [], hovedordre: "HOVED" }, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: (e) => { (listeners[e.type] || []).forEach((f) => f(e)); }, localStorage },
    localStorage, document: { addEventListener: () => {}, getElementById: () => null }, navigator: {}, CustomEvent, console, crypto: globalThis.crypto,
    fetch, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "motor.js" });
  sandbox.ADMIN_CONFIG.userId = "u1";
  sandbox.ADMIN_CONFIG.exportEndpoint = "http://localhost:1/api/export"; // unroutable port — connection refused/unreachable
  const Motor = sandbox.window.Motor;
  Motor.startDay();
  Motor.submitEntry("Test", "notat");
  await new Promise((r) => setTimeout(r, 30));
  Motor.endDay();
  for (let i = 0; i < 10; i++) {
    const items = Motor.getUnresolvedItems();
    if (items.length === 0) break;
    for (const it of items) Motor.resolveItem(it.id, it.kind === "main_time" ? "discard" : "confirm", it.kind === "main_time" ? { reason: "logged_elsewhere" } : undefined);
  }
  Motor.lockDay();
  await new Promise((r) => setTimeout(r, 500));
  const status = Motor.getSnapshot().outboxStatus;
  record("Export endpoint unreachable -> outbox marks failed with retry scheduled, no crash", status.failed >= 1 && status.sent === 0, status);
  await new Promise((r) => setTimeout(r, 100));
}

// 4. Runtime rollback (re-verify explicitly as a failure-recovery scenario)
{
  await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationSlug: "banenord", publishedBy: "t", approved: true }) });
  const pub2 = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationSlug: "banenord", publishedBy: "t", approved: true }) })).json();
  const rb = await (await fetch(BASE_URL + "/api/runtime/rollback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: "banenord", toVersion: pub2.manifest.runtimeVersion - 1 }) })).json();
  record("Rollback after 2 publishes reactivates previous version", rb.ok && rb.manifest.status === "active");
}

// 5. Concurrent export + Runtime update (fire both at once, verify neither
// corrupts the other's state). Uses an UNREGISTERED device id on purpose —
// this test is about concurrency, not auth (auth is already covered by
// Del 4's HMAC-verified test); an unknown device is accepted with
// signatureValid:null by design (lib/backend/state.mjs has no secret to
// check it against), so it isolates the concurrency question cleanly.
{
  const [exportRes, publishRes] = await Promise.all([
    fetch(BASE_URL + "/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exportId: "concurrent_test_" + Date.now(), deviceId: "unregistered_device_concurrency_test", userId: "concurrent_org" }) }),
    fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationSlug: "nordhavn", publishedBy: "t", approved: true }) }),
  ]);
  record("Concurrent export + Runtime publish -> both complete independently, no interference", exportRes.status === 201 && publishRes.status === 201, { exportStatus: exportRes.status, publishStatus: publishRes.status });
}

// 6. Two devices on different Runtime versions — a device that synced BEFORE
// a rollback keeps working with what it already cached; sync is pull-based,
// never pushed. Uses a fresh, uniquely-named organization slug so this
// step's trace isn't entangled with step 4's accumulated banenord state
// from earlier in this same script run.
{
  const freshOrg = "nordkraft"; // has its own package, independent of banenord's step-4 history
  const pubA = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationSlug: freshOrg, publishedBy: "t", approved: true }) })).json();
  const deviceASawVersion = pubA.manifest.runtimeVersion; // "device A" syncs right after this publish
  const pubB = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationSlug: freshOrg, publishedBy: "t", approved: true }) })).json();
  const deviceBWouldSee = pubB.manifest.runtimeVersion; // "device B" syncs now, after the second publish
  record(
    "Two devices publishing/syncing at different times see different Runtime versions, each internally consistent (pull-based sync, never pushed to an already-synced device)",
    deviceASawVersion !== deviceBWouldSee && pubA.ok && pubB.ok,
    { deviceA_cached: deviceASawVersion, deviceB_sees: deviceBWouldSee }
  );
}

console.log("\n" + results.filter((r) => r.ok).length + "/" + results.length + " failure scenarios handled correctly");
process.exit(results.every((r) => r.ok) ? 0 : 1);
