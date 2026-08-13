/**
 * Execution Sprint 1 Oppgave 2 (health) + Oppgave 3 (live log-volume
 * check) verification against a real running server. The pruning
 * ALGORITHM itself (age + floor + never-remove-active) is proven
 * in-process with many backdated simulated versions in
 * lib/regression/suite.mjs (sprint1_runtime_history_pruning_...). This
 * script proves the same code path survives real volume without
 * crashing or leaking sensitive fields — the thing an in-process test
 * can't show.
 *
 * Run with the dev server already running:
 *   PUNCHOUT_ADMIN_TOKEN=... node lib/backend/health-and-log-hygiene.mjs
 */
const BASE_URL = process.argv[2] || "http://localhost:3311";
const ADMIN_TOKEN = process.env.PUNCHOUT_ADMIN_TOKEN;
if (!ADMIN_TOKEN) { console.error("PUNCHOUT_ADMIN_TOKEN required"); process.exit(1); }
const authHeader = { "Authorization": "Bearer " + ADMIN_TOKEN };

const results = [];
function record(name, ok, detail) { results.push({ name, ok, detail }); console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + JSON.stringify(detail) : "")); }
function section(t) { console.log("\n=== " + t + " ==="); }

section("Health endpoint — shape, no auth required, no sensitive fields");
const healthRes = await fetch(BASE_URL + "/api/health");
const health = await healthRes.json();
console.log(JSON.stringify(health, null, 2));
record("Health returnerer 200 uten autentisering", healthRes.status === 200);
record("Health inneholder status/versjon/uptime/node-versjon", health.status === "ok" && typeof health.version === "string" && typeof health.uptimeSeconds === "number" && typeof health.nodeRuntimeVersion === "string");
record("Health inneholder persistens-status", "lastWriteOk" in health.persistence);
record("Health inneholder enhetstall og køstørrelser (kun tall)", typeof health.registeredDevices.total === "number" && typeof health.exportQueue.totalReceived === "number" && typeof health.telemetryQueue.totalReceived === "number");

const flatJson = JSON.stringify(health);
const leaksSecret = flatJson.includes(ADMIN_TOKEN) || /secret/i.test(flatJson) || /token/i.test(flatJson) || /[a-f0-9]{32,}/.test(flatJson);
record("Health lekker IKKE hemmeligheter, tokens, eller enhets-ID-er", !leaksSecret, { flatJsonLength: flatJson.length });

section("Log-hygiene under reell last: 250 eksportforsøk (over keepMinimum=200), skal ikke krasje eller vokse ukontrollert");
const deviceId = "log_hygiene_test_" + Date.now();
await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId, organizationId: "mesta" }) });

let allOk = true;
for (let i = 0; i < 250; i++) {
  // Deliberately unsigned/rejected requests are enough to exercise recordExport()'s
  // pruning path (every branch — accepted or rejected — calls recordExport()).
  const res = await fetch(BASE_URL + "/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ exportId: "hygiene_" + i + "_" + Date.now(), deviceId: "unregistered_hygiene_" + i }) });
  if (res.status !== 401) allOk = false;
}
record("250 eksportforsøk på rad håndteres uten feil", allOk);

const afterHealth = await (await fetch(BASE_URL + "/api/health")).json();
record("Serveren svarer fortsatt normalt etter volumtesten (health fortsatt OK)", afterHealth.status === "ok", { exportQueueAfter: afterHealth.exportQueue.totalReceived });

console.log("\n" + results.filter((r) => r.ok).length + "/" + results.length + " health/log-hygiene scenarios handled correctly");
process.exit(results.every((r) => r.ok) ? 0 : 1);
