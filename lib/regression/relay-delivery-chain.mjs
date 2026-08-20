/**
 * RELAY DELIVERY CHAIN — live HTTP, real server, real restart.
 * ===========================================================
 *
 * Proves the whole outbound path the field trial depends on, end to end,
 * against a REAL running server over REAL HTTP — never in-process function
 * calls, because the defect this layer exists to fix (the server verifying a
 * locked workday and then discarding it) was invisible to every in-process
 * test that existed at the time:
 *
 *   locked workday
 *     -> signed export over HTTP           (real HMAC, real device registry)
 *     -> Relay custody                     (durable, immutable)
 *     -> inspection surface                (what the founder actually opens)
 *     -> CSV adapter                       (real files on disk)
 *     -> SERVER RESTART
 *     -> readback                          (same identity, same facts)
 *
 * The restart is the point. A relay that only holds the day in memory would
 * pass every other assertion here and still lose the workday the first time
 * the process is redeployed.
 *
 * The signed packet is built by hand rather than by driving a browser, because
 * this script's subject is the SERVER side of the chain. The browser side of
 * the same chain (a real Chromium completing a real workday) is
 * lib/regression/browser-verification.mjs's subject. Both are needed; neither
 * substitutes for the other.
 *
 * Slower than the pure-function suite (server boot + restart), same reason as
 * security-audit.mjs — deliberately NOT wired into lib/regression/run.mjs.
 * Run standalone: node lib/regression/relay-delivery-chain.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const PORT = 3997;
const ADMIN_TOKEN = "relay_chain_test_token";
const BASE_URL = `http://localhost:${PORT}`;
const authHeader = { Authorization: `Bearer ${ADMIN_TOKEN}` };
const ORG = "mesta";

async function waitForServer(timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function startServer(env) {
  return spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)], {
    env,
    cwd: process.cwd(),
    stdio: "pipe",
  });
}

async function stopServer(proc) {
  if (!proc || proc.killed) return;
  proc.kill();
  await new Promise((r) => setTimeout(r, 1500));
}

/** Exactly the HMAC scheme motor.js's computeHmacSignature()/syncExports() uses. */
function sign(secret, body) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * A locked workday, in motor.js's own buildExportPacket() shape. Deliberately
 * realistic: Norwegian text with æ/ø/å, a confirmed SJA, a real order line
 * with a wage code, machine hours, and an incident entry.
 */
function makeLockedWorkday(exportId, deviceId, userId) {
  return {
    exportVersion: "1.0",
    exportId,
    deviceId,
    userId,
    dayId: "2026-08-17",
    createdAt: new Date().toISOString(),
    payload: {
      startTime: "07:00",
      endTime: "15:00",
      entries: [
        { time: "07:05", type: "notat", text: "Sjekket kjøretøy før avreise" },
        { time: "09:40", type: "hendelse", text: "Nestenulykke ved påkjøring på Fv. 17" },
        { time: "13:20", type: "notat", text: "Grus bestilt til mandag" },
      ],
      schemas: [
        {
          id: "schema_sja_chain",
          type: "sja_preday",
          status: "confirmed",
          fields: {
            oppgave: "Brøyting og strøing Fv. 17",
            sted: "Steinkjer sør",
            konsekvens: "Påkjørsel bakfra ved lav sikt",
            tiltak: "Skiltet arbeidsvarsling, redusert hastighet",
            arbeidsvarsling: "enkel",
            arbeidsvarslingsplan: "24-184",
            godkjent: true,
          },
          /**
           * Guided Forms records where each value came from. This must survive
           * the whole path -- confirm, lock, sign, Relay, adapter -- because a
           * finished form loses the distinction otherwise, and it is exactly
           * what a reviewer needs: a risk the worker wrote and a risk the
           * worker agreed to are different facts.
           */
          fieldProvenance: {
            oppgave: { origin: "INFERRED_CONFIRMED", at: "2026-08-17T06:56:00.000Z" },
            sted: { origin: "INFERRED_CONFIRMED", at: "2026-08-17T06:56:10.000Z" },
            konsekvens: { origin: "WORKER", at: "2026-08-17T06:57:00.000Z" },
            tiltak: { origin: "SUGGESTION_ACCEPTED", at: "2026-08-17T06:57:30.000Z" },
            arbeidsvarslingsplan: { origin: "INFERRED_CONFIRMED", at: "2026-08-17T06:58:00.000Z" },
          },
          createdAt: "06:55",
          confirmedAt: new Date().toISOString(),
        },
      ],
      timeEntries: [
        {
          ordre: "204481-0014",
          dato: "2026-08-17",
          fra_tid: "07:30",
          til_tid: "11:00",
          arbeidsbeskrivelse: ["204481-0014 fra 07:30 til 11:00 brøyting; æøå-test"],
          lonnskoder: [{ kode: "100", fra: "07:30", til: "11:00" }],
          maskintimer: [{ maskintype: "hjullaster", timer: "3.5" }],
        },
      ],
      machineHours: [{ ordre: "204481-0014", maskintype: "hjullaster", timer: "3.5" }],
    },
  };
}

