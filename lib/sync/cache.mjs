/**
 * LocalCache — where synced OrganizationContext data lives on-device.
 * Deliberately a SEPARATE store from the motor's dayLog persistence
 * (STORAGE_KEY_CURRENT etc. in motor.js): this cache is org/reference
 * data, the motor's storage is the arbeidsdag. Keeping them in different
 * keys/stores is what makes "sync never touches dayLog" a structural
 * guarantee instead of a convention someone can violate by accident.
 *
 * In a browser this would be a single localStorage entry (e.g.
 * "punchout_org_cache", following the naming already used by
 * yournal_current_day / yournal_history / yournal_ux_state in motor.js).
 * Implemented here as an in-memory Map so it can run in Node for the dry
 * run and for isolated tests without a DOM.
 */
export class LocalCache {
  constructor(initialEntries = []) {
    /** @type {Map<import('./types.mjs').ResourceType, {version: string, updatedAt: string, data: *}>} */
    this.entries = new Map(initialEntries.map((e) => [e.resourceType, e]));
  }

  /** @returns {import('./types.mjs').ResourceVersion[]} */
  knownVersions() {
    return [...this.entries.entries()].map(([resourceType, e]) => ({
      resourceType,
      version: e.version,
      updatedAt: e.updatedAt,
    }));
  }

  /** @param {import('./types.mjs').ResourceType} resourceType */
  get(resourceType) {
    return this.entries.get(resourceType) || null;
  }

  /**
   * Apply a SyncResponse: only resourceTypes present in `changes` are
   * written. Everything else in the cache is left exactly as-is —
   * "ignored" resources are a no-op, not a re-write.
   * @param {import('./types.mjs').SyncResponse} response
   * @returns {{updated: string[], unchanged: string[]}}
   */
  apply(response) {
    const updated = [];
    for (const change of response.changes) {
      if (change.changeKind !== "full") continue;
      const version = response.versions.find((v) => v.resourceType === change.resourceType);
      this.entries.set(change.resourceType, {
        version: version ? version.version : "unknown",
        updatedAt: version ? version.updatedAt : response.serverTime,
        data: change.data,
      });
      updated.push(change.resourceType);
    }
    const unchanged = response.versions
      .map((v) => v.resourceType)
      .filter((t) => !updated.includes(t));
    return { updated, unchanged };
  }
}

/**
 * Assemble a full OrganizationContext by reading every resourceType back
 * out of the cache. This is the "Del 5" answer to organization sync: the
 * motor is never involved in this assembly and never sees cache/sync
 * machinery — it only ever receives the result of toRuntimeConfig() on
 * whatever this function returns.
 *
 * @param {LocalCache} cache
 * @param {string} organizationId
 * @returns {import('../organization/types.mjs').OrganizationContext}
 */
export function assembleOrganizationContext(cache, organizationId) {
  const config = cache.get("config");
  return {
    organizationId,
    name: (config && config.data && config.data.name) || organizationId,
    orders: (cache.get("orders")?.data) || [],
    machines: (cache.get("machines")?.data) || [],
    vehicles: (cache.get("vehicles")?.data) || [],
    wageCodes: (cache.get("wageCodes")?.data) || [],
    schemas: (cache.get("schemas")?.data) || [],
    procedures: (cache.get("procedures")?.data) || [],
    externalLinks: (cache.get("externalLinks")?.data) || [],
    sjaDefaults: (config && config.data && config.data.sjaDefaults) || null,
  };
}
