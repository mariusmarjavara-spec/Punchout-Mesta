/**
 * deriveFacts() — illustrative, deterministic fact extraction for the
 * Phase 5 dry run. In the real system this logic lives INSIDE motor.js
 * (which already does exactly this kind of regex/keyword extraction via
 * orchestrateEntry()/detectRunningSchema() — see public/motor.js). It is
 * reimplemented here, narrowly, only because motor.js is a browser
 * global script and cannot be invoked from this Node-based dry run — the
 * technique is copied, not duplicated as a competing system: same closed
 * keyword/regex approach, same "never guess" boundary.
 *
 * Deliberately closed vocabulary, on purpose:
 *  - Number words are a fixed lookup table (1-12), not general NLP. A
 *    phrase this can't parse simply produces no `hoursWorked` fact —
 *    same class of limitation motor.js's ordre-regex already has today.
 *  - Machine detection matches against OrganizationContext.machines
 *    (real org data, Phase 3), not a hardcoded list.
 *  - Order detection reuses motor.js's own ordre pattern
 *    (\d{4,}-\d{1,4}). A road name like "RV92" does NOT match it and is
 *    surfaced as an unresolved location instead of being guessed at —
 *    the system must not invent an order number it wasn't given.
 */

const NUMBER_WORDS = {
  en: 1, ett: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6,
  sju: 7, syv: 7, atte: 8, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12,
};

const INCIDENT_KEYWORDS = ["nestenulykke", "ulykke", "skade", "uhell"];
const FUEL_KEYWORDS = ["diesel", "drivstoff"];
const ORDRE_PATTERN = /\b(\d{4,}-\d{1,4})\b/;
const LOCATION_PATTERN = /\b([A-ZÆØÅ]{1,3}\d{1,4})\b/;

/**
 * @param {string} text
 * @returns {number|null}
 */
function extractHours(text) {
  const digitMatch = text.match(/(\d+(?:[.,]\d+)?)\s*timer?/i);
  if (digitMatch) return parseFloat(digitMatch[1].replace(",", "."));
  const wordMatch = text.match(/\b(\w+)\s+timer\b/i);
  if (wordMatch && NUMBER_WORDS[wordMatch[1].toLowerCase()] !== undefined) {
    return NUMBER_WORDS[wordMatch[1].toLowerCase()];
  }
  return null;
}

/**
 * @param {import('../../hooks/use-motor-state.js').DayLog} dayLog
 * @param {import('../organization/types.mjs').OrganizationContext} orgContext
 * @returns {import('./types.mjs').Fact[]}
 */
export function deriveFacts(dayLog, orgContext) {
  /** @type {import('./types.mjs').Fact[]} */
  const facts = [];

  dayLog.entries.forEach((entry, index) => {
    const text = entry.text;
    const lower = text.toLowerCase();

    const hours = extractHours(text);
    if (hours !== null) {
      facts.push({ key: "hoursWorked", value: hours, sourceEntryIndex: index });
    }

    for (const machine of orgContext.machines) {
      if (lower.includes(machine.type.toLowerCase())) {
        facts.push({ key: "machineUsed", value: machine.type, sourceEntryIndex: index });
      }
    }

    if (INCIDENT_KEYWORDS.some((kw) => lower.includes(kw))) {
      facts.push({ key: "incidentReported", value: true, sourceEntryIndex: index });
    }

    if (FUEL_KEYWORDS.some((kw) => lower.includes(kw))) {
      facts.push({ key: "fuelConcern", value: true, sourceEntryIndex: index });
    }

    const ordreMatch = text.match(ORDRE_PATTERN);
    if (ordreMatch) {
      facts.push({ key: "orderReferenced", value: ordreMatch[1], sourceEntryIndex: index });
    } else {
      const locationMatch = text.match(LOCATION_PATTERN);
      if (locationMatch) {
        // Deliberately NOT resolved to an order — surfaced as-is so a
        // human links it, never guessed at by the engine.
        facts.push({ key: "unresolvedLocation", value: locationMatch[1], sourceEntryIndex: index });
      }
    }
  });

  return facts;
}
