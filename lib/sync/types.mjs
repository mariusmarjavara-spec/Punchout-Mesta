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
 * Phase 6 finding: syncing these eight independently, as Phase 3 did,
 * has no cross-resource consistency guarantee — a device could end up
 * with orders@v4 but schemas@v2, an inconsistent combination nothing
 * ever validated together. "runtime" is the fix: Mobile now syncs this
 * ONE resourceType exclusively (see lib/runtime/), which is always
 * internally consistent because the compiler already validated it as a
 * whole before publish. The other eight resourceTypes are kept — they
 * remain valid, generically useful sync primitives, and Hub's own
 * editing tools may still fetch them individually — but Mobile no
 * longer syncs them piecemeal.
 *
 * @typedef {"orders"|"machines"|"vehicles"|"wageCodes"|"schemas"|"procedures"|"externalLinks"|"config"|"runtime"} ResourceType
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
