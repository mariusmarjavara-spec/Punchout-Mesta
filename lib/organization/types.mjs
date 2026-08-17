/**
 * OrganizationContext — everything an organization describes about how it
 * works, that the motor CONSUMES but never OWNS. The motor has no idea
 * whether this came from a static file (today) or a synced backend
 * (tomorrow) — it only ever sees the projected RuntimeConfig shape below.
 *
 * @typedef {Object} OrderSummary
 * @property {string} id
 * @property {string} description
 * @property {boolean} active
 *
 * @typedef {Object} MachineSummary
 * @property {string} id
 * @property {string} type          - e.g. "hjullaster", matches dayLog.drafts.maskintimer.maskintype today
 * @property {string} label
 *
 * @typedef {Object} VehicleSummary
 * @property {string} regNr
 * @property {string} [label]
 *
 * @typedef {Object} WageCode
 * @property {string} kode
 * @property {string} label
 *
 * @typedef {Object} ProcedureRef
 * @property {string} id
 * @property {string} title
 * @property {string} url
 *
 * @typedef {Object} ExternalLinkRef
 * @property {string} id
 * @property {string} title
 * @property {string} url
 *
 * @typedef {Object} OrganizationContext
 * @property {string} organizationId
 * @property {string} name
 * @property {string} [department]
 * @property {OrderSummary[]} orders
 * @property {MachineSummary[]} machines
 * @property {VehicleSummary[]} vehicles
 * @property {WageCode[]} wageCodes
 * @property {import('./schema-registry.mjs').SchemaRegistryEntry[]} schemas
 * @property {ProcedureRef[]} procedures
 * @property {ExternalLinkRef[]} externalLinks
 * @property {{sted?: string, arbeidsvarsling?: string} | null} sjaDefaults
 */

/**
 * Project the rich OrganizationContext down to the minimal shape the
 * motor already understands today (hooks/use-motor-state.ts RuntimeConfig,
 * currently sourced from public/punchout-config.js). This is the load-
 * bearing proof that motor.js needs ZERO changes when sync eventually
 * replaces the static config file: whatever populates OrganizationContext
 * (static file today, backend sync tomorrow), the motor keeps consuming
 * exactly this shape.
 *
 * Only the single active order is exposed as `hoofdordre` — multi-order
 * awareness lives in OrganizationContext.orders for future UI.
 *
 * Post-pilot baseline clarification: `hoofdordre` here means "the
 * organization's primary ACTIVE WORK ORDER". Despite the Dutch-looking
 * spelling it is NOT the same field as motor.js's `hovedordre`, which is the
 * reserved sentinel key of the main timesheet bucket (default "HOVED") and
 * must never be a real order. Feeding this value into that one collides the
 * worker's confirmed work draft with the main-time bucket and deadlocks
 * lockDay — see normalizeConfig() in public/motor.js for the full failure
 * mode. Deliberately left under this single name so no caller can mistake
 * the two for spellings of one thing.
 *
 * @param {OrganizationContext} ctx
 * @returns {import('../../hooks/use-motor-state.js').RuntimeConfig}
 */
export function toRuntimeConfig(ctx) {
  const primaryOrder = ctx.orders.find((o) => o.active) || ctx.orders[0];
  return {
    lonnskoder: ctx.wageCodes.map((w) => ({ kode: w.kode, label: w.label })),
    sjaDefaults: ctx.sjaDefaults || null,
    kjoretoy: ctx.vehicles.map((v) => v.regNr),
    externalLinks: ctx.externalLinks.map((l) => ({ id: l.id, title: l.title, url: l.url })),
    hoofdordre: primaryOrder ? primaryOrder.id : "",
  };
}
