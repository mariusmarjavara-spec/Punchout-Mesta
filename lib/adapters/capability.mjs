/**
 * AdapterCapability model — deliberately named distinct from
 * lib/runtime/types.mjs's CapabilityProvider/CapabilityBinding, which is
 * an unrelated, already-existing concept (compile-time answer to "who
 * fulfills capability X internally, e.g. sja/ruh/machine_check?"). This
 * module answers a different question: "which parts of an ExportEnvelope
 * can THIS adapter accept?" — announced by the adapter, never assumed by
 * the motor.
 *
 * The vocabulary below is a 1:1 mirror of ExportEnvelope's own array
 * fields (see envelope.mjs) — nothing more. Capabilities like "gps",
 * "photos", or "signature" are deliberately NOT included: DayLog
 * (hooks/use-motor-state.ts) has no field for any of them today, so an
 * adapter "supporting" them would be an unfulfillable promise. Extend
 * this list only when the (frozen) motor actually starts producing that
 * data — not before.
 *
 * @typedef {"entries"|"schemas"|"timeEntries"|"machineHours"} AdapterCapability
 */

export const KNOWN_CAPABILITIES = /** @type {const} */ (["entries", "schemas", "timeEntries", "machineHours"]);

/**
 * Which capabilities an envelope actually carries data for (non-empty
 * arrays only). Used to warn/skip when an adapter is asked to handle a
 * capability it never declared, and vice versa.
 *
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {AdapterCapability[]}
 */
export function envelopeCapabilities(envelope) {
  return KNOWN_CAPABILITIES.filter((cap) => Array.isArray(envelope[cap]) && envelope[cap].length > 0);
}

/**
 * Capabilities the envelope carries that the adapter never declared
 * support for — the adapter's transform() is about to silently drop
 * this data unless it accounts for it another way.
 *
 * @param {AdapterCapability[]} adapterCapabilities
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {AdapterCapability[]}
 */
export function uncoveredCapabilities(adapterCapabilities, envelope) {
  const declared = new Set(adapterCapabilities);
  return envelopeCapabilities(envelope).filter((cap) => !declared.has(cap));
}
