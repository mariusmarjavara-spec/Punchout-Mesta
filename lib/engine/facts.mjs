/**
 * Fact Engine — deterministic extraction only (regex, closed lookup
 * tables, org-scoped keyword matching). No AI, no probability.
 *
 * Extractors are swappable units (lib/observation/types.mjs): each one
 * independently turns an Observation into zero or more Facts. Adding,
 * removing, or replacing an extractor never touches another extractor
 * or the rule engine downstream — only Facts cross that boundary.
 *
 * `machineUsed` reuses motor.js's own extractRessurser() technique
 * (org-scoped keyword list), not a competing implementation — this
 * module exists standalone only because motor.js can't run outside a
 * browser for these Node-based dry runs; public/motor.js has its own
 * native port of the same extractors for real use (Phase 6.5).
 */

const NUMBER_WORDS = {
  en: 1, ett: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6,
  sju: 7, syv: 7, atte: 8, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12,
};

/**
 * Phase 8 audit finding, revised after the Nordhavn acceptance test
 * actually failed on it: ORDRE_PATTERN/LOCATION_PATTERN/VEHICLE_PATTERN
 * AND INCIDENT_KEYWORDS/FUEL_KEYWORDS were all hardcoded to Mesta's
 * vocabulary. The first commit here judged the keyword lists "closed
 * Norwegian-language vocabulary, not organization-specific" and left
 * them hardcoded — wrong: Nordhavn's domain says "avvik", not
 * "nestenulykke"/"ulykke", so rule_avvik_on_incident silently never
 * fired against a real acceptance-test observation. Different
 * industries use different incident/concern words even in the same
 * language; this is organization vocabulary, not grammar. All five are
 * now Runtime-configurable via deriveFacts()'s third argument, all
 * still defaulting to these exact values so every existing caller
 * (every prior phase's dry run) is unaffected.
 */
const DEFAULT_PATTERNS = {
  ordre: "\\b(\\d{4,}-\\d{1,4})\\b",
  location: "\\b([A-ZÆØÅ]{1,3}\\d{1,4})\\b",
  vehicle: "\\b([A-ZÆØÅ]{2}\\s?\\d{4,5})\\b",
};
const DEFAULT_VOCABULARIES = {
  incidentKeywords: ["nestenulykke", "ulykke", "skade", "uhell"],
  fuelKeywords: ["diesel", "drivstoff"],
};

function extractHours(text) {
  const digitMatch = text.match(/(\d+(?:[.,]\d+)?)\s*timer?/i);
  if (digitMatch) return parseFloat(digitMatch[1].replace(",", "."));
  const wordMatch = text.match(/\b(\w+)\s+timer\b/i);
  const n = wordMatch && NUMBER_WORDS[wordMatch[1].toLowerCase()];
  return n !== undefined ? n : null;
}

/** @type {import('../observation/types.mjs').Extractor[]} */
export const EXTRACTORS = [
  {
    key: "hoursWorked",
    extract: (obs) => {
      const h = extractHours(obs.raw);
      return h === null ? [] : [{ key: "hoursWorked", value: h, sourceEntryIndex: obs.sourceEntryIndex }];
    },
  },
  {
    key: "machineUsed",
    extract: (obs, refData) => {
      const lower = obs.raw.toLowerCase();
      const machines = /** @type {{type:string}[]} */ (refData.machines || []);
      return machines
        .filter((m) => lower.includes(m.type.toLowerCase()))
        .map((m) => ({ key: "machineUsed", value: m.type, sourceEntryIndex: obs.sourceEntryIndex }));
    },
  },
  {
    key: "incidentReported",
    extract: (obs, refData) => {
      const lower = obs.raw.toLowerCase();
      return refData.vocabularies.incidentKeywords.some((k) => lower.includes(k))
        ? [{ key: "incidentReported", value: true, sourceEntryIndex: obs.sourceEntryIndex }]
        : [];
    },
  },
  {
    key: "fuelConcern",
    extract: (obs, refData) => {
      const lower = obs.raw.toLowerCase();
      return refData.vocabularies.fuelKeywords.some((k) => lower.includes(k))
        ? [{ key: "fuelConcern", value: true, sourceEntryIndex: obs.sourceEntryIndex }]
        : [];
    },
  },
  {
    // Order match takes precedence; a location-shaped token ("RV92") is
    // never guessed at as an order — surfaced separately, unresolved.
    key: "orderOrLocation",
    extract: (obs, refData) => {
      const ordreMatch = obs.raw.match(new RegExp(refData.patterns.ordre));
      if (ordreMatch) return [{ key: "orderCandidate", value: ordreMatch[1], sourceEntryIndex: obs.sourceEntryIndex }];
      const locationMatch = obs.raw.match(new RegExp(refData.patterns.location));
      return locationMatch
        ? [{ key: "locationMentioned", value: locationMatch[1], sourceEntryIndex: obs.sourceEntryIndex }]
        : [];
    },
  },
  {
    key: "vehicleCandidate",
    extract: (obs, refData) => {
      const m = obs.raw.match(new RegExp(refData.patterns.vehicle));
      return m ? [{ key: "vehicleCandidate", value: m[1], sourceEntryIndex: obs.sourceEntryIndex }] : [];
    },
  },
];

/**
 * @param {import('../../hooks/use-motor-state.js').DayLog} dayLog
 * @param {import('../organization/types.mjs').OrganizationContext} orgContext
 * @param {{ordre?:string, location?:string, vehicle?:string}} [extractionPatterns]  - Runtime-supplied regex sources; defaults to Mesta's shape for backward compatibility
 * @param {{incidentKeywords?:string[], fuelKeywords?:string[]}} [extractionVocabularies]  - Runtime-supplied keyword lists; defaults to Mesta's vocabulary for backward compatibility
 * @returns {import('./types.mjs').Fact[]}
 */
export function deriveFacts(dayLog, orgContext, extractionPatterns = {}, extractionVocabularies = {}) {
  const observations = dayLog.entries.map((e, index) => ({
    id: "obs_" + index,
    source: "text",
    raw: e.text,
    capturedAt: e.time,
    sourceEntryIndex: index,
  }));
  const refData = {
    machines: orgContext.machines,
    patterns: { ...DEFAULT_PATTERNS, ...extractionPatterns },
    vocabularies: { ...DEFAULT_VOCABULARIES, ...extractionVocabularies },
  };
  return observations.flatMap((obs) => EXTRACTORS.flatMap((ex) => ex.extract(obs, refData)));
}
