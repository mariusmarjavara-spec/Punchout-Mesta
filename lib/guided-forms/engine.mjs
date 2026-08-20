import {
  INFORMATION_CLASS,
  VALUE_ORIGIN,
  isConfirmed,
  mayAutoConfirm,
  pendingFollowUps,
  resolveHint,
  resolvePrefill,
  resolveSuggestions,
} from "./model.mjs";
import { getFlow } from "./flows.mjs";

/**
 * The guided-form state machine.
 *
 * Pure: every function takes state and returns new state. The state object is
 * plain JSON so it can live in `dayLog` and survive a refresh, a backgrounded
 * tab and an offline period without any of it depending on the UI being alive.
 *
 * Section 17 of the mission, made structural: "Persist domain progress, not
 * merely animation/UI state." The step index lives here. A UI that animates
 * between prompts is rendering this; it is never the source of truth for it.
 */

export const GUIDED_FORM_STATE_VERSION = 1;

/**
 * Start a guided form.
 *
 * The context is captured ONCE, at open. Re-reading it mid-flow would let a
 * later entry silently change a prompt the worker is halfway through
 * answering.
 */
export function startGuidedForm(flowId, context, options = {}) {
  const flow = getFlow(flowId);
  if (!flow) return null;
  return {
    version: GUIDED_FORM_STATE_VERSION,
    flowId,
    schemaId: options.schemaId ?? null,
    startedAt: options.now ?? new Date().toISOString(),
    stepIndex: 0,
    /** followUpQueue holds targeted questions raised by the answer just given. */
    followUpQueue: [],
    /** field -> { value, origin, at } */
    answers: {},
    context: context ?? {},
    completedAt: null,
  };
}

/** The step the worker should be looking at, or null when the flow is done. */
export function currentStep(state) {
  if (!state || state.completedAt) return null;
  const flow = getFlow(state.flowId);
  if (!flow) return null;

  // A follow-up outranks the next main step: it exists because the answer just
  // given left a gap, and asking it later would have lost the thread.
  if (state.followUpQueue.length > 0) {
    const pending = state.followUpQueue[0];
    return {
      ...pending,
      isFollowUp: true,
      informationClass: INFORMATION_CLASS.INFERRED,
      hint: [],
      prefill: null,
      suggestions: [],
      progress: progressOf(state, flow),
    };
  }

  const step = flow.steps[state.stepIndex];
  if (!step) return null;

  const existing = state.answers[step.field];
  return {
    ...step,
    isFollowUp: false,
    hint: resolveHint(step, state.context),
    prefill: isConfirmed(existing) ? null : resolvePrefill(step, state.context),
    suggestions: resolveSuggestions(step, state.context),
    currentValue: existing?.value ?? null,
    progress: progressOf(state, flow),
  };
}

function progressOf(state, flow) {
  return {
    step: Math.min(state.stepIndex + 1, flow.steps.length),
    total: flow.steps.length,
    // Follow-ups are excluded from the denominator on purpose: a progress bar
    // that grows while the worker answers would read as punishment for
    // giving detail.
    pendingFollowUps: state.followUpQueue.length,
  };
}

function record(state, field, value, origin, now) {
  return {
    ...state,
    answers: {
      ...state.answers,
      [field]: { value, origin, at: now ?? new Date().toISOString() },
    },
  };
}

/**
 * The worker typed or spoke an answer.
 *
 * Always WORKER origin, whatever the modality. Section 14: voice and text are
 * input methods, not workflows — a transcript reaching this function is
 * indistinguishable from typing, which is what makes the equivalence invariant
 * true by construction rather than by parallel code paths kept in sync.
 */
export function answerStep(state, value, options = {}) {
  const step = currentStep(state);
  if (!step) return state;
  const now = options.now;

  if (step.isFollowUp) {
    const next = record(state, step.field, value, VALUE_ORIGIN.WORKER, now);
    return advance({ ...next, followUpQueue: next.followUpQueue.slice(1) });
  }

  const answered = record(state, step.field, value, VALUE_ORIGIN.WORKER, now);
  const flow = getFlow(state.flowId);
  const definition = flow.steps[state.stepIndex];
  const queue = pendingFollowUps(definition, value, state.context);
  return advance({ ...answered, followUpQueue: queue });
}

/**
 * The worker pressed "Stemmer" on a prefill.
 *
 * The origin changes from INFERRED_UNCONFIRMED to INFERRED_CONFIRMED — the
 * value is identical and its standing is not. That distinction is the entire
 * point of showing "Punchout oppfattet: ..." rather than silently filling the
 * field.
 */
export function acceptPrefill(state, options = {}) {
  const step = currentStep(state);
  if (!step || !step.prefill) return state;
  if (!mayAutoConfirm(step)) return state;

  const origin =
    step.prefill.origin === VALUE_ORIGIN.SYSTEM
      ? VALUE_ORIGIN.SYSTEM
      : VALUE_ORIGIN.INFERRED_CONFIRMED;

  return advance(record(state, step.field, step.prefill.value, origin, options.now));
}

/**
 * The worker selected proposed suggestions on a judgement step.
 *
 * SUGGESTION_ACCEPTED, never INFERRED_CONFIRMED: a risk the worker agreed to is
 * a different fact from a risk the worker thought of, and a reviewer should be
 * able to tell them apart.
 */
