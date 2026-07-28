/**
 * DummyAdapter — the minimal valid Adapter, and the deliberate negative
 * case: it declares ZERO capabilities (registry.mjs). Modeled on a real
 * receiver shape (an audit/archive index that only needs to know an
 * export happened, not its content), it reduces every envelope array to
 * a count instead of carrying the records themselves.
 *
 * This is what capability.mjs's uncoveredCapabilities() and the
 * contract tests' "no data loss" check are FOR: for this adapter, data
 * loss is expected and correct, because it never claimed to carry
 * "entries"/"schemas"/"timeEntries"/"machineHours" in the first place.
 * A generic data-loss assertion that doesn't consult declared
 * capabilities would wrongly flag this adapter as broken.
 *
 * Also the reference example for lib/adapters/define-adapter.mjs — the
 * smallest adapter that still satisfies the full contract.
 *
 * @implements {import('./adapter.mjs').Adapter}
 */

import { requireFields, checkSchemaVersion } from "./validation-helpers.mjs";

const MOCK_ENDPOINT = "https://mock.archive-index.example/api/v1/log";
const SUPPORTED_SCHEMA_VERSIONS = ["1.0"];

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').ValidationResult}
 */
function validate(envelope) {
  const errors = [...requireFields(envelope, ["exportId"]), ...checkSchemaVersion(envelope, SUPPORTED_SCHEMA_VERSIONS)];
  return { valid: errors.length === 0, errors };
}

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {{exportId: string, counts: Record<string, number>}}
 */
function transform(envelope) {
  return {
    exportId: envelope.exportId,
    counts: {
      entries: envelope.entries.length,
      schemas: envelope.schemas.length,
      timeEntries: envelope.timeEntries.length,
      machineHours: envelope.machineHours.length,
    },
  };
}

/**
 * @param {{exportId: string, counts: Record<string, number>}} payload
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {Promise<Object>}
 */
async function send(payload, envelope) {
  console.log(`[DummyAdapter] SIMULERT LOG -> ${MOCK_ENDPOINT}`);
  console.log(`[DummyAdapter] payload.exportId=${payload.exportId}`);
  return { status: 204, body: null };
}

/**
 * @param {{status:number, body:null}} rawResponse
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').AdapterResult}
 */
function handleResponse(rawResponse, envelope) {
  const ok = rawResponse.status >= 200 && rawResponse.status < 300;
  return {
    ok,
    stage: "handleResponse",
    adapterName: "dummy",
    exportId: envelope.exportId,
    response: ok ? { logged: true } : undefined,
    error: ok ? undefined : `Archive index responded with status ${rawResponse.status}`,
  };
}

export const DummyAdapter = { name: "dummy", validate, transform, send, handleResponse };
