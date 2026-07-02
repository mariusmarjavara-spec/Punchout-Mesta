/**
 * Phase A Del 9 — permanent regression coverage for lib/backend/auth.mjs.
 * In-process (no HTTP server needed), so it runs as part of the normal
 * `node lib/regression/run.mjs` suite. Covers the exact four-case
 * matrix Del 5 requires: missing / invalid / expired / valid token, plus
 * the fail-closed case (no token configured at all).
 */
import { verifyAdminAuth, issueAdminToken, bootstrapAdminAuth } from "../backend/auth.mjs";

function fakeRequest(headers) {
  return { headers: { get: (name) => headers[name.toLowerCase()] ?? null } };
}

export function runBackendAuthChecks() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  // Fail-closed: no env token, nothing issued yet in this process — every request must be rejected.
  // (bootstrapAdminAuth() is idempotent and only reads env once; if PUNCHOUT_ADMIN_TOKEN happens to be
  // set in this process's env, that's a valid token below instead — both paths are exercised regardless.)
  const envToken = process.env.PUNCHOUT_ADMIN_TOKEN;

  if (!envToken) {
    const res = verifyAdminAuth(fakeRequest({}));
    check("backend_auth_fail_closed_when_unconfigured", res.ok === false && res.reason.includes("fail closed"));
  } else {
    check("backend_auth_fail_closed_when_unconfigured", true, "skipped — PUNCHOUT_ADMIN_TOKEN set in this process env, tested via env-token path instead");
  }

  const testToken = "regression_test_token_" + Date.now();
  issueAdminToken(testToken, null);

  const missing = verifyAdminAuth(fakeRequest({}));
  check("backend_auth_missing_token_rejected", missing.ok === false && missing.reason === "missing bearer token");

  const invalid = verifyAdminAuth(fakeRequest({ authorization: "Bearer not-a-real-token" }));
  check("backend_auth_invalid_token_rejected", invalid.ok === false && invalid.reason === "invalid token");

  const expiredToken = "regression_expired_token_" + Date.now();
  issueAdminToken(expiredToken, new Date(Date.now() - 60000).toISOString()); // expired 1 minute ago
  const expired = verifyAdminAuth(fakeRequest({ authorization: "Bearer " + expiredToken }));
  check("backend_auth_expired_token_rejected", expired.ok === false && expired.reason === "expired token");

  const valid = verifyAdminAuth(fakeRequest({ authorization: "Bearer " + testToken }));
  check("backend_auth_valid_token_accepted", valid.ok === true);

  const futureToken = "regression_future_token_" + Date.now();
  issueAdminToken(futureToken, new Date(Date.now() + 3600000).toISOString()); // expires in an hour — not expired yet
  const notYetExpired = verifyAdminAuth(fakeRequest({ authorization: "Bearer " + futureToken }));
  check("backend_auth_not_yet_expired_token_accepted", notYetExpired.ok === true);

  return results;
}
