/**
 * MockBackendProvider — stands in for a real backend for Del 6's dry run
 * only. No network, no persistence beyond this module's in-memory
 * "server" state. Implements the same OrganizationProvider interface as
 * LocalConfigProvider (lib/organization/provider.mjs) — the calling code
 * cannot tell them apart, which is the point.
 *
 * Server state below encodes the dry-run scenario: orders and machines
 * got a new version (new order added / new machine added), sja_preday
 * got a new schema version (new required field), everything else is
 * unchanged since v1.
 */

const SERVER_STATE = {
  orders: {
    version: "4",
    updatedAt: "2026-07-02T06:00:00.000Z",
    data: [
      { id: "HOVED", description: "Hovedordre", active: true },
      { id: "204481-0014", description: "Fv. 17 asfalt/brøyting", active: true },
      { id: "204481-0022", description: "Fv. 22 grøfterensk", active: true }, // NEW
    ],
  },
  machines: {
    version: "2",
    updatedAt: "2026-07-02T06:00:00.000Z",
    data: [
      { id: "m1", type: "hjullaster", label: "Hjullaster 12t" },
      { id: "m2", type: "gravemaskin", label: "Gravemaskin 8t" }, // NEW
    ],
  },
  vehicles: {
    version: "1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    data: [{ regNr: "AB 12345" }, { regNr: "CD 67890" }, { regNr: "EF 11111" }],
  },
  wageCodes: {
    version: "1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    data: [
      { kode: "100", label: "Ordinær arbeidstid" },
      { kode: "200", label: "Overtid 50%" },
      { kode: "300", label: "Overtid 100%" },
    ],
  },
  schemas: {
    version: "3",
    updatedAt: "2026-07-02T06:00:00.000Z",
    // Registry publishes must include every version that could still be
    // pinned by an open/historical schema instance (invariant #2 in
    // schema-registry.mjs), not just the newest. v2 stays here so
    // resolveActiveSchemaDefinition() still finds an active schema today
    // even though v3 is staged for tomorrow.
    data: [
      {
        schemaType: "sja_preday",
        version: 2,
        effectiveFrom: "2026-06-01",
        fields: {
          oppgave: { label: "Oppgave", type: "text", required: true },
          godkjent: { label: "Godkjent", type: "boolean", required: true },
        },
      },
      {
        schemaType: "sja_preday",
        version: 3,
        effectiveFrom: "2026-07-02",
        fields: {
          oppgave: { label: "Oppgave", type: "text", required: true },
          sted: { label: "Sted", type: "text", required: false },
          risiko: { label: "Risiko", type: "text", required: false },
          konsekvens: { label: "Konsekvens", type: "text", required: true },
          tiltak: { label: "Tiltak", type: "text", required: true },
          arbeidsvarsling: { label: "Arbeidsvarsling", type: "enum", required: false, options: ["ingen", "enkel", "manuell", "full"] },
          utstyrskontroll: { label: "Utstyr kontrollert", type: "boolean", required: true }, // NEW field, v3
          godkjent: { label: "Godkjent", type: "boolean", required: true },
        },
        deprecatesVersion: 2,
      },
    ],
  },
  procedures: { version: "1", updatedAt: "2026-06-01T00:00:00.000Z", data: [] },
  externalLinks: {
    version: "1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    data: [
      { id: "elrapp", title: "Logg inn i Elrapp", url: "https://elrapp.atlas.vegvesen.no/login" },
      { id: "linx", title: "Linx-innlogging", url: "https://linx.no" },
    ],
  },
  config: {
    version: "1",
    updatedAt: "2026-06-01T00:00:00.000Z",
    data: { name: "Mesta", sjaDefaults: { sted: "", arbeidsvarsling: "enkel" } },
  },
};

/** @type {import('../organization/provider.mjs').OrganizationProvider} */
export const MockBackendProvider = {
  async fetchOrganizationContext(request) {
    const knownByType = new Map(request.knownVersions.map((v) => [v.resourceType, v.version]));
    const versions = [];
    const changes = [];

    for (const resourceType of Object.keys(SERVER_STATE)) {
      const server = SERVER_STATE[resourceType];
      versions.push({ resourceType, version: server.version, updatedAt: server.updatedAt });

      const knownVersion = knownByType.get(resourceType);
      if (knownVersion === server.version) {
        changes.push({ resourceType, changeKind: "none" });
      } else {
        changes.push({ resourceType, changeKind: "full", data: server.data });
      }
    }

    return { serverTime: new Date().toISOString(), versions, changes };
  },
};
