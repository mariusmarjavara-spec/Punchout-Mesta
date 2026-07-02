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
import { loadOrganizationPackage } from "../organization-package/loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";
import { loadPersistedState, persistState } from "./persistence.mjs";

function serializeStore(store) {
  return {
    manifestsByOrg: Object.fromEntries(store.manifestsByOrg),
    runtimesByChecksum: Object.fromEntries(store.runtimesByChecksum),
  };
}

function hydrateStore(data) {
  const store = new RuntimeStore();
  if (data) {
    store.manifestsByOrg = new Map(Object.entries(data.manifestsByOrg || {}));
    store.runtimesByChecksum = new Map(Object.entries(data.runtimesByChecksum || {}));
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
 * @type {Map<string, {secret: string, registeredAt: string, registeredBy: string}>}
 */
const deviceRegistry = new Map(persisted?.deviceRegistry ? Object.entries(persisted.deviceRegistry) : []);

function persistNow() {
  persistState({
    runtimeStores: Object.fromEntries([...runtimeStoresByOrg.entries()].map(([orgId, store]) => [orgId, serializeStore(store)])),
    exportLog,
    telemetryLog,
    deviceRegistry: Object.fromEntries(deviceRegistry),
    savedAt: new Date().toISOString(),
  });
}

function getStore(organizationId) {
  if (!runtimeStoresByOrg.has(organizationId)) runtimeStoresByOrg.set(organizationId, new RuntimeStore());
  return runtimeStoresByOrg.get(organizationId);
}

/** @param {string} organizationSlug e.g. "mesta" -> organizations/mesta */
export function compileFromPackage(organizationSlug) {
  const { input } = loadOrganizationPackage("./organizations/" + organizationSlug);
  const store = getStore(input.organizationContext.organizationId);
  const history = store.history(input.organizationContext.organizationId);
  const nextVersion = history.length ? Math.max(...history.map((m) => m.runtimeVersion)) + 1 : 1;
  const result = compileRuntime(input, { runtimeVersion: nextVersion });
  return { ...result, organizationId: input.organizationContext.organizationId };
}

export function publish(runtime, publishedBy) {
  const store = getStore(runtime.organizationId);
  const manifest = store.publish(runtime, publishedBy);
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
  let stored = 0;
  for (const e of events) {
    if (e.id && existingIds.has(e.id)) continue;
    telemetryLog.push(e);
    if (e.id) existingIds.add(e.id);
    stored++;
  }
  if (stored > 0) persistNow();
  return stored;
}

/** Del 1/6: explicit device registration — a device cannot export until this has been called (gated by admin auth in the route). */
export function registerDevice(deviceId, registeredBy, secret) {
  const finalSecret = secret || crypto.randomBytes(32).toString("hex");
  deviceRegistry.set(deviceId, { secret: finalSecret, registeredAt: new Date().toISOString(), registeredBy });
  persistNow();
  return finalSecret;
}

export function getDeviceSecret(deviceId) {
  return deviceRegistry.get(deviceId)?.secret || null;
}

export function isDeviceRegistered(deviceId) {
  return deviceRegistry.has(deviceId);
}

export function listDevices() {
  return [...deviceRegistry.entries()].map(([deviceId, v]) => ({ deviceId, registeredAt: v.registeredAt, registeredBy: v.registeredBy }));
}
