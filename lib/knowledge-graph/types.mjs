/**
 * Organization Knowledge Graph — not a graph database, a small
 * declarative relation table living inside OrganizationRuntime (Del 3/4:
 * "ingen regler skal inneholde hardkodet domenekunnskap dersom denne kan
 * beskrives i Runtime"). Purely structural data: which machine types a
 * job typically uses, which schemas a machine type requires. It never
 * triggers anything itself — lib/knowledge-graph/derive.mjs turns its
 * relations into ordinary Facts, and the existing Rule engine (data,
 * unchanged) still owns every actual decision. The graph describes
 * structure; Rules own behavior. Keeping that line intact is exactly
 * what stops this from becoming a second, hidden rule engine.
 *
 * @typedef {Object} MachineTypeNode
 * @property {string} id                 - matches OrganizationContext.machines[].type / extractRessurser()'s vocabulary
 * @property {string} label
 * @property {string[]} requiredSchemas
 * @property {string[]} recommendedSchemas
 * @property {string[]} externalSystems  - CapabilityProvider ids this machine's data should reach
 *
 * @typedef {Object} ActivityNode
 * @property {string} id                 - e.g. "feiing"
 * @property {string} label
 * @property {string[]} machineTypes     - MachineTypeNode ids typically used for this activity
 * @property {string[]} [keywords]       - closed, explicit synonym list for detection (e.g. "feid" for "feiing") — never stemming/fuzzy matching
 *
 * @typedef {Object} OrderTypeNode
 * @property {string} id
 * @property {string} label
 * @property {string[]} activities       - ActivityNode ids typical for this order type
 *
 * @typedef {Object} KnowledgeGraph
 * @property {ActivityNode[]} activities
 * @property {MachineTypeNode[]} machineTypes
 * @property {OrderTypeNode[]} orderTypes
 *
 * @typedef {Object} KnowledgeTraceStep
 *   One hop in a Del-5 Completion Path — always attributable to a named
 *   graph edge, never an inferred leap.
 * @property {string} from
 * @property {string} to
 * @property {string} via                - the relation name, e.g. "machineType.requiredSchemas"
 */

export {};
