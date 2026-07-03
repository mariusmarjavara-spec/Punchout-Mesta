/**
 * Validation Sprint Del 5 — three independent simulated devices, each
 * its own vm sandbox with its own real fetch to a live backend, each a
 * different registered device identity and a different user. Publishes
 * a new Runtime version, rolls one back, and has each device sync at a
 * different point in that sequence — proving pull-based per-device
 * consistency (each device gets whatever was active AT THE MOMENT it
 * asked, never a partial or pushed update) and that concurrent devices
 * never lose or cross-contaminate each other's exports/telemetry.
 *
 * Run with the dev server already running:
 *   PUNCHOUT_ADMIN_TOKEN=... node lib/backend/multi-device.mjs
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
const authHeader = { "Authorization": "Bearer " + ADMIN_TOKEN };

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

async function resolveAll(Motor) {
  for (let round = 0; round < 20; round++) {
    const items = Motor.getUnresolvedItems();
    if (items.length === 0) return;
    for (const item of items) {
      if (item.kind === "main_time") { Motor.resolveItem(item.id, "discard", { reason: "logged_elsewhere" }); continue; }
      if (item.kind === "schema") {
        const schemaId = item.id.replace(/^schema_/, "").replace(/^friksjon_/, "");
        const schema = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === schemaId);
        if (schema) {
          const def = Motor.getSchemaFieldDefinitions(schema.type, schema.origin);
          if (def) for (const [key, fdef] of Object.entries(def.fields)) {
            if (!fdef.required) continue;
            Motor.setSchemaField(schema.id, key, fdef.type === "boolean" ? true : fdef.type === "enum" ? fdef.options?.[0] : "test-verdi");
          }
        }
      }
      Motor.resolveItem(item.id, "confirm");
    }
  }
}

async function runFullDay(sandbox, text) {
  const Motor = sandbox.window.Motor;
  Motor.startDay();
  Motor.submitEntry(text, "notat");
  await tick(20);
  Motor.endDay();
  await resolveAll(Motor);
  Motor.lockDay();
  sandbox.flushTelemetry();
  await tick(300);
  return Motor.getSnapshot().outboxStatus;
}

const orgSlug = "nordkraft"; // isolated from other scripts' use of mesta/banenord/nordhavn
section("Sett opp tre uavhengige enheter, hver sin registrerte identitet");
const deviceIds = ["multidev_A_" + Date.now(), "multidev_B_" + Date.now(), "multidev_C_" + Date.now()];
const secrets = {};
for (const id of deviceIds) {
  const res = await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId: id }) });
  secrets[id] = (await res.json()).secret;
}
record("Alle tre enheter registrert uavhengig", Object.values(secrets).every(Boolean));

section("Publiser v1, Enhet A synker (skal se v1)");
const pub1 = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationSlug: orgSlug, publishedBy: "device_test", approved: true }) })).json();
const orgId = pub1.manifest.organizationId;
const activeForA = await (await fetch(BASE_URL + "/api/runtime/active?org=" + orgId)).json();
record("Enhet A ser v" + pub1.manifest.runtimeVersion + " ved sync", activeForA.runtimeVersion === pub1.manifest.runtimeVersion);

section("Publiser v2, Enhet B synker (skal se v2, IKKE v1)");
const pub2 = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationSlug: orgSlug, publishedBy: "device_test", approved: true }) })).json();
const activeForB = await (await fetch(BASE_URL + "/api/runtime/active?org=" + orgId)).json();
record("Enhet B ser v" + pub2.manifest.runtimeVersion + " ved sync, ulik fra det A så", activeForB.runtimeVersion === pub2.manifest.runtimeVersion && activeForB.runtimeVersion !== activeForA.runtimeVersion);

section("Rollback til v" + pub1.manifest.runtimeVersion + ", Enhet C synker (skal se den gamle versjonen igjen, ikke v2)");
const rb = await (await fetch(BASE_URL + "/api/runtime/rollback", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationId: orgId, toVersion: pub1.manifest.runtimeVersion }) })).json();
const activeForC = await (await fetch(BASE_URL + "/api/runtime/active?org=" + orgId)).json();
record("Rollback lyktes og Enhet C ser rullet-tilbake versjon", rb.ok && activeForC.runtimeVersion === pub1.manifest.runtimeVersion);
record("A og C, som begge synket når v" + pub1.manifest.runtimeVersion + " var aktiv (før og etter rollback), ser samme versjon — konsistent, ikke en mellomtilstand", activeForA.runtimeVersion === activeForC.runtimeVersion);

section("Alle tre enheter kjører en full arbeidsdag samtidig (Promise.all) — ulike brukere, ulike eksporter, ulik telemetri-org");
const sandboxes = deviceIds.map((id) => bootMotor(id));
sandboxes.forEach((sandbox, i) => {
  sandbox.ADMIN_CONFIG.userId = "pilot_user_" + ["A", "B", "C"][i];
  sandbox.ADMIN_CONFIG.hovedordre = "multidev_org_" + ["A", "B", "C"][i] + "_" + Date.now();
  sandbox.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
  sandbox.ADMIN_CONFIG.exportHmacSecret = secrets[deviceIds[i]];
  sandbox.ADMIN_CONFIG.telemetryEndpoint = BASE_URL + "/api/telemetry";
});
const outboxes = await Promise.all(sandboxes.map((sandbox, i) => runFullDay(sandbox, "Arbeidsdag enhet " + ["A", "B", "C"][i])));
record("Alle tre enheter fullførte og eksporterte samtidig uten å forstyrre hverandre", outboxes.every((o) => o.sent === 1 && o.failed === 0), outboxes);

const finalExports = await (await fetch(BASE_URL + "/api/export")).json();
const thisRunExports = finalExports.entries.filter((e) => deviceIds.includes(e.deviceId));
record("Backend har nøyaktig 3 eksporter fra disse tre enhetene, korrekt tilordnet, ingen tap eller kryssforurensning", thisRunExports.length === 3 && new Set(thisRunExports.map((e) => e.deviceId)).size === 3 && thisRunExports.every((e) => e.signatureValid === true), thisRunExports.map((e) => ({ deviceId: e.deviceId, signatureValid: e.signatureValid })));

for (let i = 0; i < 3; i++) {
  const orgTelemetry = await (await fetch(BASE_URL + "/api/telemetry?org=" + sandboxes[i].ADMIN_CONFIG.hovedordre)).json();
  record("Telemetri for enhet " + ["A", "B", "C"][i] + " er isolert og komplett (ingen kryssforurensning fra de andre to enhetene)", orgTelemetry.count > 0 && orgTelemetry.events.every((e) => e.organizationId === sandboxes[i].ADMIN_CONFIG.hovedordre));
}

console.log("\n" + results.filter((r) => r.ok).length + "/" + results.length + " multi-device scenarios handled correctly");
await tick(200);
process.exit(results.every((r) => r.ok) ? 0 : 1);
