/**
 * Execution Sprint 1 Oppgave 1 verification. Full device lifecycle
 * against a live server: register -> active export succeeds -> revoke
 * -> export rejected (even with a still-valid signature — a real
 * bypass attempt, not just an unregistered-device check) -> reactivate
 * -> export succeeds again. Also verifies the audit log and the
 * unauthenticated-revoke bypass attempt.
 *
 * Run with the dev server already running:
 *   PUNCHOUT_ADMIN_TOKEN=... node lib/backend/device-lifecycle.mjs
 */
import fs from "node:fs";
import vm from "node:vm";

const BASE_URL = process.argv[2] || "http://localhost:3311";
const ADMIN_TOKEN = process.env.PUNCHOUT_ADMIN_TOKEN;
if (!ADMIN_TOKEN) { console.error("PUNCHOUT_ADMIN_TOKEN required"); process.exit(1); }
const authHeader = { "Authorization": "Bearer " + ADMIN_TOKEN };

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

async function runOneDayExport(sandbox) {
  const Motor = sandbox.window.Motor;
  Motor.startDay();
  Motor.submitEntry("Test", "notat");
  await tick(20);
  Motor.endDay();
  for (let i = 0; i < 10; i++) {
    const items = Motor.getUnresolvedItems();
    if (items.length === 0) break;
    for (const it of items) Motor.resolveItem(it.id, it.kind === "main_time" ? "discard" : "confirm", it.kind === "main_time" ? { reason: "logged_elsewhere" } : undefined);
  }
  Motor.lockDay();
  await tick(400);
  return Motor.getSnapshot().outboxStatus;
}

const deviceId = "lifecycle_test_" + Date.now();

section("1. Registrer enhet — skal kunne eksportere");
const regRes = await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId, organizationId: "mesta" }) });
const { secret } = await regRes.json();
const sandbox = bootMotor(deviceId);
sandbox.ADMIN_CONFIG.userId = "u1";
sandbox.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
sandbox.ADMIN_CONFIG.exportHmacSecret = secret;
const status1 = await runOneDayExport(sandbox);
record("Aktiv, registrert enhet eksporterer OK", status1.sent === 1 && status1.failed === 0, status1);

section("2. Ukjent enhet — skal avvises (uendret fra tidligere fase, bekreftet på nytt)");
const unknownRes = await fetch(BASE_URL + "/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exportId: "unknown_" + Date.now(), deviceId: "never_registered_" + Date.now() }) });
record("Ukjent enhet -> 401", unknownRes.status === 401, { status: unknownRes.status });

section("3. Deaktiver enhet (revoke) uten auth — forsøk å omgå sperren");
const bypassRevoke = await fetch(BASE_URL + "/api/devices/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId }) });
record("Revoke uten admin-token avvises (enheten er FORTSATT aktiv etter dette forsøket)", bypassRevoke.status === 401, { status: bypassRevoke.status });

section("4. Deaktiver enhet (revoke) med gyldig auth");
const revokeRes = await fetch(BASE_URL + "/api/devices/revoke", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId, revokedBy: "sprint1_test" }) });
const revokeBody = await revokeRes.json();
record("Revoke med gyldig admin-token lykkes", revokeRes.status === 200 && revokeBody.ok === true, revokeBody);

section("5. Forsøk å eksportere fra deaktivert enhet MED en fortsatt gyldig signatur — dette ER bypass-forsøket");
const sandbox2 = bootMotor(deviceId); // fresh sandbox, same device id + same still-valid secret
sandbox2.ADMIN_CONFIG.userId = "u1";
sandbox2.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
sandbox2.ADMIN_CONFIG.exportHmacSecret = secret; // the secret is still cryptographically valid — status must be what blocks this, not the signature
const status2 = await runOneDayExport(sandbox2);
record("Deaktivert enhet med GYLDIG signatur avvises likevel — status overstyrer en korrekt signatur", status2.failed === 1 && status2.sent === 0, status2);

// Confirm the actual HTTP-level rejection reason directly (not just outbox status)
const directRes = await fetch(BASE_URL + "/api/export", { method: "POST", headers: { "Content-Type": "application/json", "X-Punchout-Device": deviceId }, body: JSON.stringify({ exportId: "direct_disabled_check_" + Date.now(), deviceId }) });
const directBody = await directRes.json();
record("Direkte HTTP-kall bekrefter 403 med tydelig feilmelding, ikke en generisk 401", directRes.status === 403 && directBody.error.toLowerCase().includes("disabled"), { status: directRes.status, error: directBody.error });

section("6. Reaktiver enhet");
const reactivateRes = await fetch(BASE_URL + "/api/devices/reactivate", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId, reactivatedBy: "sprint1_test" }) });
record("Reaktivering lykkes", reactivateRes.status === 200);

const sandbox3 = bootMotor(deviceId);
sandbox3.ADMIN_CONFIG.userId = "u1";
sandbox3.ADMIN_CONFIG.exportEndpoint = BASE_URL + "/api/export";
sandbox3.ADMIN_CONFIG.exportHmacSecret = secret;
const status3 = await runOneDayExport(sandbox3);
record("Reaktivert enhet eksporterer OK igjen, med samme hemmelighet som hele tiden", status3.sent === 1 && status3.failed === 0, status3);

section("7. Revoke av ukjent enhet -> tydelig feil, ikke krasj");
const revokeUnknown = await fetch(BASE_URL + "/api/devices/revoke", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId: "never_existed_" + Date.now() }) });
record("Revoke av ukjent enhet -> 404 med klar feilmelding", revokeUnknown.status === 404);

section("8. Audit-logg reflekterer hele livsløpet i riktig rekkefølge");
const auditRes = await fetch(BASE_URL + "/api/devices/audit", { headers: authHeader });
const audit = await auditRes.json();
const thisDeviceEvents = audit.entries.filter((e) => e.deviceId === deviceId).map((e) => e.action);
record("Audit-logg viser registered -> revoked -> reactivated i rekkefølge", JSON.stringify(thisDeviceEvents) === JSON.stringify(["registered", "revoked", "reactivated"]), thisDeviceEvents);

section("9. Audit-logg uten auth avvises");
const auditNoAuth = await fetch(BASE_URL + "/api/devices/audit");
record("Audit-logg uten admin-token -> 401", auditNoAuth.status === 401);

console.log("\n" + results.filter((r) => r.ok).length + "/" + results.length + " device lifecycle scenarios handled correctly");
await tick(200);
process.exit(results.every((r) => r.ok) ? 0 : 1);
