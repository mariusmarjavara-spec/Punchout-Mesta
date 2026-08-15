/**
 * po-crash-telemetry-aggregation: the "external aggregator/pager" half.
 * ClientError telemetry (motor.js's window.onerror/unhandledrejection
 * capture) was already recorded but nothing external was ever notified —
 * an admin had to know to go looking. Opt-in: no-op unless
 * PUNCHOUT_CRASH_WEBHOOK_URL is set, so every existing deployment/test
 * that doesn't set it is completely unaffected. Generic JSON POST (a
 * `text` field alongside structured fields) so it works as-is with
 * common webhook consumers (Slack/Discord incoming webhooks read `text`;
 * anything else can read the structured fields).
 *
 * Same posture as every other telemetry write in this codebase: best-effort,
 * never throws, never blocks the request that triggered it. A slow or
 * unreachable webhook endpoint must never make a real device's telemetry
 * POST hang or fail because of it — bounded by an explicit timeout via
 * AbortController, and deliberately not awaited by the caller.
 */
const WEBHOOK_TIMEOUT_MS = 5000;

/** @param {import('../telemetry/types.mjs').TelemetryEvent} event a single ClientError telemetry event */
export function notifyCrashWebhook(event) {
  const url = process.env.PUNCHOUT_CRASH_WEBHOOK_URL;
  if (!url) return;

  const message = event.data?.message || "unknown error";
  const text = `Punchout crash: ${message} (org: ${event.organizationId})`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      organizationId: event.organizationId,
      occurredAt: event.occurredAt,
      message,
      source: event.data?.source ?? null,
      line: event.data?.line ?? null,
      stack: event.data?.stack ?? null,
    }),
    signal: controller.signal,
  })
    .catch(() => {
      // Best-effort — a failed/unreachable pager must never surface as a
      // failure of the telemetry ingest path itself.
    })
    .finally(() => clearTimeout(timeout));
}
