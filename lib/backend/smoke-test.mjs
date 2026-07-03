/**
 * Execution Sprint 1 Oppgave 6 — minimal production smoke test. NOT the
 * 30-day simulation, NOT the full failure-injection matrix — just
 * enough to prove a freshly deployed instance actually works, in
 * seconds, so it can run after every deploy without becoming a chore
 * anyone skips.
 *
 * Covers exactly what Oppgave 6 asks: Runtime Publish, Runtime Activate
 * (a publish activates immediately — Phase 11's design, confirmed
 * unchanged), Start arbeidsdag, Registrering, Eksport, Telemetri,
 * Rollback.
 *
 * Run after every deploy:
 *   PUNCHOUT_ADMIN_TOKEN=... node lib/backend/smoke-test.mjs https://your-deployed-url
 */
import fs from "node:fs";
import vm from "node:vm";

const BASE_URL = process.argv[2] || "http://localhost:3311";
const ADMIN_TOKEN = process.env.PUNCHOUT_ADMIN_TOKEN;
if (!ADMIN_TOKEN) { console.error("PUNCHOUT_ADMIN_TOKEN required"); process.exit(1); }
const authHeader = { "Authorization": "Bearer " + ADMIN_TOKEN };
const SMOKE_ORG = "mesta"; // most-tested package, lowest risk of an unrelated failure muddying the smoke signal

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function step(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + JSON.stringify(detail) : "")); }

console.log("Smoke test against " + BASE_URL + " (org: " + SMOKE_ORG + ")\n");

// 1. Runtime Publish (also proves compile+validate+dry-run, since publish gates on all three)
const pub1 = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationSlug: SMOKE_ORG, publishedBy: "smoke_test", approved: true }) })).json();
step("Runtime Publish", pub1.ok === true && pub1.stages?.deployed === true, { runtimeVersion: pub1.manifest?.runtimeVersion });

// 2. Runtime Activate — confirm the published version is immediately live via GET /active (device sync path)
const active = await (await fetch(BASE_URL + "/api/runtime/active?org=" + pub1.manifest.organizationId)).json();
step("Runtime Activate (synlig via /active umiddelbart)", active.runtimeVersion === pub1.manifest.runtimeVersion);

// 3-5. Start arbeidsdag, Registrering, Eksport — real motor.js in a vm sandbox, real fetch
const deviceId = "smoke_" + Date.now();
const regRes = await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId }) });
const { secret } = await regRes.json();

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
vm.runInContext(fs.readFileSync("./public/motor.js", "utf8"), sandbox, { filename: "motor.js" });
const Motor = sandbox.window.Motor;
sandbox.ADMIN_CONFIG.userId = "smoke_user";
sandbox.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
sandbox.ADMIN_CONFIG.exportHmacSecret = secret;
sandbox.ADMIN_CONFIG.telemetryEndpoint = BASE_URL + "/api/telemetry";

Motor.startDay();
step("Start arbeidsdag", Motor.getSnapshot().appState === "ACTIVE");

Motor.submitEntry("Smoke test registrering", "notat");
await tick(20);
step("Registrering", Motor.getSnapshot().dayLog.entries.length === 1);

Motor.endDay();
for (let i = 0; i < 10; i++) {
  const items = Motor.getUnresolvedItems();
  if (items.length === 0) break;
  for (const it of items) Motor.resolveItem(it.id, it.kind === "main_time" ? "discard" : "confirm", it.kind === "main_time" ? { reason: "logged_elsewhere" } : undefined);
}
Motor.lockDay();
await tick(500);
const outbox = Motor.getSnapshot().outboxStatus;
step("Eksport", outbox.sent === 1 && outbox.failed === 0, outbox);

// 6. Telemetri
sandbox.flushTelemetry();
await tick(400);
const telemetryCheck = await (await fetch(BASE_URL + "/api/telemetry?org=" + (sandbox.ADMIN_CONFIG.userId ? sandbox.ADMIN_CONFIG.hovedordre : ""))).json();
step("Telemetri", telemetryCheck.count > 0, { count: telemetryCheck.count });

// 7. Rollback
const pub2 = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationSlug: SMOKE_ORG, publishedBy: "smoke_test", approved: true }) })).json();
const rb = await (await fetch(BASE_URL + "/api/runtime/rollback", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationId: pub2.manifest.organizationId, toVersion: pub1.manifest.runtimeVersion }) })).json();
step("Rollback", rb.ok === true && rb.manifest.status === "active" && rb.manifest.runtimeVersion === pub1.manifest.runtimeVersion);

console.log("\n" + results.filter((r) => r.ok).length + "/" + results.length + " smoke test steps passed");
await tick(200);
process.exit(results.every((r) => r.ok) ? 0 : 1);
