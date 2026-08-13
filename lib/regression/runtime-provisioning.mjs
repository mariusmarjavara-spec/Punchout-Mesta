/**
 * Operation Punchout Soft Launch, Phase B verification — permanent
 * regression proof for the real vertical path this mission named its
 * highest-priority objective: Organization Package -> Compile -> Publish
 * Runtime -> Provision Device -> Field Browser Retrieves Correct Runtime.
 *
 * Confirmed BEFORE this fix existed (manually, this session, against a
 * real running server over real HTTP): app/layout.tsx only ever served a
 * single static, organization-agnostic public/punchout-config.js,
 * regardless of what was published via /api/runtime/publish or which
 * device asked — the entire Runtime system was never consumed by a real
 * browser at all. This script is the permanent guard against that gap
 * recurring: it spawns a real `next dev` process (same "spawn a real
 * process" philosophy as security-audit.mjs), and only ever inspects raw
 * HTML/HTTP responses — it never touches window.PUNCHOUT_RUNTIME or
 * window.PUNCHOUT_CONFIG directly, only what a real browser would fetch.
 *
 * Slower than the pure-function suite (server boot ~10-20s), same reason
 * as security-audit.mjs — intentionally NOT wired into lib/regression/run.mjs,
 * run standalone: node lib/regression/runtime-provisioning.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3998;
const ADMIN_TOKEN = "runtime_provisioning_test_token";
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

function extractCookie(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(name + "=([^;]+)"));
  return match ? name + "=" + match[1] : null;
}

async function fetchRootAs(cookie) {
  const res = await fetch(BASE_URL + "/", cookie ? { headers: { Cookie: cookie } } : {});
  return res.text();
}

/**
 * Next.js transmits beforeInteractive inline Script content as a
 * JSON-string-encoded payload inside its own RSC streaming push arrays
 * (self.__next_s.push([...])) — the standard, documented mechanism for
 * this Script strategy, not something specific to this app. The raw HTML
 * this check fetches therefore contains backslash-escaped quotes
 * (\"organizationId\":\"nordhavn\") rather than the literal JSON text a
 * constructed <script> tag would show once Next's own client runtime
 * unescapes and injects it at hydration time. Checking for either form
 * keeps this assertion correct without reimplementing Next's own
 * unescaping logic. NOTE: this proves the correct data reaches the wire
 * in the correct per-device response — it does not prove a real browser's
 * JS engine executes the reconstructed script correctly, since no real
 * browser is available in this environment (see mission Section 33: real
 * browser verification remains a separate, UNVERIFIED proof level).
 */
function htmlContains(html, literalSubstring) {
  return html.includes(literalSubstring) || html.includes(literalSubstring.replace(/"/g, '\\"'));
}

export async function runRuntimeProvisioningCheck() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-runtime-provisioning-"));
  const env = { ...process.env, PUNCHOUT_DATA_DIR: dataDir, PUNCHOUT_ADMIN_TOKEN: ADMIN_TOKEN, PORT: String(PORT) };

  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)], {
    env,
    cwd: process.cwd(),
    stdio: "pipe",
  });

  try {
    const up = await waitForServer();
    check("runtime_provisioning_server_starts", up, { message: "dev server did not respond on /api/health within timeout" });
    if (!up) return results;

    const pubA = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationSlug: "nordhavn", publishedBy: "provisioning_check", approved: true }) })).json();
    const pubB = await (await fetch(BASE_URL + "/api/runtime/publish", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ organizationSlug: "banenord", publishedBy: "provisioning_check", approved: true }) })).json();
    check("runtime_provisioning_both_orgs_published", pubA.ok === true && pubB.ok === true, { a: pubA.manifest?.organizationId, b: pubB.manifest?.organizationId });

    const deviceA = "provcheck_A_" + Date.now();
    const deviceB = "provcheck_B_" + Date.now();
    const regA = await (await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId: deviceA, organizationId: "nordhavn" }) })).json();
    const regB = await (await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId: deviceB, organizationId: "banenord" }) })).json();

    const provResA = await fetch(BASE_URL + "/api/devices/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceA, secret: regA.secret }) });
    const provBodyA = await provResA.json();
    const cookieA = extractCookie(provResA.headers.get("set-cookie"), "punchout_org_id");
    check("runtime_provisioning_device_a_self_provisions", provResA.status === 200 && provBodyA.organizationId === "nordhavn" && !!cookieA, provBodyA);

    const provResB = await fetch(BASE_URL + "/api/devices/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceB, secret: regB.secret }) });
    const provBodyB = await provResB.json();
    const cookieB = extractCookie(provResB.headers.get("set-cookie"), "punchout_org_id");
    check("runtime_provisioning_device_b_self_provisions", provResB.status === 200 && provBodyB.organizationId === "banenord", provBodyB);

    const wrongSecretRes = await fetch(BASE_URL + "/api/devices/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceA, secret: "not-the-real-secret" }) });
    check("runtime_provisioning_wrong_secret_rejected", wrongSecretRes.status === 401);

    const htmlA = await fetchRootAs(cookieA);
    const htmlB = await fetchRootAs(cookieB);
    check("runtime_provisioning_device_a_gets_own_org_runtime", htmlContains(htmlA, '"organizationId":"nordhavn"') && htmlA.includes(pubA.manifest.checksum));
    check("runtime_provisioning_device_a_no_cross_contamination", !htmlContains(htmlA, '"organizationId":"banenord"'));
    check("runtime_provisioning_device_b_gets_own_org_runtime", htmlContains(htmlB, '"organizationId":"banenord"') && htmlB.includes(pubB.manifest.checksum));
    check("runtime_provisioning_device_b_no_cross_contamination", !htmlContains(htmlB, '"organizationId":"nordhavn"'));

    const htmlUnprovisioned = await fetchRootAs(null);
    check("runtime_provisioning_unprovisioned_falls_back_to_static_config", htmlUnprovisioned.includes("punchout-config.js") && !htmlUnprovisioned.includes("PUNCHOUT_RUNTIME"));

    const deviceC = "provcheck_C_" + Date.now();
    const regC = await (await fetch(BASE_URL + "/api/devices/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ deviceId: deviceC, organizationId: "org_never_published_" + Date.now() }) })).json();
    const provResC = await fetch(BASE_URL + "/api/devices/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: deviceC, secret: regC.secret }) });
    const cookieC = extractCookie(provResC.headers.get("set-cookie"), "punchout_org_id");
    const htmlC = await fetchRootAs(cookieC);
    check("runtime_provisioning_unpublished_org_falls_back_safely", provResC.status === 200 && htmlC.includes("punchout-config.js") && !htmlC.includes("PUNCHOUT_RUNTIME"));
  } finally {
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }

  return results;
}

// CLI entry — always invoked directly (node lib/regression/runtime-provisioning.mjs), same convention as security-audit.mjs.
const results = await runRuntimeProvisioningCheck();
for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
const allPassed = results.length > 0 && results.every((r) => r.passed);
console.log("\n" + results.length + " checks, all passed:", allPassed);
process.exit(allPassed ? 0 : 1);
