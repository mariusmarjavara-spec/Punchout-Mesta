/**
 * Declarative Schema Format — the on-the-wire document shape an external
 * system (Landax, or any future publisher) submits, and the two pure
 * functions that turn it into a trustworthy SchemaRegistryEntry.
 *
 * Format choice: JSON, not YAML/XML/TXT.
 *  - Determinism: JSON parsing has no implicit-typing ambiguity (YAML's
 *    "Norway problem" — bare `no`/`off` parsing as boolean — is exactly
 *    the kind of parser-dependent surprise this project's #1 rule
 *    ("same input -> same output") cannot tolerate in something as
 *    consequential as a safety-schema definition).
 *  - Validation: JSON Schema is a mature, off-the-shelf structural
 *    validator if one is ever needed beyond parseSchemaDocument() below.
 *  - Zero new dependency: JSON.parse is native in every runtime already
 *    in this stack (motor.js, adapters, sync — everything already
 *    speaks JSON). YAML/XML would each need a parser dependency added
 *    to an offline-first mobile app for a format that buys nothing here.
 *  - Readability loses to YAML, but these documents are expected to be
 *    exported programmatically by source systems, not hand-authored —
 *    machine-correctness matters more than editing ergonomics.
 *  - XML rejected: needs XSD for validation, verbose, no native parser
 *    without a dependency.
 *  - TXT rejected: no structure; would require inventing a bespoke
 *    parser, pure liability.
 */

/**
 * Fields whose autofill is locked off by the platform no matter what an
 * organization's submission declares. Mirrors motor.js's NEVER_AUTO_FILL
 * list — same boundary, now also enforced at the point schema documents
 * enter the registry, not only inside the running engine.
 */
export const LOCKED_NON_AUTOFILL_FIELDS = ["konsekvens", "tiltak", "forslag_tiltak", "arsak", "vurdering"];

/**
 * Structural validation only — does the document have what a
 * SchemaRegistryEntry needs, and are section->field references sound?
 * Does not touch autofill policy; that's sanitizeSchemaDocument()'s job.
 *
 * @param {*} raw
 * @returns {{valid: boolean, errors: string[], document: import('./schema-registry.mjs').SchemaRegistryEntry|null}}
 */
export function parseSchemaDocument(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["document is not an object"], document: null };
  }
  for (const key of ["schemaType", "version", "effectiveFrom", "fields"]) {
    if (raw[key] === undefined) errors.push("missing required field: " + key);
  }
  if (raw.fields && typeof raw.fields !== "object") {
    errors.push("fields must be an object");
  }
  for (const section of raw.sections || []) {
    for (const fieldKey of section.fields || []) {
      if (!raw.fields || !raw.fields[fieldKey]) {
        errors.push('section "' + section.id + '" references unknown field "' + fieldKey + '"');
      }
    }
  }
  return { valid: errors.length === 0, errors, document: errors.length === 0 ? raw : null };
}

/**
 * Enforce LOCKED_NON_AUTOFILL_FIELDS regardless of what the document
 * declared. Pure — returns a new document, never mutates the input, and
 * reports which fields it had to override so the override is auditable
 * rather than silent.
 *
 * @param {import('./schema-registry.mjs').SchemaRegistryEntry} document
 * @returns {{document: import('./schema-registry.mjs').SchemaRegistryEntry, overrides: string[]}}
 */
export function sanitizeSchemaDocument(document) {
  const overrides = [];
  const fields = {};
  for (const [key, def] of Object.entries(document.fields)) {
    if (LOCKED_NON_AUTOFILL_FIELDS.includes(key) && def.autofillable !== false) {
      overrides.push(key);
      fields[key] = { ...def, autofillable: false };
    } else {
      fields[key] = def;
    }
  }
  return { document: { ...document, fields }, overrides };
}
