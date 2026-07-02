/**
 * Telemetry contract. Event-based, structured, no persondata beyond what
 * already exists in the system (userId/deviceId/organizationId, same as
 * ExportEnvelope already carries — Phase 2). No new PII surface.
 *
 * @typedef {"ObservationCreated"|"FactCreated"|"RuleTriggered"|"PromptAccepted"|
 *   "PromptDismissed"|"SchemaCompleted"|"SchemaSkipped"|"RuntimeLoaded"|
 *   "RuntimeChanged"|"ExportSucceeded"|"ExportFailed"|
 *   "CorrectionCreated"|"CorrectionApplied"|"CorrectionIgnored"|
 *   "CorrectionExpired"|"CorrectionConflict"} TelemetryEventType
 *
 * @typedef {Object} TelemetryEvent
 * @property {string} [id]  - present from Phase A onward; used for auto-flush idempotency (backend dedupes on this)
 * @property {TelemetryEventType} type
 * @property {string} occurredAt
 * @property {string} organizationId
 * @property {number} [runtimeVersion]  - which Runtime was active, for Del 7 before/after comparison
 * @property {Record<string, unknown>} data
 * @property {boolean} [flushed]  - present from Phase A onward; true once motor.js's auto-flush has POSTed this event to the backend
 */

export {};
