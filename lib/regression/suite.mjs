/**
 * Regression Library (Phase 9). Every historical bug becomes a
 * permanent, replayable case. A future engine change that breaks one of
 * these has caused a regression, not shipped a feature — there is no
 * ambiguity to argue about, the assertion either holds or it doesn't.
 */
import { deriveFacts } from "../engine/facts.mjs";
import { buildPromptQueue } from "../engine/completion-engine.mjs";
import { generateCandidates } from "../ranking-engine/candidates.mjs";
import { rankCandidates } from "../ranking-engine/score.mjs";
import { CorrectionMemoryStore } from "../correction-memory/store.mjs";
import { RuntimeStore } from "../runtime/store.mjs";

export const REGRESSION_CASES = [
  {
    id: "phase67_missing_effectivefrom",
    description: "A rule missing effectiveFrom must not silently vanish from the Prompt Queue (Phase 6.7: dry run initially produced an empty queue because Invalid Date <= now is always false).",
    run: () => {
      const rules = [{ id: "r1", version: 1, effectiveFrom: "2026-01-01", trigger: { event: "factObserved", factKey: "requiredSchemaFromMachine" }, conditions: [], action: { type: "requireSchema", target: "$factValue" }, priority: 80, affects: {} }];
      const facts = [{ key: "requiredSchemaFromMachine", value: "maskinsjekk", sourceEntryIndex: 0 }];
      const queue = buildPromptQueue(facts, rules);
      return queue.length === 1 && queue[0].target === "maskinsjekk";
    },
  },
  {
    id: "phase8_org_specific_incident_vocabulary",
    description: "incidentReported must be extractable via organization-supplied vocabulary, not only Mesta's hardcoded list (Phase 8: Nordhavn's 'avvik' silently failed to trigger rule_avvik_on_incident until extractionVocabularies was added).",
    run: () => {
      const dayLog = { date: "2026-07-02", entries: [{ time: "10:00", type: "notat", text: "Hadde et avvik i dag" }] };
      const facts = deriveFacts(dayLog, { machines: [] }, {}, { incidentKeywords: ["avvik"] });
      return facts.some((f) => f.key === "incidentReported" && f.value === true);
    },
  },
  {
    id: "phase8_org_specific_order_pattern",
    description: "orderCandidate must be extractable via organization-supplied ID pattern, not only Mesta's digit-dash-digit format.",
    run: () => {
      const dayLog = { date: "2026-07-02", entries: [{ time: "10:00", type: "notat", text: "Losset på NHT-2026-0451" }] };
      const facts = deriveFacts(dayLog, { machines: [] }, { ordre: "\\b(NHT-\\d{4}-\\d{3,4})\\b" });
      return facts.some((f) => f.key === "orderCandidate" && f.value === "NHT-2026-0451");
    },
  },
  {
    id: "mesta_rv92_correction_flips_ranking",
    description: "RV92 -> 204481-0149 correction, repeated enough times, flips ranking away from a recency-only false leader (organizations/mesta/corrections.json fixture).",
    run: () => {
      const candidates = [
        { value: "204481-0014", baseMatch: 0, contextScore: 10 },
        { value: "204481-0149", baseMatch: 0, contextScore: 10 },
        { value: "204481-0022", baseMatch: 0, contextScore: 0 },
      ];
      const ctx = { category: "order", originalValue: "RV92", userId: "u1", organizationId: "mesta", todaysConfirmedValues: ["204481-0014", "204481-0014"] };
      const store = new CorrectionMemoryStore();
      const before = rankCandidates(candidates, store, [], ctx);
      for (let i = 0; i < 3; i++) store.recordCorrection({ category: "order", originalValue: "RV92", correctedValue: "204481-0149", userId: "u1", organizationId: "mesta" });
      const after = rankCandidates(candidates, store, [], ctx);
      return before[0].value === "204481-0014" && after[0].value === "204481-0149";
    },
  },
  {
    id: "candidate_generation_is_deterministic",
    description: "Same input to generateCandidates() always produces the same baseMatch scores.",
    run: () => {
      const a = generateCandidates("RV92", ["204481-0014", "RV92-alt"]);
      const b = generateCandidates("RV92", ["204481-0014", "RV92-alt"]);
      return JSON.stringify(a) === JSON.stringify(b);
    },
  },
  {
    id: "phaseA_rollback_survives_checksum_collision",
    description: "Validation Sprint Del 5/6: two publishes with unchanged content produce the SAME checksum but different runtimeVersion. Found via a real 3-device test: RuntimeStore previously keyed its runtime storage by checksum alone, so the second publish silently overwrote the first's stored object — rolling back to the OLDER version's manifest still served the NEWER version's runtime content. Fixed by keying storage by organizationId+runtimeVersion instead.",
    run: () => {
      const store = new RuntimeStore();
      const sharedChecksum = "djb2_identical_content";
      const runtimeV1 = { organizationId: "collision_test_org", runtimeVersion: 1, checksum: sharedChecksum, schemas: [] };
      const runtimeV2 = { organizationId: "collision_test_org", runtimeVersion: 2, checksum: sharedChecksum, schemas: [] };
      store.publish(runtimeV1, "test");
      store.publish(runtimeV2, "test");
      const beforeRollback = store.getActive("collision_test_org");
      const rb = store.rollback("collision_test_org", 1);
      const afterRollback = store.getActive("collision_test_org");
      return beforeRollback.runtimeVersion === 2 && rb.ok && afterRollback.runtimeVersion === 1;
    },
  },
];

/**
 * run() may be sync or return a Promise (motor.js cases need to await
 * its deferred orchestration tick) — always awaited here either way.
 * @param {typeof REGRESSION_CASES} [cases]
 */
export async function runRegressionSuite(cases = REGRESSION_CASES) {
  const results = [];
  for (const c of cases) {
    let passed = false;
    let error = null;
    try {
      passed = await c.run();
    } catch (e) {
      error = String((e && e.message) || e);
    }
    results.push({ id: c.id, description: c.description, passed, error });
  }
  return results;
}
