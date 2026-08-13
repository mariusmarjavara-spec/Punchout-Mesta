/**
 * Execution Sprint 4, Oppgave 3 — permanent regression proof for the
 * operations-center auth fix (and every other admin route), run against
 * a REAL running server over real HTTP, not a mocked request object.
 * lib/regression/backend-auth.mjs already proves verifyAdminAuth() itself
 * is correct in isolation; this proves every admin ROUTE actually calls
 * it — the exact class of gap that let /api/operations-center ship with
 * no auth check at all despite the auth mechanism being fine.
 *
 * Spawns `next dev` as a real child process (isolated PUNCHOUT_DATA_DIR,
 * isolated port, isolated PUNCHOUT_ADMIN_TOKEN) — same "spawn a real
 * process" philosophy as backend-persistence.mjs, extended from a
 * process restart to a real HTTP surface. Slower than the pure-function
 * suite (server boot ~10-20s), so this is intentionally NOT wired into
 * lib/regression/run.mjs — run standalone: node lib/regression/security-audit.mjs
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3999;
const ADMIN_TOKEN = "security_audit_test_token";
const BASE_URL = `http://localhost:${PORT}`;

const ADMIN_ROUTES = [
  { method: "GET", path: "/api/operations-center?org=mesta" },
  { method: "GET", path: "/api/runtime/history?org=mesta" },
  { method: "GET", path: "/api/devices/audit" },
  { method: "GET", path: "/api/devices/register" },
  // Dogfooding Punchout audit finding #1: these two had NO auth check at
  // all — the exact class of gap this file's own header comment says it
  // exists to prevent recurring, yet it recurred here because these two
  // routes were never added to this list. Added alongside the actual
  // route-level fix (app/api/telemetry/route.ts, app/api/export/route.ts),
  // not as a substitute for it.
  { method: "GET", path: "/api/telemetry?org=mesta" },
  { method: "GET", path: "/api/export" },
];

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

export async function runSecurityAudit() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-security-audit-"));
  const env = { ...process.env, PUNCHOUT_DATA_DIR: dataDir, PUNCHOUT_ADMIN_TOKEN: ADMIN_TOKEN, PORT: String(PORT) };

  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(PORT)], {
    env,
    cwd: process.cwd(),
    stdio: "pipe",
  });

  try {
    const up = await waitForServer();
    check("security_audit_server_starts", up, { message: "dev server did not respond on /api/health within timeout" });
    if (!up) return results;

    for (const route of ADMIN_ROUTES) {
      const withoutToken = await fetch(BASE_URL + route.path, { method: route.method });
      check(
        `security_audit_${route.path.split("?")[0].replace(/\W+/g, "_")}_rejects_without_token`,
        withoutToken.status === 401,
        { path: route.path, expectedStatus: 401, actualStatus: withoutToken.status }
      );
    }

    const withToken = await fetch(`${BASE_URL}/api/operations-center?org=mesta`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    check("security_audit_operations_center_accepts_valid_token", withToken.status === 200, {
      expectedStatus: 200,
      actualStatus: withToken.status,
    });

    const health = await fetch(`${BASE_URL}/api/health`);
    check("security_audit_health_remains_unauthenticated", health.status === 200, {
      message: "public health check must never require a token",
      actualStatus: health.status,
    });
  } finally {
    server.kill();
    rmSync(dataDir, { recursive: true, force: true });
  }

  return results;
}

// CLI entry — always invoked directly (node lib/regression/security-audit.mjs), same convention as cross-organization.mjs.
const results = await runSecurityAudit();
for (const r of results) console.log((r.passed ? "PASS" : "FAIL") + " — " + r.id + (r.error ? " (" + r.error + ")" : ""));
const allPassed = results.length > 0 && results.every((r) => r.passed);
console.log("\n" + results.length + " checks, all passed:", allPassed);
process.exit(allPassed ? 0 : 1);
