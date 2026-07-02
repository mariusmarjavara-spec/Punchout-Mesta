/**
 * deriveKnowledgeFacts() — the only place the Knowledge Graph touches
 * anything: it reads Facts already produced by the Fact Engine (never
 * raw Observation text) and emits MORE Facts, one per graph edge
 * actually followed, each with a full trace. It never emits a
 * RequiredAction directly — that stays the Rule engine's job.
 *
 * Emits one derived fact per required schema, not a collapsed/first-only
 * value — collapsing here would be exactly the kind of accidental
 * hidden rule Phase 6.7's own critique warns about (a machine requiring
 * two schemas would silently lose one).
 */

/**
 * @param {import('../engine/types.mjs').Fact[]} facts
 * @param {import('./types.mjs').KnowledgeGraph} kg
 * @returns {{derivedFacts: import('../engine/types.mjs').Fact[], trace: import('./types.mjs').KnowledgeTraceStep[]}}
 */
export function deriveKnowledgeFacts(facts, kg) {
  const derivedFacts = [];
  const trace = [];

  const machineFacts = facts.filter((f) => f.key === "machineUsed");
  for (const mf of machineFacts) {
    const value = String(mf.value).toLowerCase();
    const machineType = kg.machineTypes.find((m) => m.id.toLowerCase() === value || m.label.toLowerCase() === value);
    if (!machineType) continue;

    for (const schemaType of machineType.requiredSchemas) {
      derivedFacts.push({ key: "requiredSchemaFromMachine", value: schemaType, sourceEntryIndex: mf.sourceEntryIndex });
      trace.push({ from: "machineUsed:" + mf.value, to: "requiredSchema:" + schemaType, via: "machineType.requiredSchemas" });
    }
  }

  return { derivedFacts, trace };
}

/**
 * Closed-keyword activity detection — not stemming, not fuzzy matching.
 * An ActivityNode is only found if one of its explicit keywords (or its
 * id/label) literally appears in the text.
 * @param {string} rawText
 * @param {import('./types.mjs').KnowledgeGraph} kg
 * @returns {import('./types.mjs').ActivityNode|null}
 */
export function detectActivity(rawText, kg) {
  const lower = rawText.toLowerCase();
  for (const activity of kg.activities) {
    const terms = [activity.id, activity.label, ...(activity.keywords || [])].map((t) => t.toLowerCase());
    if (terms.some((t) => lower.includes(t))) return activity;
  }
  return null;
}
