/**
 * PRODUCTION ACCEPTANCE — the run that gates the founder field test.
 * ==================================================================
 *
 * Every other browser/HTTP script in this directory spawns `next dev`. This one
 * does not. It builds the real production standalone server and drives a
 * complete workday against it, on a phone viewport, in real Chromium, with a
 * fresh data volume — because "it works in dev" has never been the claim that
 * matters, and this repository has already been burned once by a bug that
 * reproduced only in the production build (the module-boundary Runtime failure
 * documented in app/layout.tsx).
 *
 * The acceptance path, with no mocks except the absent external receivers:
 *
 *   production build -> standalone server -> fresh data dir
 *     -> publish runtime -> register + provision a real device
 *     -> phone-viewport workday: pre-day, drift, structured order line,
 *        correction, interruption/reload, main hours entered and confirmed
 *     -> lock -> signed export over real HMAC
 *     -> Relay custody -> CSV adapter -> real files on disk
 *     -> SERVER RESTART
 *     -> readback: same identity, same facts, same artifact
 *
 * No step after the workday begins recreates any data by hand.
 *
 * Run standalone (slow — includes a production build):
 *   node lib/regression/production-acceptance.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, devices } from "playwright";

const PORT = 3994;
const ADMIN_TOKEN = "production_acceptance_token";
const BASE_URL = `http://127.0.0.1:${PORT}`;
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

function startStandalone(env) {
  // Mirrors the Dockerfile's runner stage: `node server.js` from the assembled
  // standalone directory, with HOSTNAME pinned so the server binds all
  // interfaces rather than a container-specific address.
  return spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(".next/standalone"),
    env: { ...env, NODE_ENV: "production", HOSTNAME: "0.0.0.0", PORT: String(PORT) },
    stdio: "pipe",
  });
}

async function stopServer(proc) {
  if (!proc || proc.killed) return;
  proc.kill();
  await new Promise((r) => setTimeout(r, 2000));
}

export async function runProductionAcceptance() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: !!ok, error: ok ? null : JSON.stringify(detail ?? null) });

  // ── Build the real production artifact ────────────────────────────────
  const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env },
  });
  check("production_acceptance_build_succeeds", build.status === 0, {
    status: build.status,
    stderr: (build.stderr || "").slice(-1500),
  });
  if (build.status !== 0) return results;

  // Assemble exactly what the Dockerfile's COPY steps produce. organizations/
  // is read with fs.readFileSync rather than imported, so Next's tracer does
  // not include it — the same reason the Dockerfile copies it explicitly.
  try {
    mkdirSync(".next/standalone/.next/static", { recursive: true });
    cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
    cpSync("public", ".next/standalone/public", { recursive: true });
    cpSync("organizations", ".next/standalone/organizations", { recursive: true });
    check("production_acceptance_standalone_assembled", existsSync(".next/standalone/server.js"));
  } catch (e) {
    check("production_acceptance_standalone_assembled", false, { error: String(e) });
    return results;
  }

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-prod-acceptance-"));
  const env = { ...process.env, PUNCHOUT_DATA_DIR: dataDir, PUNCHOUT_ADMIN_TOKEN: ADMIN_TOKEN };
  let server = startStandalone(env);
  let browser;

  try {
    const up = await waitForServer();
    check("production_acceptance_standalone_server_starts", up, { message: "standalone server did not respond on /api/health" });
    if (!up) return results;

    const published = await (
      await fetch(BASE_URL + "/api/runtime/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ organizationSlug: ORG, publishedBy: "production_acceptance", approved: true }),
      })
    ).json();
    check("production_acceptance_runtime_published", published.ok === true, published);

    const deviceId = "prod_accept_" + Date.now();
    const userId = "ola.nordmann";
    const reg = await (
      await fetch(BASE_URL + "/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ deviceId, organizationId: ORG }),
      })
    ).json();
    check("production_acceptance_device_registered", typeof reg.secret === "string", reg);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));

    // ── Provision through the real form ─────────────────────────────────
    await page.goto(BASE_URL + "/provision", { waitUntil: "networkidle" });
    await page.getByPlaceholder("f.eks. mesta_phone_1").fill(deviceId);
    await page.getByPlaceholder("hemmeligheten fra registreringssvaret").fill(reg.secret);
    await page.getByPlaceholder("f.eks. ola.nordmann").fill(userId);
    const [provRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/devices/provision")),
      page.getByRole("button", { name: "Sett opp enhet" }).click(),
    ]);
    check("production_acceptance_device_provisions", provRes.ok());

    // ── The workday ─────────────────────────────────────────────────────
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    const wiring = await page.evaluate(() => ({
      org: window.ADMIN_CONFIG?.organizationId,
      user: window.ADMIN_CONFIG?.userId,
      hasSecret: !!window.ADMIN_CONFIG?.exportHmacSecret,
      runtimeOrg: window.PUNCHOUT_RUNTIME?.organizationId,
    }));
    check(
      "production_acceptance_real_runtime_reaches_the_browser",
      wiring.org === ORG && wiring.user === userId && wiring.hasSecret && wiring.runtimeOrg === ORG,
      wiring,
    );

    await page.getByRole("button", { name: "Start dag" }).tap();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Gå til drift" }).tap();
    await page.waitForTimeout(700);

    // A realistic multi-hour day (see browser-field-readiness.mjs for why a
    // same-second day is not representative).
    await page.evaluate(() => {
      window.Motor.confirmStartTime("07:00");
      window.dispatchEvent(new CustomEvent("motor-state-change", { detail: { key: "__action__" } }));
    });
    await page.waitForTimeout(400);

    // Ordinary work.
    await page.getByPlaceholder("Skriv loggføring...").fill("Sjekket kjøretøy og utstyr før avreise");
    await page.getByRole("button", { name: "Logg", exact: true }).tap();
    await page.waitForTimeout(1200);

    // Structured order line — the path that produces a real timesheet row.
    await page.getByPlaceholder("Skriv loggføring...").fill("204481-0014 fra 07:30 til 11:00 brøyting på Fv. 17 sørover");
    await page.getByRole("button", { name: "Logg", exact: true }).tap();
    await page.waitForTimeout(1600);
    const confirmOrder = page.getByRole("button", { name: /^Bekreft/ });
    if ((await confirmOrder.count()) > 0) {
      await confirmOrder.first().tap();
      await page.waitForTimeout(900);
    }

    // A correction.
    await page.getByPlaceholder("Skriv loggføring...").fill("Grus bestilt til mandag");
    await page.getByRole("button", { name: "Logg", exact: true }).tap();
    await page.waitForTimeout(1200);

    const entriesBeforeReload = await page.evaluate(() => window.Motor.getSnapshot().dayLog.entries.length);

    // ── Interruption: full reload mid-day ───────────────────────────────
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const afterReload = await page.evaluate(() => {
      const s = window.Motor.getSnapshot();
      return { entries: s.dayLog?.entries.length ?? 0, phase: s.dayLog?.phase, start: s.dayLog?.startTime };
    });
    check(
      "production_acceptance_workday_survives_reload_mid_day",
      afterReload.entries === entriesBeforeReload && afterReload.phase === "active" && afterReload.start === "07:00",
      { before: entriesBeforeReload, after: afterReload },
    );

    // ── End of day ──────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Avslutt dag" }).tap();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Ja, gå videre" }).tap();
    await page.waitForTimeout(1400);

    for (let round = 0; round < 12; round++) {
      const expand = page.getByRole("button", { name: "Behandle" });
      const n = await expand.count();
      for (let i = 0; i < n; i++) {
        await expand.nth(i).tap();
        await page.waitForTimeout(200);
      }
      const addLine = page.getByRole("button", { name: "+ Legg til lønnskode" });
      if ((await addLine.count()) > 0) {
        const lines = await page.getByLabel("Lønnskode").count();
        if (lines === 0) {
          await addLine.first().tap();
          await page.waitForTimeout(500);
        }
      }
      const confirms = page.getByRole("button", { name: /^Bekreft/ });
      if ((await confirms.count()) === 0) break;
      await confirms.first().tap();
      await page.waitForTimeout(600);
    }

    const mainTimeState = await page.evaluate(() => {
      const s = window.Motor.getSnapshot();
      const ctx = window.Motor.getMainTimeContext?.();
      return { handled: s.dayLog?.mainTimeHandled, discarded: s.dayLog?.mainTimeDiscarded, lines: ctx?.lonnskoder?.length ?? 0 };
    });
    check(
      "production_acceptance_main_hours_confirmed_not_discarded",
      mainTimeState.handled === true && !mainTimeState.discarded,
      mainTimeState,
    );

    const lockBtn = page.getByRole("button", { name: "Lås dag" });
    check("production_acceptance_lock_available_after_resolving_everything", (await lockBtn.count()) > 0);
    if ((await lockBtn.count()) > 0) {
      await lockBtn.first().tap();
      await page.waitForTimeout(3000);
    }
    const appState = await page.evaluate(() => window.Motor.getSnapshot().appState);
    check("production_acceptance_day_locked", appState === "LOCKED", { appState });
    check("production_acceptance_zero_console_errors", consoleErrors.length === 0, { consoleErrors });

    // ── Relay custody ───────────────────────────────────────────────────
    await page.waitForTimeout(2500);
    const listing = await (await fetch(`${BASE_URL}/api/relay?org=${ORG}`, { headers: authHeader })).json();
    const row = (listing.records || [])[0];
    check("production_acceptance_relay_took_custody", !!row && row.userId === userId, { listing });

    let exportId = row?.exportId;
    let detail = null;
    if (exportId) {
      detail = await (
        await fetch(`${BASE_URL}/api/relay?org=${ORG}&exportId=${encodeURIComponent(exportId)}`, { headers: authHeader })
      ).json();
      const payload = detail.record?.payload;
      const mainLine = (payload?.timeEntries ?? []).find((t) => Array.isArray(t.lonnskoder) && t.lonnskoder.length > 0);
      check(
        "production_acceptance_payload_contains_the_real_workday",
        (payload?.entries?.length ?? 0) >= 3 && !!mainLine,
        { entries: payload?.entries?.length, timeEntries: payload?.timeEntries },
      );
    }

    // ── CSV adapter ─────────────────────────────────────────────────────
    const dispatch = await (
      await fetch(BASE_URL + "/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ org: ORG, target: "csv-file" }),
      })
    ).json();
    check("production_acceptance_csv_adapter_delivered", dispatch.delivered >= 1 && dispatch.failed === 0, dispatch);

    const csvDir = exportId ? path.join(dataDir, "adapter-output", "csv", ORG, exportId) : null;
    const csvFiles = csvDir && existsSync(csvDir) ? readdirSync(csvDir).sort() : [];
    check("production_acceptance_csv_written", csvFiles.includes("time_entries.csv") && csvFiles.includes("summary.csv"), {
      csvDir,
      csvFiles,
    });

    if (csvDir && csvFiles.includes("time_entries.csv")) {
      const buf = readFileSync(path.join(csvDir, "time_entries.csv"));
      const text = buf.toString("utf8");
      check(
        "production_acceptance_csv_is_norwegian_excel_ready_with_real_content",
        buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf && text.split("\n")[0].includes(";") && text.includes("204481-0014") && text.includes("brøyting"),
        { head: text.slice(0, 220) },
      );
      const wage = readFileSync(path.join(csvDir, "wage_codes.csv"), "utf8");
      check("production_acceptance_csv_carries_wage_code_lines", wage.split("\n").length > 1 && wage.includes("100"), {
        wage: wage.slice(0, 200),
      });
    }

    // ── SERVER RESTART, then readback ───────────────────────────────────
    await stopServer(server);
    server = startStandalone(env);
    const backUp = await waitForServer();
    check("production_acceptance_server_restarts", backUp);

    if (backUp && exportId) {
      const after = await (
        await fetch(`${BASE_URL}/api/relay?org=${ORG}&exportId=${encodeURIComponent(exportId)}`, { headers: authHeader })
      ).json();
      check(
        "production_acceptance_same_facts_after_restart",
        after.record?.exportId === exportId
          && after.record.userId === userId
          && after.record.organizationId === ORG
          && JSON.stringify(after.record.payload) === JSON.stringify(detail.record.payload),
        { before: detail?.record?.exportId, after: after.record?.exportId },
      );
      check(
        "production_acceptance_delivery_state_survives_restart",
        after.delivery?.["csv-file"]?.status === "DELIVERED",
        { delivery: after.delivery },
      );
      check("production_acceptance_csv_artifact_still_on_disk", existsSync(path.join(csvDir, "summary.csv")));
    }
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }

  return results;
}

if (process.argv[1]?.endsWith("production-acceptance.mjs")) {
  const results = await runProductionAcceptance();
  for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
  const allPassed = results.every((r) => r.passed);
  console.log("\n" + results.length + " checks, all passed:", allPassed);
  process.exit(allPassed ? 0 : 1);
}
