/**
 * Local-first UX-observation telemetry (Execution Sprint 3, Oppgave 7).
 * Parallel to motor.js's own telemetry (STORAGE_KEY_TELEMETRY) — a
 * separate storage key and a separate flush loop, because motor.js's
 * emitTelemetry() is private to that frozen file and not exposed on
 * window.Motor, so this layer cannot call into it.
 *
 * Anonymous by design: events carry no userId/deviceId — see
 * lib/telemetry/types.mjs's UxTelemetryEvent. This is for product
 * improvement (which UX gaps get hit, how often), never per-user
 * tracking, per the brief ("ikke til overvåkning av enkeltbrukere").
 *
 * Reuses the existing /api/telemetry endpoint (does no schema
 * validation of event `type`, dedupes by `id`) — no backend change.
 */

const STORAGE_KEY = "punchout_ux_telemetry";
const FLUSH_ENDPOINT = "/api/telemetry";
const FLUSH_INTERVAL_MS = 60000;

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function load() {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(events) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // storage full/unavailable — drop silently; this is best-effort observability, not business data.
  }
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "ux_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

/**
 * @param {import('./types.mjs').UxTelemetryEventType} type
 * @param {Record<string, unknown>} [data]
 */
export function logUxEvent(type, data = {}) {
  const events = load();
  events.push({ id: makeId(), type, occurredAt: new Date().toISOString(), data, flushed: false });
  save(events);
}

/** @returns {import('./types.mjs').UxTelemetryEvent[]} */
export function getUxTelemetryLog() {
  return load();
}

async function flushUxTelemetry() {
  if (!hasStorage() || typeof fetch === "undefined") return;
  const events = load();
  const unflushed = events.filter((e) => !e.flushed);
  if (unflushed.length === 0) return;
  try {
    const res = await fetch(FLUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: unflushed }),
    });
    if (res.ok) {
      const flushedIds = new Set(unflushed.map((e) => e.id));
      save(events.map((e) => (flushedIds.has(e.id) ? { ...e, flushed: true } : e)));
    }
  } catch {
    // offline or backend unreachable — leave unflushed, next interval retries. Local-first: nothing is lost.
  }
}

let flushTimer = null;

/**
 * Start the periodic flush loop (mirrors motor.js's own telemetry flush
 * pattern: interval + online event). Safe to call more than once — only
 * the first call actually starts the interval.
 */
export function initUxTelemetrySync() {
  if (!hasStorage() || flushTimer) return;
  flushTimer = setInterval(flushUxTelemetry, FLUSH_INTERVAL_MS);
  window.addEventListener("online", flushUxTelemetry);
  flushUxTelemetry();
}
