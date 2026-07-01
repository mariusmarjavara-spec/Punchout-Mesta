/**
 * Schema Registry — architecture for letting an organization edit SJA/
 * RUH/checklist DEFINITIONS without an app update. This file defines the
 * contract and one pure invariant-check helper; it deliberately does NOT
 * implement dynamic schema rendering (that's a later phase, once the
 * "usynlig huskeliste"/rule engine exists to consume it).
 *
 * Five design questions, answered as fixed invariants:
 *
 * 1. VERSJONERING — one monotonically increasing integer `version` per
 *    `schemaType` (e.g. "sja_preday"). No semver, no branching — a
 *    registry entry is either newer or not. Keeps sync's "do I have the
 *    latest" check trivial (integer compare), which matters for an
 *    offline-first client that must resolve this without a server round
 *    trip when disconnected.
 *
 * 2. BAKOVERKOMPATIBILITET — a schema INSTANCE embedded in a DayLog
 *    records which `schemaVersion` it was created under (a small future
 *    addition to the existing Schema type — not made in this phase,
 *    listed for the next one) and is rendered/validated against that
 *    pinned version forever, even after the registry moves on. Field
 *    REMOVALS are therefore never destructive to history; only additions
 *    and edits to still-unconfirmed fields are safe operations for a
 *    registry publisher.
 *
 * 3. DETERMINISME — the registry can only change WHAT fields exist and
 *    whether they're required (data). It can never change HOW a field is
 *    validated or whether it's eligible for autofill: the
 *    NEVER_AUTO_FILL boundary (konsekvens/tiltak/arsak/vurdering — see
 *    motor.js) stays hardcoded in the motor regardless of what a
 *    SchemaRegistryEntry declares. A registry entry that tried to mark
 *    one of those fields autofillable must be rejected by the motor's own
 *    validation, not merely omitted by a well-behaved publisher — same
 *    conclusion reached in the earlier strategic analysis, restated here
 *    as the concrete contract boundary.
 *
 * 4. AKTIV ARBEIDSDAG — registry sync writes ONLY to the organization
 *    cache (lib/sync/cache.mjs), never into dayLog.schemas. A day already
 *    in progress is completely unreachable from a sync operation; the
 *    motor is the only thing that ever touches dayLog. A new registry
 *    version only affects schema instances created after `effectiveFrom`.
 *
 * 5. CACHE/OFFLINE — the full registry (all schemaTypes, latest known
 *    version of each) is cached locally alongside orders/machines/config.
 *    A worker who hasn't synced in days keeps using the last cached
 *    version indefinitely — never blocked from starting a day by a
 *    missing sync. Sync only ever moves versions forward in the cache.
 *
 * @typedef {Object} SchemaFieldDef
 *   Same shape the motor already uses internally for schema field
 *   definitions (see RUNNING_SCHEMAS/PRE_DAY_SCHEMAS in motor.js) — reused,
 *   not reinvented. `autofillable` is new in Phase 4 (see
 *   lib/organization/schema-format.mjs): a hint an organization may set,
 *   but the platform overrides it to `false` for a fixed set of fields
 *   regardless of what's submitted — same NEVER_AUTO_FILL boundary as
 *   motor.js, now enforced at the registry-submission boundary too.
 * @property {string} label
 * @property {"text"|"boolean"|"enum"} type
 * @property {boolean} required
 * @property {string[]} [options]
 * @property {boolean} [autofillable]
 *
 * @typedef {Object} SchemaSection
 *   Purely presentational grouping — the platform-locked/required-field
 *   semantics live entirely on SchemaFieldDef, never on the section.
 * @property {string} id
 * @property {string} title
 * @property {string[]} fields          - keys into SchemaRegistryEntry.fields
 *
 * @typedef {Object} SchemaRegistryEntry
 * @property {string} schemaType        - e.g. "sja_preday", "ruh"
 * @property {number} version           - monotonic per schemaType
 * @property {string} effectiveFrom     - ISO date; applies to schema instances created on/after this date
 * @property {Record<string, SchemaFieldDef>} fields
 * @property {number} [deprecatesVersion]
 * @property {string} [title]
 * @property {SchemaSection[]} [sections]
 * @property {Record<string, unknown>} [metadata]  - e.g. { publishedBy: "landax", sourceSchemaId: "..." } for round-trip traceability
 *
 * NOTE: no `attachedRules` here on purpose (removed after Phase 5
 * critique). Rule.affects.schemaTypes (lib/rules/types.mjs) already
 * expresses schema<->rule linkage; adding a second, opposite-direction
 * reference here would let the two drift out of sync with no way to
 * detect it. One direction of truth: rules point at schemas, schemas
 * never point at rules.
 */

/**
 * The one behavior this phase implements: does a given already-created
 * schema instance stay pinned to its original version, or is it allowed
 * to pick up a newer one? Per invariant #2/#4, the answer is always
 * "stays pinned" — this function exists so that answer is enforced by
 * code, not just documented.
 *
 * @param {{schemaVersion: number}} schemaInstance
 * @param {SchemaRegistryEntry[]} registryEntries
 * @returns {SchemaRegistryEntry|null} the exact pinned definition, never a newer one
 */
export function resolveSchemaDefinitionForInstance(schemaInstance, registryEntries) {
  return registryEntries.find((e) => e.version === schemaInstance.schemaVersion) || null;
}

/**
 * Which registry version should a NEW schema instance be created against
 * today? Latest entry whose effectiveFrom has passed — never a future-
 * dated entry, so a publisher can stage a change ahead of time.
 *
 * @param {string} schemaType
 * @param {SchemaRegistryEntry[]} registryEntries
 * @param {Date} [now]
 * @returns {SchemaRegistryEntry|null}
 */
export function resolveActiveSchemaDefinition(schemaType, registryEntries, now = new Date()) {
  return registryEntries
    .filter((e) => e.schemaType === schemaType && new Date(e.effectiveFrom) <= now)
    .sort((a, b) => b.version - a.version)[0] || null;
}
