/**
 * Pre-day schemas that are marked required (by the caller-supplied
 * predicate — "required" is a motor.js concept, see isSchemaRequired())
 * and not yet confirmed. Pure function so the "Påkrevd" consistency fix
 * (Execution Sprint 3, Oppgave 1) is regression-testable without
 * rendering React or touching motor.js.
 *
 * @param {{type: string, status: string}[]} preDaySchemas
 * @param {(schemaType: string) => boolean} isRequired
 * @returns {{type: string, status: string}[]}
 */
export function getUnconfirmedRequiredSchemas(preDaySchemas, isRequired) {
  return (preDaySchemas || []).filter((s) => isRequired(s.type) && s.status !== "confirmed");
}
