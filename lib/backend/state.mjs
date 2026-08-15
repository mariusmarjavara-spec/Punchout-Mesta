/**
 * Backend MVP state (Phase 11 Del 1, hardened Phase A). Owns exactly
 * the list Phase 11 Del 1 specified: Identity (device registry + HMAC
 * verification, no login), Organization (which package an org maps
 * to), Runtime Store/Publish/Versioning/Rollback, Export log, Telemetry
 * log. Never touches dayLog, Completion Engine, rules, schemas, or user
 * flow — those stay motor.js's alone.
 *
 * Phase A Del 2: this module is now durable. Every mutation is
 * persisted to a single JSON file (lib/backend/persistence.mjs) via
 * write-temp-then-rename, so a process restart does not lose Runtime
 * history, the export log, the telemetry log, or the device registry.
 * The in-memory Maps/arrays are still the live read path — persistence
 * is a side-channel, exactly like motor.js's own outbox: it never
 * blocks or slows a request, it just means the request's effect
 * survives a restart.
 */
import crypto from "node:crypto";
import { RuntimeStore } from "../runtime/store.mjs";
import { loadOrganizationPackage, resolveOrganizationDir } from "../organization-package/loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";
import { loadPersistedState, persistState } from "./persistence.mjs";
import { notifyCrashWebhook } from "./crash-pager.mjs";

function serializeStore(store) {
  return {
    manifestsByOrg: Object.fromEntries(store.manifestsByOrg),
    runtimesByVersionKey: Object.fromEntries(store.runtimesByVersionKey),
  };
}

function hydrateStore(data) {
  const store = new RuntimeStore();
  if (data) {
    store.manifestsByOrg = new Map(Object.entries(data.manifestsByOrg || {}));
    // "runtimesByChecksum" fallback reads persisted state written before the
    // Del 5/6 fix below — old checksum-keyed data still loads (best-effort;
    // it carries the same rollback-collision bug until re-published).
    store.runtimesByVersionKey = new Map(Object.entries(data.runtimesByVersionKey || data.runtimesByChecksum || {}));
  }
  return store;
}

const persisted = loadPersistedState();

/** @type {Map<string, RuntimeStore>} */
const runtimeStoresByOrg = new Map(
  persisted?.runtimeStores ? Object.entries(persisted.runtimeStores).map(([orgId, data]) => [orgId, hydrateStore(data)]) : []
);

/** @type {Array<{receivedAt: string, exportId: string, organizationId: string, deviceId: string, signatureValid: boolean|null}>} */
export const exportLog = [];
if (persisted?.exportLog) exportLog.push(...persisted.exportLog);

/** @type {import('../telemetry/types.mjs').TelemetryEvent[]} */
export const telemetryLog = [];
if (persisted?.telemetryLog) telemetryLog.push(...persisted.telemetryLog);

/**
 * Device registry — Del 1's "Identity" reduced to its honest scope:
 * which devices are known and what secret they use to sign exports.
 * No more hardcoded DEVICE_SECRETS constant — devices must be
 * registered explicitly (via registerDevice, gated by admin auth in
 * the route layer) before they can export anything.
 *
 * Execution Sprint 1 Oppgave 1: added `status` ("active" | "disabled").
 * A lost or compromised device can now be disabled without deleting its
 * identity — its history in exportLog/telemetryLog stays intact and
 * attributable, only its ability to export going forward is cut off.
 * @type {Map<string, {secret: string, registeredAt: string, registeredBy: string, status: "active"|"disabled", organizationId: string|null}>}
 */
const deviceRegistry = new Map(persisted?.deviceRegistry ? Object.entries(persisted.deviceRegistry) : []);
// Backward-compat: devices persisted before `status` existed default to "active" — never silently disable existing pilot devices on upgrade.
for (const [, v] of deviceRegistry) if (!v.status) v.status = "active";
// Backward-compat, same pattern: devices persisted before `organizationId`
// existed (Phase B finding — see registerDevice below) default to null,
// same as a device that was somehow registered without one going forward.
for (const [, v] of deviceRegistry) if (v.organizationId === undefined) v.organizationId = null;

