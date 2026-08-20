/**
 * BROWSER FIELD READINESS — real Chromium, iPhone viewport, real workday.
 * =======================================================================
 *
 * lib/regression/browser-verification.mjs already proves the vertical path
 * works in a real browser: provision -> workday -> lock -> export. This script
 * covers what Operation Punchout Field Trial ADDED, on a phone-sized viewport,
 * because those paths did not exist when that script was written:
 *
 *   - main hours actually ENTERED and CONFIRMED (previously impossible — the
 *     old script could only reach lock by DISCARDING them);
 *   - the confirmed main-time line surviving into the Relay payload;
 *   - the Relay inspection page a founder opens afterwards;
 *   - touch-target sizes on the controls those paths introduced;
 *   - the trust-signal wording Prism's TR-01 finding produced.
 *
 * Chromium's iPhone 13 emulation is NOT a physical device (see
 * docs/mobile-readiness-protocol.md — real hardware remains genuinely
 * unverified). It catches layout, overflow and hit-target problems; it does
 * not catch real touch, real keyboards, real network transitions or real
 * Safari. Those are exactly what the founder's phone test is for.
 *
 * Standalone: node lib/regression/browser-field-readiness.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, devices } from "playwright";

const PORT = 3995;
const ADMIN_TOKEN = "field_readiness_test_token";
const BASE_URL = `http://localhost:${PORT}`;
const authHeader = { Authorization: `Bearer ${ADMIN_TOKEN}` };

/** Apple's and Google's published minimum comfortable touch target, in CSS px. */
const MIN_TOUCH_TARGET = 44;

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

const noHorizontalScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

