/**
 * Phase A Del 1/5 — minimum authentication for Runtime administration
 * endpoints (compile, dry-run, publish, rollback). Deliberately thin:
 * one bearer token, not a login system — same honest-scope posture as
 * Del 1's export "Identity" (verifying a caller is allowed, not who a
 * human is).
 *
 * Fail closed: if no admin token is configured anywhere (env var unset
 * AND nothing issued at runtime), every request is rejected. There is
 * no "auth optional" fallback — a missing secret must never widen
 * access.
 */

/** @type {Map<string, {expiresAt: string|null}>} */
const ADMIN_TOKENS = new Map();

let bootstrapped = false;

/** Reads PUNCHOUT_ADMIN_TOKEN from the environment. Safe to call more than once (idempotent). */
export function bootstrapAdminAuth() {
  if (bootstrapped) return;
  bootstrapped = true;
  const envToken = process.env.PUNCHOUT_ADMIN_TOKEN;
  if (envToken) ADMIN_TOKENS.set(envToken, { expiresAt: null });
}

/** Test/ops hook to issue an additional token, optionally with an expiry — used by regression to prove expired-token rejection. */
export function issueAdminToken(token, expiresAt = null) {
  ADMIN_TOKENS.set(token, { expiresAt });
}

export function revokeAdminToken(token) {
  ADMIN_TOKENS.delete(token);
}

/** @param {Request} req @returns {{ok: true}|{ok: false, reason: string}} */
export function verifyAdminAuth(req) {
  bootstrapAdminAuth();
  if (ADMIN_TOKENS.size === 0) {
    return { ok: false, reason: "no admin token configured on the server — fail closed" };
  }
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return { ok: false, reason: "missing bearer token" };
  const token = match[1];
  const record = ADMIN_TOKENS.get(token);
  if (!record) return { ok: false, reason: "invalid token" };
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "expired token" };
  }
  return { ok: true };
}
