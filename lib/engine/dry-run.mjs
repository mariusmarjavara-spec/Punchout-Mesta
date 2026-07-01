/**
 * Del 6 dry run: "I dag har jeg jobbet fire timer på RV92 med hjullaster.
 * Jeg hadde en nestenulykke. Jeg må fylle diesel før i morgen."
 *
 * Observation -> Facts -> Rule Evaluation -> Required Actions -> Priority
 * -> Prompt Queue -> User. No AI anywhere — deriveFacts() is regex/
 * keyword/lookup-table only, rules use the closed operator set from
 * Phase 4. Run with: node lib/engine/dry-run.mjs
 */
import { deriveFacts } from "./facts.mjs";
import { buildPromptQueue } from "./completion-engine.mjs";

function section(title) {
  console.log("\n=== " + title + " ===");
}

// ---------------------------------------------------------------
// 1. Observation
// ---------------------------------------------------------------
section("1. Observation (rå tale-inntekst, allerede i dayLog.entries)");

const utterance =
  "I dag har jeg jobbet fire timer på RV92 med hjullaster. Jeg hadde en nestenulykke. Jeg må fylle diesel før i morgen.";
console.log('"' + utterance + '"');

/** @type {import('../../hooks/use-motor-state.js').DayLog} */
const dayLog = {
  date: "2026-07-01",
  startTime: "07:00",
  phase: "active",
  entries: [{ time: "11:00", type: "notat", text: utterance }],
};

/** @type {import('../organization/types.mjs').OrganizationContext} */
const orgContext = {
  organizationId: "mesta",
  name: "Mesta",
  orders: [{ id: "204481-0014", description: "Fv. 17 asfalt/brøyting", active: true }],
  machines: [
    { id: "m1", type: "hjullaster", label: "Hjullaster 12t" },
    { id: "m2", type: "gravemaskin", label: "Gravemaskin 8t" },
  ],
  vehicles: [],
  wageCodes: [],
  schemas: [],
  procedures: [],
  externalLinks: [],
  sjaDefaults: null,
};

// ---------------------------------------------------------------
// 2. Facts
// ---------------------------------------------------------------
section("2. Facts (deterministisk utledet, ingen gjetting)");

const facts = deriveFacts(dayLog, orgContext);
console.log(JSON.stringify(facts, null, 2));
console.log(
  "\nMerk: 'RV92' matchet IKKE ordre-mønsteret (\\d{4,}-\\d{1,4}) -> flagget som locationMentioned," +
    " ikke gjettet til noen ordre. Systemet skal ikke gjette."
);

// Determinism proof: same input, run twice, must be byte-identical.
const factsAgain = deriveFacts(dayLog, orgContext);
console.log(
  "\nDeterminisme: deriveFacts() kjørt to ganger på samme input gir identisk resultat:",
  JSON.stringify(facts) === JSON.stringify(factsAgain)
);

// ---------------------------------------------------------------
// 3. Rule Evaluation -> Required Actions -> Priority (data, ikke kode)
// ---------------------------------------------------------------
section("3. Regler (data)");

/** @type {import('../rules/types.mjs').Rule[]} */
const rules = [
  {
    id: "rule_ruh_on_incident",
    version: 1,
    effectiveFrom: "2026-01-01",
    trigger: { event: "factObserved", factKey: "incidentReported" },
    conditions: [{ field: "incidentReported", operator: "equals", value: true }],
    action: { type: "requireSchema", target: "ruh" },
    priority: 100,
    affects: { schemaTypes: ["ruh"] },
  },
  {
    id: "rule_flag_unresolved_location",
    version: 1,
    effectiveFrom: "2026-01-01",
    trigger: { event: "factObserved", factKey: "locationMentioned" },
    conditions: [],
    action: { type: "flagUnresolved", target: "location" },
    priority: 50,
    affects: {},
  },
  {
    id: "rule_suggest_fuel_task",
    version: 1,
    effectiveFrom: "2026-01-01",
    trigger: { event: "factObserved", factKey: "fuelConcern" },
    conditions: [],
    action: { type: "suggestTask", target: "fuel_before_shift_end" },
    priority: 20,
    affects: { taskIds: ["fuel_before_shift_end"] },
  },
];
console.log(rules.map((r) => r.id + " (priority " + r.priority + ")").join("\n"));

// ---------------------------------------------------------------
// 4. Prompt Queue
// ---------------------------------------------------------------
section("4. Prompt Queue (prioritert, deduplisert)");

const queue = buildPromptQueue(facts, rules);
console.log(JSON.stringify(queue, null, 2));

const queueAgain = buildPromptQueue(factsAgain, rules);
console.log(
  "\nDeterminisme: buildPromptQueue() kjørt to ganger gir identisk kø:",
  JSON.stringify(queue) === JSON.stringify(queueAgain)
);

// ---------------------------------------------------------------
// 5. User
// ---------------------------------------------------------------
section("5. Bruker presenteres for neste handling");

console.log(
  "Neste (høyest prioritet):",
  queue[0].kind + " -> " + queue[0].target,
  "(fra regel " + queue[0].triggeredByRuleIds.join(", ") + ")"
);
console.log("Full rekkefølge brukeren møter:", queue.map((q) => q.kind + ":" + q.target).join(" -> "));
