/**
 * Observation layer. Every input source (text, voice transcript, OCR,
 * import, adapter data) normalizes to one Observation before anything
 * else touches it. Extractors are the only thing allowed to read
 * Observation.raw — everything downstream (rules) reads Facts only.
 *
 * @typedef {Object} Observation
 * @property {string} id
 * @property {"text"|"voice"|"ocr"|"import"|"adapter"} source
 * @property {string} raw
 * @property {string} capturedAt
 * @property {number} [sourceEntryIndex]
 *
 * @typedef {Object} Extractor
 *   Swappable unit: given an Observation (+ static reference data an
 *   extractor needs, e.g. known machine types), produce zero or more
 *   Facts. Replacing one extractor never requires touching another, or
 *   the rule engine.
 * @property {string} key
 * @property {(observation: Observation, refData: Record<string, unknown>) => import('../engine/types.mjs').Fact[]} extract
 */

export {};
