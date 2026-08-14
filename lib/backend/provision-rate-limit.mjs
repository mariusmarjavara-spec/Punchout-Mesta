/**
 * Independent review finding PO-04 (2026-08-14): POST /api/devices/provision
 * is intentionally public (a field device has no admin token to present —
 * its credential IS the deviceId+secret pair), but had no throttling or
 * failed-attempt telemetry at all. Device secrets are high entropy, so this
 * isn't an immediate practical bypass, but a public credential-check route
 * should still slow down and record repeated guessing before wider
 * exposure. Keeps the route's product model unchanged (still no admin
 * gate) — this only throttles and records, never blocks a device that
 * actually knows its own secret.
 *
 * Deliberately counts only FAILED attempts, keyed by client IP, in a
 * sliding window: a legitimate device that knows its real secret can
 * retry as often as it needs (e.g. a flaky network), and one IP behind a
 * NAT provisioning many real devices in quick succession is never
 * throttled just for volume — only repeated wrong guesses from the same
 * source count against the limit, which is the actual brute-force
 * signal.
 *
 * In-memory, not persisted — same posture as auth.mjs's ADMIN_TOKENS: a
 * restart resetting the window is an acceptable cost for a P3 hardening
 * measure, not a security requirement here.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS_PER_WINDOW = 20;

/** @type {Map<string, number[]>} key -> timestamps (ms) of recent FAILED attempts */
const failedAttemptsByKey = new Map();

function pruneOld(timestamps, now) {
  return timestamps.filter((t) => now - t < WINDOW_MS);
}

/**
 * @param {string} key usually the client IP
 * @param {number} [now]
 * @returns {{allowed: boolean, retryAfterSeconds?: number}}
 */
export function checkProvisionRateLimit(key, now = Date.now()) {
  const recent = pruneOld(failedAttemptsByKey.get(key) || [], now);
  if (recent.length >= MAX_FAILED_ATTEMPTS_PER_WINDOW) {
    const oldestInWindow = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - oldestInWindow)) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
}

/** Call only on a FAILED provision attempt (unknown device, disabled, wrong secret, missing org). */
export function recordFailedProvisionAttempt(key, now = Date.now()) {
  const recent = pruneOld(failedAttemptsByKey.get(key) || [], now);
  recent.push(now);
  failedAttemptsByKey.set(key, recent);
}

/** A successful provision clears this key's failure history — no reason to keep counting past guesses once the real credential was proven. */
export function clearProvisionRateLimit(key) {
  failedAttemptsByKey.delete(key);
}

/** Test-only reset hook, mirroring auth.mjs's own regression-test posture (no separate test-double module for a Map this simple). */
export function resetProvisionRateLimitForTests() {
  failedAttemptsByKey.clear();
}
