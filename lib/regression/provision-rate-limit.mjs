/**
 * PO-04 (2026-08-14) — permanent regression coverage for
 * lib/backend/provision-rate-limit.mjs. In-process (no HTTP server
 * needed), same posture as backend-auth.mjs's own regression checks.
 */
import {
  checkProvisionRateLimit,
  recordFailedProvisionAttempt,
  clearProvisionRateLimit,
  resetProvisionRateLimitForTests,
} from "../backend/provision-rate-limit.mjs";

export function runProvisionRateLimitChecks() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  resetProvisionRateLimitForTests();
  const key = "203.0.113.1";
  const now = 1_000_000_000_000; // fixed clock, deterministic across runs

  const fresh = checkProvisionRateLimit(key, now);
  check("provision_rate_limit_allows_fresh_key", fresh.allowed === true);

  for (let i = 0; i < 19; i++) recordFailedProvisionAttempt(key, now);
  const stillUnder = checkProvisionRateLimit(key, now);
  check("provision_rate_limit_allows_up_to_threshold", stillUnder.allowed === true, { attempts: 19 });

  recordFailedProvisionAttempt(key, now); // 20th failure — hits MAX_FAILED_ATTEMPTS_PER_WINDOW
  const blocked = checkProvisionRateLimit(key, now);
  check("provision_rate_limit_blocks_after_threshold", blocked.allowed === false && blocked.retryAfterSeconds > 0, blocked);

  const otherKey = "198.51.100.7";
  const otherKeyResult = checkProvisionRateLimit(otherKey, now);
  check("provision_rate_limit_is_per_key_not_global", otherKeyResult.allowed === true);

  const justOutsideWindow = now + 15 * 60 * 1000 + 1000;
  const afterWindow = checkProvisionRateLimit(key, justOutsideWindow);
  check("provision_rate_limit_recovers_after_window_elapses", afterWindow.allowed === true);

  resetProvisionRateLimitForTests();
  for (let i = 0; i < 25; i++) recordFailedProvisionAttempt(key, now);
  clearProvisionRateLimit(key);
  const afterClear = checkProvisionRateLimit(key, now);
  check("provision_rate_limit_clears_on_success", afterClear.allowed === true);

  resetProvisionRateLimitForTests();
  return results;
}