export async function runBrowserFieldReadiness() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: !!ok, error: ok ? null : JSON.stringify(detail ?? null) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-field-readiness-"));
  const env = { ...process.env, PUNCHOUT_DATA_DIR: dataDir, PUNCHOUT_ADMIN_TOKEN: ADMIN_TOKEN, PORT: String(PORT) };
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)], {
    env,
    cwd: process.cwd(),
    stdio: "pipe",
  });

  let browser;
  try {
    const up = await waitForServer();
    check("field_readiness_server_starts", up, { message: "dev server did not respond" });
    if (!up) return results;

    await fetch(BASE_URL + "/api/runtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ organizationSlug: "mesta", publishedBy: "field_readiness", approved: true }),
    });
    const deviceId = "field_ready_" + Date.now();
    const reg = await (
      await fetch(BASE_URL + "/api/devices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ deviceId, organizationId: "mesta" }),
      })
    ).json();

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));

    // ── Provision on the phone-sized viewport ────────────────────────────
    await page.goto(BASE_URL + "/provision", { waitUntil: "networkidle" });
    check("field_readiness_provision_no_horizontal_scroll", await noHorizontalScroll(page));
    await page.getByPlaceholder("f.eks. mesta_phone_1").fill(deviceId);
    await page.getByPlaceholder("hemmeligheten fra registreringssvaret").fill(reg.secret);
    await page.getByPlaceholder("f.eks. ola.nordmann").fill("ola.nordmann");
    const [provisionResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/devices/provision")),
      page.getByRole("button", { name: "Sett opp enhet" }).click(),
    ]);
    check("field_readiness_provision_succeeds", provisionResponse.ok());

    // ── A realistic workday, with Norwegian content lengths ──────────────
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    await page.getByRole("button", { name: "Start dag" }).tap();
    await page.waitForTimeout(500);
    check("field_readiness_preday_no_horizontal_scroll", await noHorizontalScroll(page));

    await page.getByRole("button", { name: "Gå til drift" }).tap();
    await page.waitForTimeout(600);

    // Confirm a start time of 07:00 rather than tapping "Nå".
    //
    // Not a shortcut around the UI — "Nå" is exercised by
    // browser-verification.mjs already. It is required for REALISM: this whole
    // script runs in seconds, so tapping "Nå" makes startTime and endTime the
    // same minute. A zero-length day legitimately has no hours to suggest, and
    // getSuggestedMainTimeLonnskode() correctly returns null rather than
    // inventing a range — which is right, but means the suggestion path would
    // never be exercised. A real field day is hours long; this makes the test
    // day one. confirmStartTime() is write-once for user-confirmed times, so
    // this must happen before any "Nå" tap, not after.
    await page.evaluate(() => {
      window.Motor.confirmStartTime("07:00");
      window.dispatchEvent(new CustomEvent("motor-state-change", { detail: { key: "__action__" } }));
    });
    await page.waitForTimeout(400);

    // Deliberately long Norwegian text with æ/ø/å — the length and diacritics
    // that break naive layouts.
    await page
      .getByPlaceholder("Skriv loggføring...")
      .fill("204481-0014 fra 07:30 til 11:00 brøyting og strøing på Fv. 17 sørover mot Steinkjer, dårlig sikt og glatt føre");
    await page.getByRole("button", { name: "Logg", exact: true }).tap();
    await page.waitForTimeout(1800);
    check("field_readiness_operations_no_horizontal_scroll_with_long_text", await noHorizontalScroll(page), {
      scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
    });

    await page.getByRole("button", { name: "Avslutt dag" }).tap();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Ja, gå videre" }).tap();
    await page.waitForTimeout(1200);
    check("field_readiness_handrens_no_horizontal_scroll", await noHorizontalScroll(page));

    // ── Main hours: the capability this mission added ────────────────────
    // Expand the main-time card, add a wage-code line, confirm it. Before this
    // mission there was no control here at all and the confirm button could
    // never be enabled.
    const behandleButtons = page.getByRole("button", { name: "Behandle" });
    const behandleCount = await behandleButtons.count();
    for (let i = 0; i < behandleCount; i++) {
      await behandleButtons.nth(i).tap();
      await page.waitForTimeout(250);
    }

    const addLine = page.getByRole("button", { name: "+ Legg til lønnskode" });
    const hasAddLine = (await addLine.count()) > 0;
    check("field_readiness_main_time_add_lonnskode_control_exists", hasAddLine);

    if (hasAddLine) {
      // Touch targets on the controls this mission introduced.
      const addBox = await addLine.first().boundingBox();
      check(
        "field_readiness_add_lonnskode_touch_target_adequate",
        !!addBox && addBox.height >= MIN_TOUCH_TARGET,
        { height: addBox?.height, required: MIN_TOUCH_TARGET },
      );

      await addLine.first().tap();
      await page.waitForTimeout(500);

      const kodeSelect = page.getByLabel("Lønnskode").first();
      const fraInput = page.getByLabel("Fra klokkeslett").first();
      const tilInput = page.getByLabel("Til klokkeslett").first();
      check("field_readiness_lonnskode_line_rendered", (await kodeSelect.count()) > 0 && (await fraInput.count()) > 0);

      const selectBox = await kodeSelect.boundingBox();
      const fraBox = await fraInput.boundingBox();
      check(
        "field_readiness_lonnskode_inputs_touch_target_adequate",
        !!selectBox && selectBox.height >= MIN_TOUCH_TARGET && !!fraBox && fraBox.height >= MIN_TOUCH_TARGET,
        { select: selectBox?.height, fra: fraBox?.height, required: MIN_TOUCH_TARGET },
      );

      // The added line arrives prefilled with the day minus hours already
      // booked on specific orders — the worker adjusts rather than types from
      // scratch. Asserting the actual confirmed start time, not just
      // "non-empty", so a regression that prefills the wrong window is caught.
      const fraValue = await fraInput.inputValue();
      const tilValue = await tilInput.inputValue();
      check("field_readiness_suggested_line_is_prefilled_from_the_real_day", fraValue === "07:00" && !!tilValue, {
        fraValue,
        tilValue,
      });

      check("field_readiness_handrens_no_horizontal_scroll_with_lonnskode_editor", await noHorizontalScroll(page), {
        scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
        clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
      });

      const confirmTimesheet = page.getByRole("button", { name: "Bekreft timeark" });
      check("field_readiness_confirm_timesheet_enabled_after_adding_line", await confirmTimesheet.first().isEnabled());
      await confirmTimesheet.first().tap();
      await page.waitForTimeout(700);
    }

    // Resolve anything else still open (schemas etc.).
    for (let round = 0; round < 10; round++) {
      const expand = page.getByRole("button", { name: "Behandle" });
      const n = await expand.count();
      for (let i = 0; i < n; i++) {
        await expand.nth(i).tap();
        await page.waitForTimeout(200);
      }
      const confirms = page.getByRole("button", { name: /^Bekreft/ });
      if ((await confirms.count()) === 0) break;
      await confirms.first().tap();
      await page.waitForTimeout(500);
    }

    // ── The trust wording Prism's TR-01 finding produced ─────────────────
    const bodyText = await page.evaluate(() => document.body.innerText);
    check(
      "field_readiness_lock_states_consequences_before_committing",
      bodyText.includes("Dagen låses og sendes til arbeidsgiver"),
      { excerpt: bodyText.slice(0, 400) },
    );

    const lockButton = page.getByRole("button", { name: "Lås dag" });
    if ((await lockButton.count()) > 0) {
      const lockBox = await lockButton.first().boundingBox();
      check("field_readiness_lock_touch_target_adequate", !!lockBox && lockBox.height >= MIN_TOUCH_TARGET, {
        height: lockBox?.height,
      });
      await lockButton.first().tap();
      await page.waitForTimeout(2500);
    }

    const locked = await page.evaluate(() => window.Motor?.getSnapshot()?.appState);
    check("field_readiness_day_locks_after_confirming_main_hours", locked === "LOCKED", { appState: locked });

    check("field_readiness_zero_console_errors_full_workday", consoleErrors.length === 0, { consoleErrors });

    // ── The confirmed main-time line must reach the Relay ────────────────
    await page.waitForTimeout(2000);
    const relay = await (await fetch(`${BASE_URL}/api/relay?org=mesta`, { headers: authHeader })).json();
    const record = (relay.records || [])[0];
    check("field_readiness_workday_reached_relay", !!record, { relay });

    if (record) {
      const detail = await (
        await fetch(`${BASE_URL}/api/relay?org=mesta&exportId=${encodeURIComponent(record.exportId)}`, { headers: authHeader })
      ).json();
      const timeEntries = detail.record?.payload?.timeEntries ?? [];
      check(
        "field_readiness_confirmed_main_hours_reached_the_relay_payload",
        timeEntries.length > 0 && timeEntries.some((t) => Array.isArray(t.lonnskoder) && t.lonnskoder.length > 0),
        { timeEntries },
      );
      check(
        "field_readiness_relay_payload_attributed_to_the_real_worker",
        detail.record?.userId === "ola.nordmann" && detail.record?.organizationId === "mesta",
        { userId: detail.record?.userId, organizationId: detail.record?.organizationId },
      );
    }

    // ── The inspection page the founder opens afterwards ─────────────────
    await page.goto(BASE_URL + "/relay", { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    check("field_readiness_relay_page_no_horizontal_scroll_empty", await noHorizontalScroll(page));

    await page.getByPlaceholder("organizationId (f.eks. mesta)").fill("mesta");
    await page.getByPlaceholder("admin-token").fill(ADMIN_TOKEN);
    await page.getByRole("button", { name: "Hent" }).tap();
    await page.waitForTimeout(1200);
    const relayText = await page.evaluate(() => document.body.innerText);
    check("field_readiness_relay_page_shows_the_workday", relayText.includes("arbeidsdag"), { excerpt: relayText.slice(0, 300) });
    check("field_readiness_relay_page_no_horizontal_scroll_with_data", await noHorizontalScroll(page), {
      scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
    });

    // ── Suspend/resume and offline -> online recovery ────────────────────
    //
    // Both handlers live in motor.js `initExportSync()`: `visibilitychange`
    // re-runs syncExports() when the tab becomes visible, and `online` clears
    // the retry backoff before syncing. Neither had any coverage anywhere, and
    // neither is reachable from the motor sandbox — its `document` stub is
    // `addEventListener: () => {}`, so the visibility listener is discarded,
    // and `init()` is not exported so `initExportSync()` never runs there at
    // all. A real page is the only place these exist.
    //
    // This is the pilot's most ordinary failure: the phone sits in a pocket
    // out of coverage all afternoon, the day is locked, and the phone comes
    // back. If these handlers regress, the locked day silently never leaves
    // the device — and the Day Trace would correctly report NEVER_ARRIVED for
    // a day the worker believes was sent.
    //
    // The assertions deliberately avoid the signing path: a hand-seeded packet
    // would need a valid device signature, and coupling this to that would
    // test the wrong thing. Backoff clearing is pure local state, and a status
    // transition proves the handler fired regardless of what the server said.
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);

    const backoffCleared = await page.evaluate(async () => {
      const KEY = "punchout_outbox";
      const farFuture = new Date(Date.now() + 86400000).toISOString();
      localStorage.setItem(KEY, JSON.stringify([{
        exportId: "resume_probe_failed",
        status: "failed",
        retries: 1,
        nextAttempt: farFuture,
        packet: { exportId: "resume_probe_failed", exportVersion: "1.0", deviceId: "probe" },
      }]));
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 400));
      const entry = JSON.parse(localStorage.getItem(KEY) || "[]")[0];
      // `?? "missing"` would be wrong here: resetFailedExportsForRetry sets
      // nextAttempt to null, and `null ?? "missing"` collapses a correctly
      // cleared backoff into something indistinguishable from an absent field.
      // The first draft of this probe did exactly that and reported a working
      // handler as broken.
      return {
        present: !!entry,
        backoffCleared: !!entry && entry.nextAttempt === null,
        status: entry ? entry.status : "missing",
      };
    });
    check(
      "field_readiness_coming_back_online_clears_the_retry_backoff",
      backoffCleared.present && backoffCleared.backoffCleared,
      backoffCleared,
    );

    const resumed = await page.evaluate(async () => {
      const KEY = "punchout_outbox";
      localStorage.setItem(KEY, JSON.stringify([{
        exportId: "resume_probe_pending",
        status: "pending",
        retries: 0,
        packet: { exportId: "resume_probe_pending", exportVersion: "1.0", deviceId: "probe" },
      }]));
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 800));
      const entry = JSON.parse(localStorage.getItem(KEY) || "[]")[0];
      return { status: entry?.status ?? "missing" };
    });
    check(
      "field_readiness_returning_to_the_foreground_drains_the_outbox",
      resumed.status !== "pending" && resumed.status !== "missing",
      resumed,
    );

    await context.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
    await new Promise((r) => setTimeout(r, 1200));
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // best effort — Windows can hold handles briefly after process exit
    }
  }

  return results;
}

if (process.argv[1]?.endsWith("browser-field-readiness.mjs")) {
  const results = await runBrowserFieldReadiness();
  for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
  const allPassed = results.every((r) => r.passed);
  console.log("\n" + results.length + " checks, all passed:", allPassed);
  process.exit(allPassed ? 0 : 1);
}
