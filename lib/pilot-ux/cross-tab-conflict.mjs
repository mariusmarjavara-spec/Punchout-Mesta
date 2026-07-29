/**
 * Hotfix Sprint, Hotfix 1 — shared constant + pure predicate so the
 * single most important invariant here (this string must exactly match
 * motor.js:6's STORAGE_KEY_CURRENT) is regression-tested, not just
 * asserted in a comment. See hooks/use-cross-tab-conflict.ts for the
 * full root-cause writeup and why this can't be imported from motor.js
 * directly (frozen, not exposed on window.Motor).
 */
export const STORAGE_KEY_CURRENT = "yournal_current_day";

/**
 * @param {string|null} eventKey - a StorageEvent's `.key` (null when e.g. localStorage.clear() fired it)
 * @returns {boolean} true if this storage event is another tab/window
 *   writing to the shared day-log — the one case this hotfix cares about.
 */
export function isCrossTabConflictEvent(eventKey) {
  return eventKey === STORAGE_KEY_CURRENT;
}
