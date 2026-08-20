/**
 * GUIDED FORMS — the shared model behind SJA and RUH.
 *
 * The product rule this encodes:
 *
 *   Prompten spor etter meningen. Hintet hjelper brukeren a huske detaljene.
 *   Punchout bygger skjemaet.
 *
 * and its corollary:
 *
 *   Ikke spor arbeideren om informasjon Punchout allerede kan vite sikkert.
 *
 * Pure and I/O-free. Everything here is a function of a step definition and a
 * context, which is what lets the same model drive two different forms and be
 * tested without a browser. The domain owns the progression; the UI renders a
 * projection of it.
 */

/**
 * What kind of thing a field holds, and therefore who is allowed to fill it.
 *
 * This is the safety boundary of the whole feature, so it is a closed union
 * rather than a set of booleans scattered across flows.
 */
export const INFORMATION_CLASS = /** @type {const} */ ({
  /** A — Punchout knows it. Do not spend worker attention on it. */
  SYSTEM_KNOWN: "SYSTEM_KNOWN",
  /** B — extracted from what the worker said. Propose, never assume. */
  INFERRED: "INFERRED",
  /** C — professional judgement. A machine may suggest and may never confirm. */
  HUMAN_JUDGEMENT: "HUMAN_JUDGEMENT",
});

/**
 * Where a value came from, carried alongside the value itself.
 *
 * Kept because the same string in a finished form means very different things
 * depending on who put it there, and a reviewer, an auditor or a future
 * debugging session cannot recover that distinction afterwards. Deliberately
 * descriptive only — nothing scores anyone on it.
 */
export const VALUE_ORIGIN = /** @type {const} */ ({
  SYSTEM: "SYSTEM",
  /** Punchout extracted it and the worker has not looked at it yet. */
  INFERRED_UNCONFIRMED: "INFERRED_UNCONFIRMED",
  /** Punchout extracted it and the worker said "Stemmer". */
  INFERRED_CONFIRMED: "INFERRED_CONFIRMED",
  /** The worker wrote or spoke it. */
  WORKER: "WORKER",
  /** Punchout proposed it and the worker actively selected it. */
  SUGGESTION_ACCEPTED: "SUGGESTION_ACCEPTED",
});

/**
 * A value that never counts as answered, whatever its content.
 *
 * `INFERRED_UNCONFIRMED` is the important one: an extraction the worker has not
 * seen is a proposal, and treating it as an answer is exactly how a guided form
 * would quietly fill itself in.
 */
export function isConfirmed(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return false;
  return cell.origin !== VALUE_ORIGIN.INFERRED_UNCONFIRMED;
}

/**
 * May a machine-produced value ever be marked confirmed for this field?
 *
 * Answers no for every judgement field, independently of what any flow
 * definition claims. Flows are data and can be edited by anyone; this is the
 * rule they are checked against.
 */
export function mayAutoConfirm(step) {
  return step.informationClass !== INFORMATION_CLASS.HUMAN_JUDGEMENT;
}

/**
 * Drop hint cues asking for something already known.
 *
 * Section 5 of the mission: "Known context removes unnecessary questions." A
 * hint that asks "Hvor var du?" when Punchout already has the road is not
 * merely redundant — it tells the worker that Punchout is not paying
 * attention, which is the fastest way to lose trust in every other prefill.
 *
 * Cues are dropped by the context key they depend on. A cue with no
 * dependency always survives.
 */
export function resolveHint(step, context) {
  const cues = (step.hintCues ?? []).filter((cue) => {
    if (!cue.knownWhen) return true;
    return !hasContextValue(context, cue.knownWhen);
  });

  // Three to four cues is the readable limit on a phone. Truncating rather
  // than scrolling keeps the hint cognitive support instead of a checklist.
  return cues.slice(0, 4).map((c) => c.text);
}

/** Is this context key populated with something meaningful? */
export function hasContextValue(context, key) {
  if (!context) return false;
  const value = context[key];
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/**
 * Decide whether a targeted follow-up is still worth asking.
 *
 * Section 6: "Do not ask these when the prior answer already provides the
 * information clearly." Each follow-up declares what it is fishing for, and is
 * skipped when either the answer already contains it or the context already
 * knows it.
 *
 * Deliberately keyword-based rather than clever. A follow-up asked
 * unnecessarily costs a few seconds; a follow-up skipped because a model
 * decided the answer "probably covered it" costs the fact itself.
 */
export function pendingFollowUps(step, answerText, context) {
  const text = String(answerText ?? "").toLowerCase();
  return (step.followUps ?? []).filter((f) => {
    if (f.satisfiedByContext && hasContextValue(context, f.satisfiedByContext)) return false;
    const markers = f.satisfiedWhenAnswerMentions ?? [];
    return !markers.some((m) => text.includes(m.toLowerCase()));
  });
}

/**
 * The prefill offered for a step, with its origin.
 *
 * Returns null when nothing is known — the caller then asks the question
 * outright. A prefill is never invented from a partial match: an empty prompt
 * is honest, and a wrong prefill that the worker accepts is a false record.
 */
export function resolvePrefill(step, context) {
  if (!step.prefillFrom) return null;
  if (step.informationClass === INFORMATION_CLASS.HUMAN_JUDGEMENT) return null;

  for (const key of step.prefillFrom) {
    if (!hasContextValue(context, key)) continue;
    const value = context[key];
    return {
      value: Array.isArray(value) ? value.join(", ") : value,
      sourceKey: key,
      origin:
        step.informationClass === INFORMATION_CLASS.SYSTEM_KNOWN
          ? VALUE_ORIGIN.SYSTEM
          : VALUE_ORIGIN.INFERRED_UNCONFIRMED,
    };
  }
  return null;
}

/**
 * Suggestions for a judgement step.
 *
 * Returned as proposals with no origin attached, because nothing here is a
 * value yet. They become values only when a worker selects one, and then they
 * carry SUGGESTION_ACCEPTED so a reviewer can see the difference between a risk
 * the worker thought of and a risk the worker agreed to.
 */
export function resolveSuggestions(step, context) {
  if (!step.suggest) return [];
  return step.suggest(context).filter(Boolean);
}
