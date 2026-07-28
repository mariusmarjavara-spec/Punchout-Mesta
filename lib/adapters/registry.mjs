/**
 * Adapter Registry — data, not switch statements. Every receiver a
 * Runtime can be exported to is one entry here. Callers look adapters up
 * by name (getAdapter) or enumerate all of them (listAdapters); nothing
 * outside this file branches on adapter identity.
 *
 * @typedef {Object} AdapterDescriptor
 * @property {string} name                                    - unique registry key, matches adapter.name
 * @property {string} version                                 - adapter's own version, independent of ExportEnvelope's schemaVersion
 * @property {import('./capability.mjs').AdapterCapability[]} capabilities
 * @property {string[]} supportedSchemaVersions                - ExportEnvelope.schemaVersion values this adapter accepts
 * @property {"json"|"csv"|"custom"} exportFormat
 * @property {"none"|"hmac"|"api-key"|"oauth2"} authMethod
 * @property {"reference"|"stable"|"experimental"} status
 * @property {import('./adapter.mjs').Adapter} adapter
 * @property {(payload: *) => Partial<Record<import('./capability.mjs').AdapterCapability, number>>} [countRecords]
 *   Optional: how many records of each declared capability survived
 *   transform(), read back out of this adapter's OWN payload shape.
 *   Payload shapes are adapter-specific by design, so there is no
 *   generic way to count them — contract testing (lib/regression/
 *   adapter-contract.mjs) relies on each adapter to report its own
 *   counts. Adapters that never claim per-record fidelity (e.g.
 *   DummyAdapter) omit this or return {}.
 */

/** @type {Map<string, AdapterDescriptor>} */
const registry = new Map();

/** @param {AdapterDescriptor} descriptor */
export function registerAdapter(descriptor) {
  if (!descriptor || !descriptor.name) throw new Error("registerAdapter: descriptor.name is required");
  if (!descriptor.adapter || typeof descriptor.adapter.transform !== "function") {
    throw new Error(`registerAdapter(${descriptor.name}): descriptor.adapter must implement the Adapter contract`);
  }
  registry.set(descriptor.name, descriptor);
}

/**
 * @param {string} name
 * @returns {AdapterDescriptor}
 */
export function getAdapter(name) {
  const descriptor = registry.get(name);
  if (!descriptor) {
    const known = [...registry.keys()].join(", ") || "(none registered)";
    throw new Error(`getAdapter: no adapter registered as "${name}" — known adapters: ${known}`);
  }
  return descriptor;
}

/** @returns {AdapterDescriptor[]} */
export function listAdapters() {
  return [...registry.values()];
}

// --- Built-in registrations -------------------------------------------
// Importing this module has the side effect of registering every
// built-in adapter, mirroring how organizations/*/ packages are loaded
// as data rather than wired in by hand at each call site.
import { LandaxAdapter } from "./landax-adapter.mjs";
import { CsvAdapter, countCsvRows } from "./csv-adapter.mjs";
import { JsonAdapter } from "./json-adapter.mjs";
import { DummyAdapter } from "./dummy-adapter.mjs";

registerAdapter({
  name: "landax",
  version: "0.1.0",
  capabilities: ["entries", "schemas", "timeEntries", "machineHours"],
  supportedSchemaVersions: ["1.0"],
  exportFormat: "json",
  authMethod: "none",
  status: "reference",
  adapter: LandaxAdapter,
  countRecords: (payload) => ({
    entries: payload.hendelseslogg.length,
    schemas: payload.hmsSkjema.length,
    timeEntries: payload.timeregistreringer.length,
    machineHours: payload.maskinbruk.length,
  }),
});

registerAdapter({
  name: "csv",
  version: "0.1.0",
  capabilities: ["entries", "timeEntries", "machineHours"],
  supportedSchemaVersions: ["1.0"],
  exportFormat: "csv",
  authMethod: "none",
  status: "stable",
  adapter: CsvAdapter,
  countRecords: (payload) => ({
    entries: countCsvRows(payload.files["entries.csv"]),
    timeEntries: countCsvRows(payload.files["time_entries.csv"]),
    machineHours: countCsvRows(payload.files["machine_hours.csv"]),
  }),
});

registerAdapter({
  name: "json",
  version: "0.1.0",
  capabilities: ["entries", "schemas", "timeEntries", "machineHours"],
  supportedSchemaVersions: ["1.0"],
  exportFormat: "json",
  authMethod: "none",
  status: "stable",
  adapter: JsonAdapter,
  countRecords: (payload) => ({
    entries: payload.events.length,
    schemas: payload.forms.length,
    timeEntries: payload.time.length,
    machineHours: payload.machines.length,
  }),
});

registerAdapter({
  name: "dummy",
  version: "0.1.0",
  capabilities: [],
  supportedSchemaVersions: ["1.0"],
  exportFormat: "json",
  authMethod: "none",
  status: "experimental",
  adapter: DummyAdapter,
  countRecords: () => ({}),
});