/**
 * Audit log for device lifecycle events (register/revoke/reactivate) —
 * Oppgave 1's explicit "audit-logg" requirement. Append-only, never
 * mutated, separate from the device registry itself so a device's
 * current status and its full history are never conflated.
 * @type {Array<{deviceId: string, action: "registered"|"revoked"|"reactivated", by: string, at: string}>}
 */
const deviceAuditLog = [];
if (persisted?.deviceAuditLog) deviceAuditLog.push(...persisted.deviceAuditLog);

/**
 * Device sessions — Founder decision 2026-08-14 (runtime confidentiality
 * boundary): full compiled OrganizationRuntime objects are confidential
 * operational configuration and must require provisioned-device
 * authorization; organization identity must be derived from the
 * authenticated device session, not accepted as an arbitrary client-
 * supplied org selector. Issued once at POST /api/devices/provision
 * (alongside the existing punchout_org_id cookie) and persisted the same
 * way deviceRegistry is: the punchout_org_id cookie already carries a
 * 1-year maxAge, meaning "provision once, stay provisioned" is this
 * product's own intended UX — a session that silently reset on every
 * server restart would regress that for every already-provisioned field
 * device.
 * @type {Map<string, {deviceId: string, issuedAt: string}>}
 */
const deviceSessions = new Map(persisted?.deviceSessions ? Object.entries(persisted.deviceSessions) : []);

/**
 * Failed-attempt audit trail for POST /api/devices/provision — PO-04
 * (2026-08-14). Separate from deviceAuditLog (that log is admin-initiated
 * lifecycle actions with a `by` field; this is anonymous, possibly
 * hostile, client-initiated credential guesses, deliberately not
 * conflated with the "who" story deviceAuditLog tells). Only failed
 * attempts are recorded — a successful provision is not a security event
 * worth auditing here, and recording every success would make this log
 * mostly noise for the thing it exists to catch: repeated wrong guesses.
 * @type {Array<{at: string, deviceId: string, ip: string, reason: string}>}
 */
export const provisionFailureLog = [];
if (persisted?.provisionFailureLog) provisionFailureLog.push(...persisted.provisionFailureLog);

function persistNow() {
  persistState({
    runtimeStores: Object.fromEntries([...runtimeStoresByOrg.entries()].map(([orgId, store]) => [orgId, serializeStore(store)])),
    exportLog,
    telemetryLog,
    deviceRegistry: Object.fromEntries(deviceRegistry),
    deviceAuditLog,
    deviceSessions: Object.fromEntries(deviceSessions),
    provisionFailureLog,
    savedAt: new Date().toISOString(),
  });
}

/** Issued at provision time; returns the opaque session token to be set as the punchout_device_session cookie. */
export function issueDeviceSession(deviceId) {
  const token = crypto.randomBytes(32).toString("hex");
  deviceSessions.set(token, { deviceId, issuedAt: new Date().toISOString() });
  persistNow();
  return token;
}

/**
 * Resolves a session token to its organizationId, re-checking the
 * device's live registration/active status on every call (not just at
 * issue time) so a revoked device's existing session stops working
 * immediately — matching /api/export's own "disabled device rejected
 * regardless of signature validity" precedent. Returns null for any
 * invalid, unknown, or no-longer-authorized session, deliberately
 * collapsing "unknown token" and "device revoked since" into the same
 * caller-visible outcome so neither leaks which case occurred.
 * @returns {{deviceId: string, organizationId: string}|null}
 */
export function resolveDeviceSession(sessionToken) {
  if (!sessionToken) return null;
  const session = deviceSessions.get(sessionToken);
  if (!session) return null;
  if (!isDeviceRegistered(session.deviceId) || !isDeviceActive(session.deviceId)) return null;
  const organizationId = getDeviceOrganization(session.deviceId);
  if (!organizationId) return null;
  return { deviceId: session.deviceId, organizationId };
}

function getStore(organizationId) {
  if (!runtimeStoresByOrg.has(organizationId)) runtimeStoresByOrg.set(organizationId, new RuntimeStore());
  return runtimeStoresByOrg.get(organizationId);
}

