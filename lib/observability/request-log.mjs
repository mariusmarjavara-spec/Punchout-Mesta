/**
 * Minimal structured request logging (Execution Sprint 4, Oppgave 3/5).
 * JSON lines to stdout — the standard pattern for a containerized app
 * (Fly.io/Railway capture stdout as logs; no log-shipping infra needed).
 * No PII: method, path, status, duration only.
 *
 * Applied to the admin-authenticated routes (operations-center, runtime/*,
 * devices/*) — where an audit trail of privileged actions has the most
 * security/ops value. Not applied everywhere: /api/export already writes
 * a structured, persisted audit entry per attempt via recordExport()
 * (lib/backend/state.mjs), and /api/health, /api/telemetry, /api/runtime/active
 * are high-volume, non-privileged, unauthenticated-by-design routes where
 * this wrapper would add stdout noise without a matching audit need.
 */

/**
 * @param {{method: string, path: string, status: number, durationMs: number}} entry
 */
export function logRequest({ method, path, status, durationMs }) {
  const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  console.log(
    JSON.stringify({
      level,
      ts: new Date().toISOString(),
      method,
      path,
      status,
      durationMs: Math.round(durationMs),
    })
  );
}

/**
 * Wrap a Next.js route handler so every call is logged with its real
 * response status and duration, without the handler needing to call
 * logRequest() itself.
 *
 * Untyped on purpose (`req`/return are left as `*`): Next.js route
 * handlers take `NextRequest` (a `Request` subtype with extra fields
 * like `.nextUrl`) and this wrapper must pass any of them through
 * unchanged without narrowing the handler's own parameter type.
 * @param {string} path
 * @param {*} handler
 * @returns {*}
 */
export function withRequestLog(path, handler) {
  return async (req) => {
    const startedAt = performance.now();
    let status = 500;
    try {
      const res = await handler(req);
      status = res.status;
      return res;
    } finally {
      logRequest({ method: req.method, path, status, durationMs: performance.now() - startedAt });
    }
  };
}
