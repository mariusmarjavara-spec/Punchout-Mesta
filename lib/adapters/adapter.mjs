/**
 * Generic adapter contract. This module knows nothing about any specific
 * receiver (Landax, ISY Road, Elrapp, ERP, Power BI, ...) — that knowledge
 * lives entirely inside each concrete adapter module. runAdapter() is the
 * only orchestration logic, and it is receiver-agnostic by construction:
 * it can drive any object shaped like an Adapter.
 *
 * Framework-free on purpose: no window, no localStorage, no fetch import.
 * Runs identically in a browser, in Node on a server, or in a test runner.
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 *
 * @typedef {Object} AdapterResult
 * @property {boolean} ok
 * @property {string} stage          - last stage reached ("validate"|"transform"|"send"|"handleResponse")
 * @property {string} adapterName
 * @property {string} exportId
 * @property {*} [response]          - normalized response data, present when ok
 * @property {string} [error]        - present when !ok
 *
 * @typedef {Object} Adapter
 * @property {string} name
 * @property {(envelope: import('./envelope.mjs').ExportEnvelope) => ValidationResult} validate
 * @property {(envelope: import('./envelope.mjs').ExportEnvelope) => *} transform
 * @property {(payload: *, envelope: import('./envelope.mjs').ExportEnvelope) => Promise<*>} send
 * @property {(rawResponse: *, envelope: import('./envelope.mjs').ExportEnvelope) => AdapterResult} handleResponse
 */

/**
 * Drive an Adapter through validate -> transform -> send -> handleResponse.
 * Stops at the first failing stage and returns a result describing where
 * it stopped. Never throws — failures are represented in the result.
 *
 * @param {Adapter} adapter
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @param {(msg: string) => void} [log]
 * @returns {Promise<AdapterResult>}
 */
export async function runAdapter(adapter, envelope, log = () => {}) {
  const fail = (stage, error) => {
    log(`[adapter:${adapter.name}] ${stage}() FAILED: ${error}`);
    return { ok: false, stage, adapterName: adapter.name, exportId: envelope.exportId, error };
  };

  log(`[adapter:${adapter.name}] validate()`);
  let validation;
  try {
    validation = adapter.validate(envelope);
  } catch (e) {
    return fail("validate", String(e && e.message || e));
  }
  if (!validation.valid) {
    return fail("validate", validation.errors.join("; "));
  }
  log(`[adapter:${adapter.name}] validate() OK`);

  log(`[adapter:${adapter.name}] transform()`);
  let payload;
  try {
    payload = adapter.transform(envelope);
  } catch (e) {
    return fail("transform", String(e && e.message || e));
  }
  log(`[adapter:${adapter.name}] transform() OK`);

  log(`[adapter:${adapter.name}] send()`);
  let rawResponse;
  try {
    rawResponse = await adapter.send(payload, envelope);
  } catch (e) {
    return fail("send", String(e && e.message || e));
  }
  log(`[adapter:${adapter.name}] send() OK`);

  log(`[adapter:${adapter.name}] handleResponse()`);
  let result;
  try {
    result = adapter.handleResponse(rawResponse, envelope);
  } catch (e) {
    return fail("handleResponse", String(e && e.message || e));
  }
  log(`[adapter:${adapter.name}] handleResponse() -> ok=${result.ok}`);
  return result;
}
