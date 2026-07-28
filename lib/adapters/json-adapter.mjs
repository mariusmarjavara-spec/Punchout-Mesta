/**
 * JsonAdapter — the identity baseline. Declares all four capabilities
 * (registry.mjs) and maps the envelope near-losslessly (rename only, no
 * restructuring) into a generic JSON ingest shape. Its purpose in the
 * Golden Test Suite is to be the adapter every "no data loss" contract
 * test can trust completely: if THIS adapter ever drops a record, the
 * bug is in the shared pipeline (adapter.mjs/envelope.mjs), not in a
 * receiver-specific mapping.
 *
 * send() performs NO real network call — mock only, same posture as
 * landax-adapter.mjs.
 *
 * @implements {import('./adapter.mjs').Adapter}
 */

import { requireFields, checkSchemaVersion } from "./validation-helpers.mjs";

const MOCK_ENDPOINT = "https://mock.json-export.example/api/v1/ingest";
const SUPPORTED_SCHEMA_VERSIONS = ["1.0"];

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').ValidationResult}
 */
function validate(envelope) {
  const errors = [...requireFields(envelope, ["exportId", "organizationId"]), ...checkSchemaVersion(envelope, SUPPORTED_SCHEMA_VERSIONS)];
  return { valid: errors.length === 0, errors };
}

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {Object}
 */
function transform(envelope) {
  return {
    exportId: envelope.exportId,
    organizationId: envelope.organizationId,
    userId: envelope.userId,
    day: envelope.dayId,
    shift: envelope.shift,
    events: envelope.entries,
    forms: envelope.schemas,
    time: envelope.timeEntries,
    machines: envelope.machineHours,
    metadata: envelope.metadata,
  };
}

/**
 * @param {Object} payload
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {Promise<Object>}
 */
async function send(payload, envelope) {
  console.log(`[JsonAdapter] SIMULERT POST -> ${MOCK_ENDPOINT}`);
  console.log(`[JsonAdapter] payload.exportId=${payload.exportId} events=${payload.events.length} forms=${payload.forms.length}`);
  return { status: 200, body: { ingested: true, exportId: envelope.exportId } };
}

/**
 * @param {{status:number, body:{ingested:boolean, exportId:string}}} rawResponse
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').AdapterResult}
 */
function handleResponse(rawResponse, envelope) {
  const ok = rawResponse.status >= 200 && rawResponse.status < 300 && rawResponse.body.ingested === true;
  return {
    ok,
    stage: "handleResponse",
    adapterName: "json",
    exportId: envelope.exportId,
    response: ok ? rawResponse.body : undefined,
    error: ok ? undefined : "JSON receiver did not confirm ingestion",
  };
}

export const JsonAdapter = { name: "json", validate, transform, send, handleResponse };
