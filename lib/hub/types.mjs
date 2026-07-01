/**
 * Hub-as-client contracts. This file is the proof, not just the claim:
 * if Hub's entire interaction with the rest of the platform can be
 * expressed as request/response pairs with no "Hub owns X" data type
 * anywhere in this module, Hub has no independent state to reconcile,
 * migrate, or go stale — it IS a client. (Compare to lib/organization/
 * provider.mjs, lib/sync/types.mjs: those define what Backend/Motor own.
 * Nothing here defines ownership, only requests.)
 *
 * Administrator -> Hub (web) -> Backend -> Mobile. Not Hub and Backend
 * as two independent systems that happen to agree.
 *
 * "Rediger" (the edit step in the Del 4 publish pipeline) deliberately
 * has NO contract here: editing is Hub's own ephemeral UI state, exactly
 * like a React component's local useState in Mobile — nothing durable
 * exists until a request below is sent.
 *
 * @typedef {Object} ImportRequest
 * @property {string} organizationId
 * @property {"schema"|"orders"|"machines"} kind
 * @property {*} raw                 - e.g. a schema-format.mjs document, or a raw order list
 * @property {{source: string}} provenance   - e.g. { source: "landax" }, for the audit trail Backend owns
 *
 * @typedef {Object} ImportResult
 * @property {boolean} accepted
 * @property {string[]} errors       - from parseSchemaDocument()-style structural checks
 * @property {*} [normalized]        - the structurally valid document, ready to be included in a publish
 *
 * @typedef {Object} ValidateRequest
 *   The "Valider" step — checks a whole proposed changeset together,
 *   before compiling. See lib/runtime/compiler.mjs for the actual checks.
 * @property {string} organizationId
 * @property {import('../runtime/types.mjs').RuntimeCompilerInput} proposed
 *
 * @typedef {Object} ValidateResult
 * @property {boolean} valid
 * @property {string[]} errors
 *
 * @typedef {Object} CompileRequest
 * @property {string} organizationId
 * @property {import('../runtime/types.mjs').RuntimeCompilerInput} proposed
 *
 * @typedef {Object} CompileResult
 * @property {boolean} ok
 * @property {string[]} errors
 * @property {import('../runtime/types.mjs').OrganizationRuntime} [runtime]  - unpublished; a candidate only
 *
 * @typedef {Object} DryRunRequest
 *   Runs the compiled-but-unpublished runtime through the Operational
 *   Completion Engine (lib/engine) against a sample day, so a runtime
 *   that compiles cleanly but behaves nonsensically is still caught
 *   before publish.
 * @property {import('../runtime/types.mjs').OrganizationRuntime} candidateRuntime
 * @property {import('../../hooks/use-motor-state.js').DayLog} sampleDayLog
 *
 * @typedef {Object} DryRunResult
 * @property {boolean} ok
 * @property {import('../engine/types.mjs').PromptQueueItem[]} promptQueue
 * @property {string[]} warnings     - e.g. a rule that never fires against the sample, or fires on everything
 *
 * @typedef {Object} PublishRequest
 * @property {string} organizationId
 * @property {import('../runtime/types.mjs').OrganizationRuntime} candidateRuntime
 * @property {string} publishedBy    - userId (see lib/identity/types.mjs)
 *
 * @typedef {Object} PublishResult
 * @property {boolean} ok
 * @property {import('../runtime/types.mjs').RuntimeManifest} [manifest]
 * @property {string[]} errors
 */

export {};
