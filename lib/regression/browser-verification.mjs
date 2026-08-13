/**
 * Operation Punchout Soft Launch — real browser verification, permanent
 * regression form.
 *
 * This mission's First Principle: "a simulated integration is not an
 * integrated product." Every prior report in this engagement's history
 * documented browser verification as "prepared, not executed" — no
 * browser automation tool was ever available. This session found that a
 * real Chromium install (via Playwright) and Docker were both actually
 * available in this environment, contrary to those reports, and used
 * them to run the actual workday flow through a real browser for the
 * first time ever — finding real bugs in the process each time it was
 * extended: a @vercel/analytics 404 on every real page load, device
 * provisioning silently never persisting the export secret/userId, and
 * (via Playwright's iPhone 13 viewport emulation) a flexbox overflow bug
 * that pushed the "Logg" button off-screen on the single most-used
 * screen in the app, on any real phone-width viewport. This script
 * codifies exactly what was proven manually into a permanent, repeatable
 * check instead of a one-off finding.
 *
 * Honest scope: this proves real browser DOM execution and real network
 * requests against a real running server — a genuinely higher proof
 * level than any VM-sandbox or curl-only test in this suite. It does
 * NOT satisfy docs/browser-readiness-protocol.md in full: that protocol
 * requires Chrome, Edge, AND Firefox (this uses Chromium only, one
 * engine), plus manual checks this can't automate (visual/layout review,
 * real network conditions, real focus/keyboard behavior on physical
 * hardware). Treat this as closing the "does it work in a real browser
 * at all" gap, not the complete protocol.
 *
 * Spawns `next dev` as a real child process, same "spawn a real process"
 * philosophy as security-audit.mjs/runtime-provisioning.mjs. Requires
 * Chromium to be installed (npx playwright install chromium) — not
 * bundled by default to avoid forcing a ~150MB download on every
 * contributor; CI installs it explicitly (see .github/workflows/ci.yml).
 * Slower than the pure-function suite, intentionally NOT wired into
 * lib/regression/run.mjs — run standalone:
 *   node lib/regression/browser-verification.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, devices } from "playwright";

const PORT = 3997;
const ADMIN_TOKEN = "browser_verification_test_token";
const BASE_URL = `http://localhost:${PORT}`;
const authHeader = { Authorization: `Bearer ${ADMIN_TOKEN}` };

async function waitForServer(timeoutMs = 60000) {
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

export async function runBrowserVerification() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-browser-verification-"));
  const env = { ...process.env, PUNCHOUT_DATA_DIR: dataDir, PUNCHOUT_ADMIN_TOKEN: ADMIN_TOKEN, PORT: String(PORT) };

  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)], {
    env,
    cwd: process.cwd(),
    stdio: "pipe",
  });

  let browser;
  try {
    const up = await waitForServer();
    check("browser_verification_server_starts", up, { message: "dev server did not respond on /api/health within timeout" });
    if (!up) return results;

    browser = await chromium.launch({ headless: true });

    // --- Check 1: cold load, no console errors ---
    {
      const page = await browser.newPage();
      const consoleErrors = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));
      await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      check("browser_verification_cold_load_no_console_errors", consoleErrors.length === 0, { consoleErrors });
      check("browser_verification_motor_initializes", await page.evaluate(() => typeof window.Motor !== "undefined"));
      await page.close();
    }

    // --- Check 1.5: mobile viewport (Chromium emulation, NOT a real device —
    // see docs/mobile-readiness-protocol.md, still genuinely unverified on
    // physical hardware). Found a real bug this exact check would have
    // caught: the log-entry input's flex-1 with no min-w-0 let its browser
    // intrinsic width push the Logg button off-screen on an iPhone-width
    // viewport, causing horizontal scroll on the single most-used screen in
    // the app. Fixed in components/punchout/operations-phase.tsx; this
    // check is the permanent guard against it recurring. ---
    {
      const context = await browser.newContext({ ...devices["iPhone 13"] });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
      page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));

      await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Start dag" }).tap();
      await page.waitForTimeout(400);
      const noScrollPreDay = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      check("browser_verification_mobile_no_horizontal_scroll_preday", noScrollPreDay);

      await page.getByRole("button", { name: "Gå til drift" }).tap();
      await page.waitForTimeout(500);
      const noScrollOps = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      check("browser_verification_mobile_no_horizontal_scroll_operations", noScrollOps, {
        scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
        clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
      });
      check("browser_verification_mobile_zero_console_errors", consoleErrors.length === 0, { consoleErrors });

      // /ops has the identical flex-1-without-min-w-0 pattern on its own two
      // inputs (org lookup, admin token) — found and fixed in the same pass,
      // worse than the workday case (the token placeholder text is longer).
      await page.goto(BASE_URL + "/ops", { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      const noScrollOps2 = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      check("browser_verification_mobile_no_horizontal_scroll_ops_page", noScrollOps2, {
        scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
        clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
      });

      await context.close();
    }

    // --- Check 2: full real vertical path through a real browser ---
    // register -> provision (real form) -> reload -> full workday -> lock -> export
    const pub = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationSlug: "mesta", publishedBy: "browser_verification", approved: true }) })).json();
    const deviceId = "browser_verify_" + Date.now();
    const reg = await (await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId, organizationId: "mesta" }) })).json();

    const page = await browser.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));

    await page.goto(BASE_URL + "/provision", { waitUntil: "networkidle" });
    await page.getByPlaceholder("f.eks. mesta_phone_1").fill(deviceId);
    await page.getByPlaceholder("hemmeligheten fra registreringssvaret").fill(reg.secret);
    await page.getByPlaceholder("f.eks. ola.nordmann").fill("browser_verify_worker");
    // Deterministic wait for the actual provision response (not a fixed
    // timeout) — found via debugging that a fixed timeout here was flaky
    // under load, since it raced the fetch/cookie-set rather than actually
    // waiting for it; this is not a product bug, just an unreliable test.
    const [provisionResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/devices/provision")),
      page.getByRole("button", { name: "Sett opp enhet" }).click(),
    ]);
    check("browser_verification_provision_form_succeeds", provisionResponse.ok() && (await page.evaluate(() => document.body.innerText)).includes("mesta"));

    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const wiredCorrectly = await page.evaluate(() => ({
      org: window.ADMIN_CONFIG?.organizationId,
      hasSecret: !!window.ADMIN_CONFIG?.exportHmacSecret,
      userId: window.ADMIN_CONFIG?.userId,
      runtimeOrg: window.PUNCHOUT_RUNTIME?.organizationId,
    }));
    check(
      "browser_verification_provisioned_device_config_wired",
      wiredCorrectly.org === "mesta" && wiredCorrectly.hasSecret && wiredCorrectly.userId === "browser_verify_worker" && wiredCorrectly.runtimeOrg === "mesta",
      wiredCorrectly
    );

    await page.getByRole("button", { name: "Start dag" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Gå til drift" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Nå" }).click();
    await page.waitForTimeout(300);
    await page.getByPlaceholder("Skriv loggføring...").fill("Jobbet på " + (pub.manifest.organizationId || "204481-0014") + " med gravemaskin.");
    await page.getByRole("button", { name: "Logg", exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Avslutt dag" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Ja, gå videre" }).click();
    await page.waitForTimeout(1000);

    // Resolve whatever Håndrens items exist generically, same pattern as
    // lib/regression/full-day-scenario.mjs's own resolveAllUnresolved —
    // discard time (logged elsewhere), confirm everything else.
    for (let round = 0; round < 10; round++) {
      const behandleBtns = page.getByRole("button", { name: "Behandle" });
      const n = await behandleBtns.count();
      if (n === 0) break;
      await behandleBtns.nth(0).click();
      await page.waitForTimeout(400);
      const forkastBtn = page.getByRole("button", { name: /Forkast timeføring/ });
      const confirmBtn = page.getByRole("button", { name: "Bekreft" }).first();
      if (await forkastBtn.count() > 0) {
        await forkastBtn.click();
        await page.waitForTimeout(400);
        await page.getByRole("button", { name: "Timene er ført i annet system" }).click();
      } else if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
      } else {
        break;
      }
      await page.waitForTimeout(600);
    }

    const unresolvedCount = await page.evaluate(() => window.Motor.getSnapshot().unresolvedCount);
    check("browser_verification_handrens_resolves", unresolvedCount === 0, { unresolvedCount });

    const lockBtn = page.getByRole("button", { name: /Lås dag/i });
    if (await lockBtn.count() > 0) await lockBtn.click();
    await page.waitForTimeout(2000);

    const finalState = await page.evaluate(() => ({
      appState: window.Motor.getSnapshot().appState,
      outbox: window.Motor.getSnapshot().outboxStatus,
    }));
    check("browser_verification_day_locks", finalState.appState === "LOCKED", finalState);
    check("browser_verification_export_sent", finalState.outbox.sent === 1 && finalState.outbox.failed === 0, finalState.outbox);
    check("browser_verification_zero_console_errors_full_workday", consoleErrors.length === 0, { consoleErrors });

    const exportLog = await (await fetch(BASE_URL + "/api/export", { headers: authHeader })).json();
    const ourExport = exportLog.entries.find((e) => e.deviceId === deviceId);
    check(
      "browser_verification_export_correctly_attributed_server_side",
      !!ourExport && ourExport.organizationId === "mesta" && ourExport.signatureValid === true,
      ourExport
    );

    await page.close();
  } finally {
    if (browser) await browser.close();
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }

  return results;
}

// CLI entry — always invoked directly (node lib/regression/browser-verification.mjs), same convention as security-audit.mjs.
const results = await runBrowserVerification();
for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
const allPassed = results.length > 0 && results.every((r) => r.passed);
console.log("\n" + results.length + " checks, all passed:", allPassed);
process.exit(allPassed ? 0 : 1);
