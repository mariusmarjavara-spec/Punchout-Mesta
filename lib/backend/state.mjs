/**
 * Backend MVP (Phase 11 Del 1) — the minimum backend that actually
 * makes the deployment pipeline real. Owns exactly the list Del 1
 * specifies: Identity (device/HMAC verification only, no login),
 * Organization (which package an org maps to), Runtime Store/Publish/
 * Versioning/Rollback, Export log, Telemetry log. Never touches
 * dayLog, Completion Engine, rules, schemas, or user flow — those stay
 * motor.js's alone.
 *
 * In-memory, module-level singleton — "ingen databaseoptimalisering,
 * kun korrekt modell" (Del 6). Persists for the lifetime of the Next.js
 * server process; a restart loses state, same as every RuntimeStore/
 * LocalCache used in every prior phase's dry run. A real deployment
 * would swap this module's internals for a database without touching
 * any route file — the routes only call these functions.
 */
import { RuntimeStore } from "../runtime/store.mjs";
import { loadOrganizationPackage } from "../organization-package/loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";

/** @type {Map<string, RuntimeStore>} */
const runtimeStoresByOrg = new Map();

/** @type {Array<{receivedAt: string, exportId: string, organizationId: string, deviceId: string, signatureValid: boolean|null}>} */
export const exportLog = [];

/** @type {import('../telemetry/types.mjs').TelemetryEvent[]} */
export const telemetryLog = [];

/** Known device HMAC secrets, keyed by deviceId — Del 1's "Identity", deliberately this thin: verifying which device sent an export, not who is logged in. */
export const DEVICE_SECRETS = { dev_pilot_1: "phase11-pilot-hmac-secret" };

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
  return store.publish(runtime, publishedBy);
}

export function getActiveRuntime(organizationId) {
  return getStore(organizationId).getActive(organizationId);
}

export function rollback(organizationId, toVersion) {
  return getStore(organizationId).rollback(organizationId, toVersion);
}

export function getHistory(organizationId) {
  return getStore(organizationId).history(organizationId);
}
