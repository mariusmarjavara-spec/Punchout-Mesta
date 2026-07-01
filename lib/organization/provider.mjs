/**
 * OrganizationProvider — the seam where "motor never knows where data
 * comes from" becomes concrete. Anything implementing this one-method
 * interface can hand the app an OrganizationContext; the caller (and the
 * motor, further downstream via toRuntimeConfig()) cannot tell which
 * implementation produced it.
 *
 * @typedef {Object} OrganizationProvider
 * @property {(request: import('../sync/types.mjs').SyncRequest) => Promise<import('../sync/types.mjs').SyncResponse>} fetchOrganizationContext
 */

/**
 * Today's actual (only) provider: wraps the static public/punchout-
 * config.js values — zero network, zero backend, exactly what the app
 * does right now. In a browser this would read window.PUNCHOUT_CONFIG;
 * mirrored here as a literal since this module also has to run in Node
 * (dry runs, tests) where `window` doesn't exist.
 *
 * Always reports version "static-1" for every resource type it doesn't
 * model (machines, orders, schemas — none of which exist in the static
 * config today) as an empty/absent set, which is honest: this provider
 * cannot sync what was never modeled as syncable in the first place.
 *
 * @type {import('./provider.mjs').OrganizationProvider}
 */
export const LocalConfigProvider = {
  async fetchOrganizationContext(_request) {
    /** @type {import('./types.mjs').OrganizationContext} */
    const context = {
      organizationId: "mesta",
      name: "Mesta",
      orders: [{ id: "HOVED", description: "Hovedordre", active: true }],
      machines: [],
      vehicles: [
        { regNr: "AB 12345" },
        { regNr: "CD 67890" },
        { regNr: "EF 11111" },
      ],
      wageCodes: [
        { kode: "100", label: "Ordinær arbeidstid" },
        { kode: "200", label: "Overtid 50%" },
        { kode: "300", label: "Overtid 100%" },
        { kode: "999", label: "TESTKODE" },
      ],
      schemas: [],
      procedures: [],
      externalLinks: [
        { id: "elrapp", title: "Logg inn i Elrapp", url: "https://elrapp.atlas.vegvesen.no/login" },
        { id: "linx", title: "Linx-innlogging", url: "https://linx.no" },
      ],
      sjaDefaults: { sted: "", arbeidsvarsling: "enkel" },
    };
    return {
      serverTime: new Date().toISOString(),
      versions: [
        { resourceType: "config", version: "static-1", updatedAt: new Date(0).toISOString() },
      ],
      changes: [{ resourceType: "config", changeKind: "full", data: context }],
    };
  },
};
