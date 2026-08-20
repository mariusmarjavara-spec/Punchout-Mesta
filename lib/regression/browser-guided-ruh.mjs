/**
 * BROWSER GUIDED RUH — real Chromium, iPhone viewport, real worker path.
 * ======================================================================
 *
 * Its own script rather than more steps inside browser-field-readiness.mjs,
 * and the reason is worth stating: logging a Hendelse creates an extra
 * unresolved item, which shifted the "Behandle" indices that script's håndrens
 * section depends on. Adding RUH there meant changing an existing gate's
 * expectations to accommodate a new feature, which is the wrong direction.
 * Two scripts, two independent pieces of evidence, neither weakened.
 *
 * What this proves that engine and component tests cannot: that a worker can
 * REACH the guided RUH from the ordinary log screen, on a phone.
 *
 * Chromium's iPhone 13 emulation is not a physical device (see
 * docs/mobile-readiness-protocol.md). It catches layout, overflow and
 * hit-target problems; it does not catch real touch, real keyboards or real
 * Safari.
 *
 * Standalone: node lib/regression/browser-guided-ruh.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, devices } from "playwright";

const PORT = 3996;
const ADMIN_TOKEN = "guided_ruh_test_token";
const BASE_URL = `http://localhost:${PORT}`;
const authHeader = { Authorization: `Bearer ${ADMIN_TOKEN}` };
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
  page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );

export async function runBrowserGuidedRuh() {
  const results = [];
  const check = (id, ok, detail) =>
    results.push({ id, passed: !!ok, error: ok ? null : JSON.stringify(detail ?? null) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-guided-ruh-"));
  const env = {
    ...process.env,
    PUNCHOUT_DATA_DIR: dataDir,
    PUNCHOUT_ADMIN_TOKEN: ADMIN_TOKEN,
    PORT: String(PORT),
  };
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)],
    { env, cwd: process.cwd(), stdio: "pipe" },
  );

  let browser;
  try {
    const up = await waitForServer();
    check("guided_ruh_server_starts", up, { message: "dev server did not respond" });
    if (!up) return results;

    await fetch(BASE_URL + "/api/runtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ organizationSlug: "mesta", publishedBy: "guided_ruh", approved: true }),
    });
    const deviceId = "guided_ruh_" + Date.now();
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
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push("PAGEERROR: " + err.message));

    await page.goto(BASE_URL + "/provision", { waitUntil: "networkidle" });
    await page.getByPlaceholder("f.eks. mesta_phone_1").fill(deviceId);
    await page.getByPlaceholder("hemmeligheten fra registreringssvaret").fill(reg.secret);
    await page.getByPlaceholder("f.eks. ola.nordmann").fill("ola.nordmann");
    const [provisioned] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/devices/provision")),
      page.getByRole("button", { name: "Sett opp enhet" }).click(),
    ]);
    check("guided_ruh_provision_succeeds", provisioned.ok());

    // ── Into a working day ───────────────────────────────────────────────
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Start dag" }).tap();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Gå til drift" }).tap();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      window.Motor.confirmStartTime("07:00");
      // Context the RUH should reuse rather than ask for again.
      window.Motor.submitEntry(
        "Grøfterensk på RV92 fra km 14 til km 18 med L90.",
        "arbeid",
      );
    });
    await page.waitForTimeout(1200);

    // ── Report an incident, as a worker would ────────────────────────────
    //
    // The type has to be chosen. An entry logged as "Notat" is not an incident
    // and correctly triggers nothing — which is why the first attempt at this
    // test produced no RUH at all.
    await page.getByRole("button", { name: "Notat" }).first().tap();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Hendelse" }).first().tap();
    await page.waitForTimeout(300);
    await page.getByPlaceholder("Skriv loggføring...").fill("Skuffa traff autovernet da jeg rygget");
    await page.getByRole("button", { name: "Logg", exact: true }).tap();
    await page.waitForTimeout(1600);

    // React defers incident decisions to end-of-day rather than interrupting
    // the worker mid-task — motor.js states this explicitly, and a Hendelse
    // creates the RUH draft directly instead of prompting. So the real path to
    // a RUH is: log it, end the day, handle it in håndrens.
    //
    // An earlier attempt at this test added an inline "Vil du registrere dette
    // som RUH?" prompt, which would have duplicated a decision the app has
    // deliberately moved. Reverted; this follows the design instead.
    const ruhCreated = await page.evaluate(
      () => (window.Motor.getSnapshot().dayLog?.schemas ?? []).some((s) => s.type === "ruh"),
    );
    check("guided_ruh_incident_creates_a_ruh_draft", ruhCreated);

    await page.getByRole("button", { name: "Avslutt dag" }).tap();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Ja, gå videre" }).tap();
    await page.waitForTimeout(1400);
    check("guided_ruh_handrens_no_horizontal_scroll", await noHorizontalScroll(page));

    const behandle = page.getByRole("button", { name: "Behandle" });
    const reachable = (await behandle.count()) > 0;
    check("guided_ruh_is_reachable_from_handrens", reachable, {
      excerpt: (await page.evaluate(() => document.body.innerText)).slice(0, 300),
    });
    if (!reachable) return results;

    await behandle.first().tap();
    await page.waitForTimeout(500);
    const edit = page.getByRole("button", { name: /Rediger RUH-felt/i });
    check("guided_ruh_offers_an_edit_action", (await edit.count()) > 0);
    await edit.first().tap();
    await page.waitForTimeout(900);

    // ── The guided flow itself ───────────────────────────────────────────
    const opening = await page.evaluate(() => document.body.innerText);
    check(
      "guided_ruh_opens_on_the_narrative_prompt",
      opening.includes("Hva har skjedd?") && !opening.includes("Hvorfor tror du dette skjedde?"),
      { excerpt: opening.slice(0, 300) },
    );
    check(
      "guided_ruh_drops_cues_it_already_knows",
      !opening.includes("Hvor var du?") && opening.includes("Var andre involvert?"),
      { excerpt: opening.slice(0, 300) },
    );
    check("guided_ruh_no_horizontal_scroll", await noHorizontalScroll(page));

    const box = page.getByPlaceholder("Skriv eller bruk tale");
    const boxBounds = await box.first().boundingBox();
    check("guided_ruh_input_is_reachable", !!boxBounds && boxBounds.height >= MIN_TOUCH_TARGET, {
      height: boxBounds?.height,
    });

    // A thin narrative must draw out what is missing.
    await box.first().fill("Traff autovernet.");
    await page.getByRole("button", { name: "Neste" }).first().tap();
    await page.waitForTimeout(600);
    const followUp = await page.evaluate(() => document.body.innerText);
    check(
      "guided_ruh_asks_a_follow_up_on_a_thin_narrative",
      followUp.includes("Var noen andre involvert?"),
      { excerpt: followUp.slice(0, 240) },
    );

    await page.getByPlaceholder("Skriv eller bruk tale").fill("Nei, jeg var alene");
    await page.getByRole("button", { name: "Neste" }).first().tap();
    await page.waitForTimeout(600);
    await page.getByPlaceholder("Skriv eller bruk tale").fill("Bulk i autovernet, ingen personskade");
    await page.getByRole("button", { name: "Neste" }).first().tap();
    await page.waitForTimeout(600);

    const immediate = await page.evaluate(() => document.body.innerText);
    check(
      "guided_ruh_allows_no_action_was_necessary",
      immediate.includes("Hva gjorde du med en gang?") &&
        immediate.includes("Ingen tiltak var nødvendig"),
      { excerpt: immediate.slice(0, 300) },
    );
    await page.getByRole("button", { name: "Ingen tiltak var nødvendig" }).first().tap();
    await page.waitForTimeout(600);

    for (const answer of ["Dårlig sikt bakover", "Bruke signalmann ved rygging"]) {
      await page.getByPlaceholder("Skriv eller bruk tale").fill(answer);
      await page.getByRole("button", { name: "Neste" }).first().tap();
      await page.waitForTimeout(600);
    }

    // ── Review and explicit confirmation ─────────────────────────────────
    const review = await page.evaluate(() => document.body.innerText);
    check("guided_ruh_reaches_an_explicit_confirmation", /Bekreft RUH/i.test(review), {
      excerpt: review.slice(0, 400),
    });
    check("guided_ruh_review_no_horizontal_scroll", await noHorizontalScroll(page));

    const confirm = page.getByRole("button", { name: /Bekreft RUH/i });
    if ((await confirm.count()) > 0) {
      await confirm.first().tap();
      await page.waitForTimeout(900);
    }

    const stored = await page.evaluate(() => {
      const s = (window.Motor.getSnapshot().dayLog?.schemas ?? []).find((x) => x.type === "ruh");
      return s ? { fields: s.fields, provenance: s.fieldProvenance, status: s.status } : null;
    });
    check(
      "guided_ruh_writes_the_workers_words_into_the_schema",
      stored?.fields?.arsak === "Dårlig sikt bakover" &&
        stored?.fields?.beskrivelse === "Traff autovernet.",
      { stored },
    );
    check(
      "guided_ruh_marks_judgement_values_as_worker_authored",
      stored?.provenance?.arsak?.origin === "WORKER" &&
        stored?.provenance?.tiltak?.origin === "WORKER",
      { provenance: stored?.provenance },
    );
    check("guided_ruh_zero_console_errors", consoleErrors.length === 0, { consoleErrors });

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

if (process.argv[1]?.endsWith("browser-guided-ruh.mjs")) {
  const results = await runBrowserGuidedRuh();
  for (const r of results)
    console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
  const allPassed = results.every((r) => r.passed);
  console.log("\n" + results.length + " checks, all passed:", allPassed);
  process.exit(allPassed ? 0 : 1);
}