/**
 * Execution Sprint 1 Oppgave 3 — server-side log hygiene for exportLog/
 * telemetryLog. These are append-only RECEIPT records (the live,
 * "still pending" state lives entirely in each device's own client-side
 * outbox/telemetry log — already capped there, see motor.js
 * TELEMETRY_CAP). A backend receipt is historical the moment it's
 * written, so age-based pruning here never touches "active" data.
 *
 * Deterministic retention: keep every entry from the last `keepDays`
 * days, AND always keep at least the most recent `keepMinimum` entries
 * regardless of age (so a quiet period — e.g. a pilot paused between
 * two organizations — can never prune everything down to nothing).
 * Mutates the array in place (both logs are `export const`, not
 * reassignable) — same array reference callers already hold stays valid.
 * @param {any[]} log
 * @param {string} dateField
 * @param {{keepDays: number, keepMinimum: number}} opts
 */
function pruneLogInPlace(log, dateField, { keepDays, keepMinimum }) {
  if (log.length <= keepMinimum) return;
  const cutoffMs = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  const keepFromIndex = Math.max(0, log.length - keepMinimum); // logs are appended in chronological order
  const kept = log.filter((entry, i) => i >= keepFromIndex || new Date(entry[dateField]).getTime() >= cutoffMs);
  if (kept.length < log.length) {
    log.length = 0;
    log.push(...kept);
  }
}

const EXPORT_LOG_RETENTION = { keepDays: 90, keepMinimum: 200 };
const TELEMETRY_LOG_RETENTION = { keepDays: 90, keepMinimum: 200 };
const PROVISION_FAILURE_LOG_RETENTION = { keepDays: 90, keepMinimum: 200 };
const RUNTIME_HISTORY_RETENTION = { keepVersions: 20, keepDays: 180 };

/** @param {string} organizationSlug e.g. "mesta" -> organizations/mesta */
export function compileFromPackage(organizationSlug) {
  const { input } = loadOrganizationPackage(resolveOrganizationDir(organizationSlug));
  const store = getStore(input.organizationContext.organizationId);
  const history = store.history(input.organizationContext.organizationId);
  const nextVersion = history.length ? Math.max(...history.map((m) => m.runtimeVersion)) + 1 : 1;
  const result = compileRuntime(input, { runtimeVersion: nextVersion });
  return { ...result, organizationId: input.organizationContext.organizationId };
}

export function publish(runtime, publishedBy) {
  const store = getStore(runtime.organizationId);
  const manifest = store.publish(runtime, publishedBy);
  store.pruneHistory(runtime.organizationId, RUNTIME_HISTORY_RETENTION);
  persistNow();
  return manifest;
}

export function getActiveRuntime(organizationId) {
  return getStore(organizationId).getActive(organizationId);
}

export function rollback(organizationId, toVersion) {
  const result = getStore(organizationId).rollback(organizationId, toVersion);
  if (result.ok) persistNow();
  return result;
}

export function getHistory(organizationId) {
  return getStore(organizationId).history(organizationId);
}

/** Records a received export attempt and persists it. Del 2/6. */
export function recordExport(entry) {
  exportLog.push(entry);
  pruneLogInPlace(exportLog, "receivedAt", EXPORT_LOG_RETENTION);
  persistNow();
}

/** PO-04: records a failed POST /api/devices/provision attempt. See provisionFailureLog's own doc comment for why this is separate from deviceAuditLog. */
export function recordProvisionFailure(deviceId, ip, reason) {
  provisionFailureLog.push({ at: new Date().toISOString(), deviceId, ip, reason });
  pruneLogInPlace(provisionFailureLog, "at", PROVISION_FAILURE_LOG_RETENTION);
  persistNow();
}

/**
 * Records telemetry events, deduplicated by event id (Del 3's
 * idempotency requirement — a batch resent after a lost response must
 * not double-count). Events without an id (older motor.js builds) are
 * always accepted, same as before.
 * @param {any[]} events
 * @returns {number} number of events actually stored (after dedup)
 */