export function acceptSuggestions(state, selected, options = {}) {
  const step = currentStep(state);
  if (!step || step.isFollowUp) return state;
  const chosen = (selected ?? []).filter(Boolean);
  if (chosen.length === 0) return state;
  return advance(
    record(state, step.field, chosen.join(" · "), VALUE_ORIGIN.SUGGESTION_ACCEPTED, options.now),
  );
}

/** "Ingen tiltak var nødvendig" — a real answer, not a skip. */
export function answerNothingToAdd(state, options = {}) {
  const step = currentStep(state);
  if (!step || !step.allowsNothingToAdd) return state;
  return answerStep(state, step.nothingToAddLabel, options);
}

/**
 * Go back one step.
 *
 * Any queued follow-ups are dropped: they were raised by an answer the worker
 * is now revisiting, and asking them about a superseded answer would be
 * incoherent. They are recomputed when the new answer is given.
 */
export function goBack(state) {
  if (!state) return state;
  if (state.followUpQueue.length > 0) return { ...state, followUpQueue: [] };
  if (state.stepIndex === 0) return state;
  return { ...state, stepIndex: state.stepIndex - 1, completedAt: null };
}

/**
 * Re-answer an earlier step by id.
 *
 * Section 18: a correction must not leave stale downstream values derived from
 * the answer that changed. Dependent follow-up answers are cleared, because a
 * "was anyone else involved?" answer belongs to the narrative that prompted it.
 */
export function reviseStep(state, stepId) {
  const flow = getFlow(state.flowId);
  if (!flow) return state;
  const index = flow.steps.findIndex((s) => s.id === stepId);
  if (index === -1) return state;

  const definition = flow.steps[index];
  const answers = { ...state.answers };
  for (const f of definition.followUps ?? []) delete answers[f.field];

  return { ...state, stepIndex: index, followUpQueue: [], answers, completedAt: null };
}

function advance(state) {
  if (state.followUpQueue.length > 0) return state;
  const flow = getFlow(state.flowId);
  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= flow.steps.length) {
    return { ...state, stepIndex: flow.steps.length, completedAt: null };
  }
  return { ...state, stepIndex: nextIndex };
}

/** Every step answered and no follow-up outstanding. */
export function isReadyForReview(state) {
  const flow = getFlow(state?.flowId);
  if (!flow) return false;
  if (state.followUpQueue.length > 0) return false;
  return flow.steps.every((s) => isConfirmed(state.answers[s.field]));
}

/**
 * The compact review, grouped so a worker sees their own words separately from
 * what Punchout worked out.
 *
 * Section 19: system-known metadata is collapsed into ONE surface rather than
 * demanding a press per fact. Twelve confirmations is how automation turns into
 * a chore.
 */
export function reviewSummary(state) {
  const flow = getFlow(state?.flowId);
  if (!flow) return null;

  const authored = [];
  const derived = [];

  for (const step of flow.steps) {
    const cell = state.answers[step.field];
    if (!cell || cell.value === null) continue;
    const row = { stepId: step.id, label: step.prompt, value: cell.value, origin: cell.origin };
    if (
      cell.origin === VALUE_ORIGIN.WORKER ||
      cell.origin === VALUE_ORIGIN.SUGGESTION_ACCEPTED ||
      step.informationClass === INFORMATION_CLASS.HUMAN_JUDGEMENT
    ) {
      authored.push(row);
    } else {
      derived.push(row);
    }
  }

  // Follow-up answers are the worker's own words too.
  for (const step of flow.steps) {
    for (const f of step.followUps ?? []) {
      const cell = state.answers[f.field];
      if (cell && cell.value !== null) {
        authored.push({ stepId: f.id, label: f.prompt, value: cell.value, origin: cell.origin });
      }
    }
  }

  return {
    flowId: state.flowId,
    title: flow.title,
    authored,
    derived,
    /** Grouped, single-surface metadata — one confirmation, not one per fact. */
    systemKnown: collectSystemKnown(state.context),
    readyForReview: isReadyForReview(state),
  };
}

const SYSTEM_KNOWN_KEYS = [
  ["time", "Tid"],
  ["date", "Dato"],
  ["location", "Sted"],
  ["activity", "Oppgave"],
  ["machine", "Maskin"],
  ["orderReference", "Ordre"],
  ["organizationName", "Kontrakt"],
  ["userId", "Arbeidstaker"],
];

function collectSystemKnown(context) {
  const out = [];
  for (const [key, label] of SYSTEM_KNOWN_KEYS) {
    const value = context?.[key];
    if (value === null || value === undefined || value === "") continue;
    out.push({ key, label, value: Array.isArray(value) ? value.join(", ") : value });
  }
  return out;
}

/**
 * The schema fields this form has produced, ready to be written to the
 * underlying schema instance.
 *
 * Only confirmed cells cross this boundary. An unconfirmed inference is a
 * proposal and has no business in a stored operational record.
 */
export function toSchemaFields(state) {
  const fields = {};
  for (const [field, cell] of Object.entries(state?.answers ?? {})) {
    if (isConfirmed(cell)) fields[field] = cell.value;
  }
  return fields;
}

/** Origin per field, kept alongside the values for later auditing. */
export function toFieldProvenance(state) {
  const provenance = {};
  for (const [field, cell] of Object.entries(state?.answers ?? {})) {
    if (isConfirmed(cell)) provenance[field] = { origin: cell.origin, at: cell.at };
  }
  return provenance;
}