export async function runRelayDeliveryChainCheck() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: !!ok, error: ok ? null : JSON.stringify(detail ?? null) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-relay-chain-"));
  const env = { ...process.env, PUNCHOUT_DATA_DIR: dataDir, PUNCHOUT_ADMIN_TOKEN: ADMIN_TOKEN, PORT: String(PORT) };
  let server = startServer(env);

  try {
    const up = await waitForServer();
    check("relay_chain_server_starts", up, { message: "dev server did not respond on /api/health" });
    if (!up) return results;

    // ── Provision a real organization + device ────────────────────────────
    const published = await (
      await fetch(BASE_URL + "/api/runtime/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ organizationSlug: ORG, publishedBy: "relay_chain", approved: true }),
      })
    ).json();
    check("relay_chain_runtime_published", published.ok === true, published);

    const deviceId = "relaychain_" + Date.now();
    const userId = "user_relaychain_1";
    const registered = await (
      await fetch(BASE_URL + "/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ deviceId, organizationId: ORG }),
      })
    ).json();
    check("relay_chain_device_registered", typeof registered.secret === "string", registered);
    const secret = registered.secret;

    // ── Deliver a locked workday exactly as the phone would ───────────────
    const exportId = "exp_chain_" + Date.now();
    const packet = makeLockedWorkday(exportId, deviceId, userId);
    const rawBody = JSON.stringify(packet);

    const postRes = await fetch(BASE_URL + "/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Punchout-Device": deviceId,
        "X-Punchout-Signature": sign(secret, rawBody),
      },
      body: rawBody,
    });
    const postBody = await postRes.json();
    check(
      "relay_chain_signed_export_accepted_and_relayed",
      postRes.status === 201 && postBody.signatureVerified === true && postBody.relayed === true,
      { status: postRes.status, body: postBody },
    );

    // ── An unsigned/tampered export must NOT enter the Relay ─────────────
    const badExportId = "exp_chain_bad_" + Date.now();
    const badPacket = makeLockedWorkday(badExportId, deviceId, userId);
    const badBody = JSON.stringify(badPacket);
    const badRes = await fetch(BASE_URL + "/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Punchout-Device": deviceId, "X-Punchout-Signature": "deadbeef" },
      body: badBody,
    });
    const badRelay = await fetch(`${BASE_URL}/api/relay?org=${ORG}&exportId=${badExportId}`, { headers: authHeader });
    check(
      "relay_chain_invalid_signature_never_enters_relay",
      badRes.status === 401 && badRelay.status === 404,
      { exportStatus: badRes.status, relayStatus: badRelay.status },
    );

    // ── Inspection surface shows the real workday ─────────────────────────
    const listRes = await fetch(`${BASE_URL}/api/relay?org=${ORG}`, { headers: authHeader });
    const listing = await listRes.json();
    const row = (listing.records || []).find((r) => r.exportId === exportId);
    check(
      "relay_chain_inspection_lists_the_workday_with_identity",
      !!row && row.userId === userId && row.deviceId === deviceId && row.dayId === "2026-08-17" && row.payloadSummary.entries === 3,
      { row },
    );

    const unauth = await fetch(`${BASE_URL}/api/relay?org=${ORG}`);
    check("relay_chain_inspection_requires_admin_auth", unauth.status === 401, { status: unauth.status });

    const detailRes = await fetch(`${BASE_URL}/api/relay?org=${ORG}&exportId=${exportId}`, { headers: authHeader });
    const detail = await detailRes.json();
    check(
      "relay_chain_full_payload_readable_over_http",
      detail.record?.payload?.timeEntries?.[0]?.ordre === "204481-0014"
        && detail.record.payload.schemas[0].type === "sja_preday"
        && detail.record.payload.entries.length === 3,
      { payload: detail.record?.payload },
    );

    // ── Run the CSV adapter through the API ──────────────────────────────
    const dispatchRes = await fetch(BASE_URL + "/api/relay", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ org: ORG, target: "csv-file" }),
    });
    const dispatch = await dispatchRes.json();
    // ── Provenance survives confirm -> lock -> sign -> Relay ─────────────
    const relayedSchema = detail.record?.payload?.schemas?.find(
      (s) => s.id === "schema_sja_chain",
    );
    check(
      "relay_chain_field_provenance_survives_to_the_relay",
      relayedSchema?.fieldProvenance?.konsekvens?.origin === "WORKER" &&
        relayedSchema?.fieldProvenance?.sted?.origin === "INFERRED_CONFIRMED" &&
        relayedSchema?.fieldProvenance?.tiltak?.origin === "SUGGESTION_ACCEPTED",
      { fieldProvenance: relayedSchema?.fieldProvenance },
    );
    check(
      "relay_chain_work_warning_plan_survives_beside_the_enum",
      relayedSchema?.fields?.arbeidsvarslingsplan === "24-184" &&
        relayedSchema?.fields?.arbeidsvarsling === "enkel",
      { fields: relayedSchema?.fields },
    );

    check("relay_chain_csv_adapter_delivered", dispatch.delivered >= 1 && dispatch.failed === 0, dispatch);

    const csvDir = path.join(dataDir, "adapter-output", "csv", ORG, exportId);
    const csvFiles = existsSync(csvDir) ? readdirSync(csvDir).sort() : [];
    check(
      "relay_chain_csv_files_written_to_disk",
      csvFiles.includes("time_entries.csv") && csvFiles.includes("summary.csv") && csvFiles.includes("schemas.csv"),
      { csvDir, csvFiles },
    );

    const timeCsvBuf = existsSync(path.join(csvDir, "time_entries.csv")) ? readFileSync(path.join(csvDir, "time_entries.csv")) : Buffer.alloc(0);
    const timeCsv = timeCsvBuf.toString("utf8");
    check(
      "relay_chain_csv_is_norwegian_excel_compatible_and_carries_the_real_work",
      timeCsvBuf[0] === 0xef && timeCsvBuf[1] === 0xbb && timeCsvBuf[2] === 0xbf
        && timeCsv.split("\n")[0].includes(";")
        && timeCsv.includes("204481-0014")
        && timeCsv.includes("æøå-test"),
      { head: timeCsv.slice(0, 200) },
    );

    // ── Idempotency: re-dispatch must not duplicate ──────────────────────
    const redispatch = await (
      await fetch(BASE_URL + "/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ org: ORG, target: "csv-file" }),
      })
    ).json();
    const csvFilesAfter = readdirSync(csvDir).sort();
    check(
      "relay_chain_redispatch_is_idempotent",
      redispatch.attempted === 0 && csvFilesAfter.join(",") === csvFiles.join(","),
      { redispatch, before: csvFiles, after: csvFilesAfter },
    );

    // ── Duplicate export delivery: one logical record ─────────────────────
    const dupRes = await fetch(BASE_URL + "/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Punchout-Device": deviceId,
        "X-Punchout-Signature": sign(secret, rawBody),
      },
      body: rawBody,
    });
    const listAfterDup = await (await fetch(`${BASE_URL}/api/relay?org=${ORG}`, { headers: authHeader })).json();
    const matching = (listAfterDup.records || []).filter((r) => r.exportId === exportId);
    check(
      "relay_chain_duplicate_export_stays_one_logical_record",
      dupRes.status === 409 && matching.length === 1,
      { status: dupRes.status, matching: matching.length },
    );

    // ── SERVER RESTART, then readback ────────────────────────────────────
    await stopServer(server);
    server = startServer(env);
    const backUp = await waitForServer();
    check("relay_chain_server_restarts", backUp, { message: "server did not come back up" });

    if (backUp) {
      const afterRestart = await (await fetch(`${BASE_URL}/api/relay?org=${ORG}&exportId=${exportId}`, { headers: authHeader })).json();
      check(
        "relay_chain_workday_survives_server_restart_with_same_facts",
        afterRestart.record?.exportId === exportId
          && afterRestart.record.userId === userId
          && afterRestart.record.deviceId === deviceId
          && afterRestart.record.payload.entries.length === 3
          && afterRestart.record.payload.timeEntries[0].arbeidsbeskrivelse[0].includes("æøå-test"),
        { record: afterRestart.record },
      );
      check(
        "relay_chain_delivery_state_survives_server_restart",
        afterRestart.delivery?.["csv-file"]?.status === "DELIVERED"
          && typeof afterRestart.delivery["csv-file"].deliveredAt === "string",
        { delivery: afterRestart.delivery },
      );

      // The CSV artifact itself must still be attributable to the same day.
      const summaryCsv = readFileSync(path.join(csvDir, "summary.csv"), "utf8");
      check(
        "relay_chain_csv_artifact_remains_attributable_after_restart",
        summaryCsv.includes("exportId;" + exportId)
          && summaryCsv.includes("userId;" + userId)
          && summaryCsv.includes("organizationId;" + ORG),
        { summaryCsv: summaryCsv.slice(0, 300) },
      );
    }
  } finally {
    await stopServer(server);
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // best effort — Windows can hold handles briefly after process exit
    }
  }

  return results;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("relay-delivery-chain.mjs")) {
  const results = await runRelayDeliveryChainCheck();
  for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
  const allPassed = results.every((r) => r.passed);
  console.log("\n" + results.length + " checks, all passed:", allPassed);
  process.exit(allPassed ? 0 : 1);
}
