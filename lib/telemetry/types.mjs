/**
 * Telemetry contract. Event-based, structured, no persondata beyond what
 * already exists in the system (userId/deviceId/organizationId, same as
 * ExportEnvelope already carries — Phase 2). No new PII surface.
 *
 * @typedef {"ObservationCreated"|"FactCreated"|"RuleTriggered"|"PromptAccepted"|
 *   "PromptDismissed"|"SchemaCompleted"|"SchemaSkipped"|"RuntimeLoaded"|
 *   "RuntimeChanged"|"ExportSucceeded"|"ExportFailed"|
 *   "CorrectionCreated"|"CorrectionApplied"|"CorrectionIgnored"|
 *   "CorrectionExpired"|"CorrectionConflict"|"ClientError"} TelemetryEventType
 *
 * @typedef {Object} TelemetryEvent
 * @property {string} [id]  - present from Phase A onward; used for auto-flush idempotency (backend dedupes on this)
 * @property {TelemetryEventType} type
 * @property {string} occurredAt
 * @property {string} organizationId
 * @property {number} [runtimeVersion]  - which Runtime was active, for Del 7 before/after comparison
 * @property {Record<string, unknown>} data
 * @property {boolean} [flushed]  - present from Phase A onward; true once motor.js's auto-flush has POSTed this event to the backend
 *
 * ClientError (post-sprint-3-strategic-review.md Oppgave 3): motor.js's
 * global window.onerror/unhandledrejection handlers emit this. This type
 * was missing from the union above until the crash-telemetry-aggregation
 * fix (2026-08) — the event itself worked and was captured/tested since
 * its own introduction, but nothing in this contract documented it, one
 * symptom of the same "captured but nothing reads it" gap that fix
 * closed. `data` shape: {message: string, source: string|null,
 * line: number|null, stack: string|null}.
 */

/**
 * Execution Sprint 3, Oppgave 7: UX-observation telemetry, separate from the union above.
 * motor.js's own emitTelemetry() is private (not exposed on window.Motor) and its events
 * assume an organizationId this UX layer has no reliable way to populate (no login system) —
 * these events are deliberately simpler and carry no user/device identifier at all, matching
 * the privacy posture the brief asked for ("ikke til overvåkning av enkeltbrukere").
 *
 * @typedef {"RequiredSchemaBlocked"|"VoiceBlockedOffline"|"OfflineStateObserved"|
 *   "CorrectionAttempted"|"ExportFailureShown"|"ManualCancel"} UxTelemetryEventType
 *
 * @typedef {Object} UxTelemetryEvent
 * @property {string} id
 * @property {UxTelemetryEventType} type
 * @property {string} occurredAt
 * @property {Record<string, unknown>} data
 * @property {boolean} [flushed]
 */

export {};