export function recordTelemetry(events) {
  const existingIds = new Set(telemetryLog.filter((e) => e.id).map((e) => e.id));
  const newlyStored = [];
  for (const e of events) {
    if (e.id && existingIds.has(e.id)) continue;
    telemetryLog.push(e);
    if (e.id) existingIds.add(e.id);
    newlyStored.push(e);
  }
  if (newlyStored.length > 0) {
    pruneLogInPlace(telemetryLog, "occurredAt", TELEMETRY_LOG_RETENTION);
    persistNow();
    // po-crash-telemetry-aggregation: notify the external pager for every
    // newly-stored crash — only newly-stored, so a resent/idempotent batch
    // (Del 3's own dedupe-by-id case, right above) never re-pages for the
    // same real crash twice.
    for (const e of newlyStored) if (e.type === "ClientError") notifyCrashWebhook(e);
  }
  return newlyStored.length;
}

/**
 * Del 1/6: explicit device registration — a device cannot export until this has been called (gated by admin auth in the route).
 *
 * Operation Punchout Soft Launch, Phase B finding: this never recorded
 * which organization a device belongs to at all — confirmed by reading
 * every field this function wrote. Every "organizationId" appearing
 * elsewhere in the export/telemetry path (motor.js's own emitTelemetry,
 * this route's callers) was a confused stand-in for a different field
 * entirely (the main order number, the worker's userId) rather than a
 * real organization identity, because there was nowhere authoritative to
 * get one from. This is that authoritative source: recorded once, at
 * registration, by the admin who already knows which organization a
 * physical device belongs to — never trusted from the device itself.
 */
export function registerDevice(deviceId, registeredBy, secret, organizationId) {
  const finalSecret = secret || crypto.randomBytes(32).toString("hex");
  deviceRegistry.set(deviceId, { secret: finalSecret, registeredAt: new Date().toISOString(), registeredBy, status: "active", organizationId: organizationId || null });
  deviceAuditLog.push({ deviceId, action: "registered", by: registeredBy, at: new Date().toISOString() });
  persistNow();
  return finalSecret;
}

export function getDeviceSecret(deviceId) {
  return deviceRegistry.get(deviceId)?.secret || null;
}

/** Phase B: the authoritative, server-side answer to "which org is this device?" — set once at registration, never client-supplied. */
export function getDeviceOrganization(deviceId) {
  return deviceRegistry.get(deviceId)?.organizationId || null;
}

export function isDeviceRegistered(deviceId) {
  return deviceRegistry.has(deviceId);
}

/** Oppgave 1: a registered-but-disabled device must be rejected even with a perfectly valid signature. */
export function isDeviceActive(deviceId) {
  return deviceRegistry.get(deviceId)?.status === "active";
}

/** @returns {{ok: boolean, error?: string}} */
export function revokeDevice(deviceId, revokedBy) {
  const device = deviceRegistry.get(deviceId);
  if (!device) return { ok: false, error: "unknown device" };
  if (device.status === "disabled") return { ok: false, error: "device is already disabled" };
  device.status = "disabled";
  deviceAuditLog.push({ deviceId, action: "revoked", by: revokedBy, at: new Date().toISOString() });
  persistNow();
  return { ok: true };
}

/** @returns {{ok: boolean, error?: string}} */
export function reactivateDevice(deviceId, reactivatedBy) {
  const device = deviceRegistry.get(deviceId);
  if (!device) return { ok: false, error: "unknown device" };
  if (device.status === "active") return { ok: false, error: "device is already active" };
  device.status = "active";
  deviceAuditLog.push({ deviceId, action: "reactivated", by: reactivatedBy, at: new Date().toISOString() });
  persistNow();
  return { ok: true };
}

export function listDevices() {
  return [...deviceRegistry.entries()].map(([deviceId, v]) => ({ deviceId, registeredAt: v.registeredAt, registeredBy: v.registeredBy, status: v.status, organizationId: v.organizationId || null }));
}

export function getDeviceAuditLog() {
  return deviceAuditLog;
}

/** Oppgave 2: counts only — /api/health must never leak device ids. */
export function getDeviceCounts() {
  let active = 0, disabled = 0;
  for (const v of deviceRegistry.values()) if (v.status === "active") active++; else disabled++;
  return { total: deviceRegistry.size, active, disabled };
}

/** Oppgave 2/3: sizes only, for /api/health — never the contents. */
export function getLogSizes() {
  return { exportLogEntries: exportLog.length, telemetryLogEntries: telemetryLog.length };
}
