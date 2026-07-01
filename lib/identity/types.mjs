/**
 * Identity contracts. Pure data — no OAuth, no login, no session handling.
 *
 * The motor NEVER authenticates anyone and never decides access based on
 * role. It only stamps data with whatever IdentityContext it is handed
 * (userId/deviceId/organizationId already flow through
 * lib/adapters/envelope.mjs today). Role/Permission exist here because a
 * future admin layer (who may publish a new SJA version, per Del 4) needs
 * them — that enforcement happens in the backend/admin layer, never in
 * the day-logging engine. This split is deliberate, not an oversight.
 *
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} name
 * @property {string} [department]
 *
 * @typedef {Object} Device
 * @property {string} id
 * @property {string} platform      - "ios" | "android" | "web"
 * @property {string} appVersion
 *
 * @typedef {Object} User
 * @property {string} id
 * @property {string} organizationId
 * @property {string} displayName
 * @property {string} [employeeNumber]
 *
 * @typedef {Object} Role
 * @property {string} id            - e.g. "field_worker", "hms_admin", "org_admin"
 * @property {string} label
 *
 * @typedef {Object} Permission
 * @property {string} id            - e.g. "schema.publish", "export.retry", "day.viewOthers"
 * @property {string} label
 *
 * @typedef {Object} IdentityContext
 *   The thin bundle actually handed to the motor/adapter layer at runtime.
 *   Deliberately NOT the full Organization/User/Role objects — just enough
 *   to stamp exports and select an OrganizationContext. Never carries
 *   Permission objects: the motor has no use for them and must not be able
 *   to make access decisions.
 * @property {string} organizationId
 * @property {string} userId
 * @property {string} deviceId
 * @property {string[]} roleIds     - opaque to the motor; used only by adapters/backend
 */

/**
 * Narrow a full identity registry lookup down to the thin context the
 * motor/adapter layer consumes. Pure projection, no side effects.
 *
 * @param {{organization: Organization, user: User, device: Device, roles: Role[]}} full
 * @returns {IdentityContext}
 */
export function toIdentityContext(full) {
  return {
    organizationId: full.organization.id,
    userId: full.user.id,
    deviceId: full.device.id,
    roleIds: full.roles.map((r) => r.id),
  };
}
