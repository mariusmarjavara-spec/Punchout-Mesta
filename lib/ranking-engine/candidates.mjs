/**
 * Candidate generation — deliberately NOT part of the Ranking Engine
 * (lib/ranking-engine/score.mjs). Del 1: "Ranking Engine skal aldri
 * opprette kandidater. Kun rangere eksisterende." Something has to
 * produce the list first; this file is that something, kept in its own
 * module so the boundary is visible in the file structure, not just
 * asserted in a comment.
 *
 * Deterministic token overlap — no fuzzy/statistical string similarity,
 * no learned weights. Splits into alpha and digit runs separately so
 * "RV92" ([rv, 92]) and "Riksvei 92" ([riksvei, 92]) can share the "92"
 * token even though neither contains the other as a substring.
 */

/** @param {string} text @returns {string[]} */
function tokenize(text) {
  return (text.toLowerCase().match(/[a-zæøå]+|\d+/g)) || [];
}

/** @param {string} originalValue @param {string} candidateValue @returns {number} 0-100 */
export function baseMatchScore(originalValue, candidateValue) {
  const a = tokenize(originalValue);
  const b = tokenize(candidateValue);
  if (a.length === 0) return 0;
  const overlap = a.filter((t) => b.includes(t)).length;
  return Math.round((overlap / a.length) * 100);
}

/**
 * @param {string} originalValue
 * @param {string[]} knownValues
 * @returns {{value: string, baseMatch: number}[]}
 */
export function generateCandidates(originalValue, knownValues) {
  return knownValues.map((value) => ({ value, baseMatch: baseMatchScore(originalValue, value) }));
}
