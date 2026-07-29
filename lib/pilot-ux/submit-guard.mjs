/**
 * Hotfix Sprint, Hotfix 4 — the exact guard condition behind
 * operations-phase.tsx's handleSubmitEntry(), extracted so it's
 * regression-tested. Mirrors the same in-flight-guard pattern already
 * used elsewhere in that file (handleEndDay/isEnding, handleContinue/
 * isContinuing in start-day-phase.tsx, handleLock/isLocking in
 * handrens-phase.tsx) — reused, not reinvented, per the hotfix brief.
 *
 * UX & Stability Hardening Review: also reused by handleConfirmReview()/
 * handleSubmitRaw() (the structured-entry mini-review path), which had the
 * same missing guard — motor.confirmStructuredEntry()/submitEntry() both
 * push a new dayLog entry unconditionally on every call (verified in
 * public/motor.js), so two rapid taps before React re-renders could log
 * the same ordre-line twice.
 *
 * @param {boolean} isSubmitting - true while a prior submit's 500ms debounce window is still open
 * @param {string} text - the current (trimmed) input text
 * @returns {boolean} true if a new submit should be allowed to proceed
 */
export function shouldAllowSubmit(isSubmitting, text) {
  if (isSubmitting) return false;
  return text.trim().length > 0;
}
