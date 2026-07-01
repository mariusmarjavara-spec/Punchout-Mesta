/**
 * Sync contracts. No server implementation here — these are the shapes a
 * future backend and client must agree on. Deliberately ONE generic
 * ResourceVersion/ChangeSet pair rather than separate SchemaVersion/
 * OrderVersion/MachineVersion/ConfigVersion types: every resource kind
 * needs the exact same version-compare behavior, so one parameterized
 * shape (`resourceType` as a discriminant) covers orders, machines,
 * vehicles, wageCodes, schemas, procedures and config without growing a
 * new type per resource. Cheaper to extend later (a new resourceType
 * string, not a new type).
 *
 * @typedef {"orders"|"machines"|"vehicles"|"wageCodes"|"schemas"|"procedures"|"externalLinks"|"config"} ResourceType
 *
 * @typedef {Object} ResourceVersion
 * @property {ResourceType} resourceType
 * @property {string} version       - opaque to the client; string so a mock/static provider can use "static-1" and a real backend can use a real version scheme
 * @property {string} updatedAt     - ISO timestamp
 *
 * @typedef {Object} SyncRequest
 *   "Here's what I already have cached" — server decides what, if
 *   anything, needs to come back.
 * @property {string} organizationId
 * @property {string} deviceId
 * @property {ResourceVersion[]} knownVersions
 *
 * @typedef {Object} ChangeSet
 * @property {ResourceType} resourceType
 * @property {"full"|"none"} changeKind  - "full" = replace cached value entirely; delta sync is a future optimization, not needed for foundation-phase resource sizes (config-scale data, not day-log-scale)
 * @property {*} [data]                  - present only when changeKind is "full"
 *
 * @typedef {Object} SyncResponse
 * @property {string} serverTime
 * @property {ResourceVersion[]} versions  - authoritative version for every resourceType, changed or not
 * @property {ChangeSet[]} changes         - only resourceTypes that actually changed vs. knownVersions
 */

export {};
