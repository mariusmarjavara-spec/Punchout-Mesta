/**
 * Shared validate() building blocks. Extracted after failure testing
 * (Adapter Platform DEL 8) found that only landax-adapter.mjs checked
 * schemaVersion at all — csv/json/dummy silently accepted ANY
 * schemaVersion, meaning "wrong Runtime-version" was untested and
 * unenforced for 3 of 4 adapters. Every adapter's validate() now builds
 * its ValidationError[] from these two functions instead of re-deriving
 * the same checks with different bugs.
 */

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @param {string[]} fields
 * @returns {import('./adapter.mjs').ValidationError[]}
 */
export function requireFields(envelope, fields) {
  return fields.filter((field) => !envelope[field]).map((field) => ({ code: "missing_field", field, message: `${field} is required` }));
}

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @param {string[]} supportedVersions
 * @returns {import('./adapter.mjs').ValidationError[]}
 */
export function checkSchemaVersion(envelope, supportedVersions) {
  if (supportedVersions.includes(envelope.schemaVersion)) return [];
  return [
    {
      code: "unsupported_schema_version",
      field: "schemaVersion",
      message: `unsupported schemaVersion: ${envelope.schemaVersion} (supports: ${supportedVersions.join(", ")})`,
    },
  ];
}
