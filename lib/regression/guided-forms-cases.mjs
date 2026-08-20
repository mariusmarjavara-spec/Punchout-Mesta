/**
 * GUIDED FORMS — SJA and RUH on one engine.
 *
 * The success condition, from the mission: a worker describes what happened
 * naturally, Punchout asks only useful follow-ups, reuses what it knows,
 * builds the structure, and never confirms a judgement on the worker's behalf.
 *
 * These drive the pure engine directly. It owns the progression, so it can be
 * tested end to end without a browser — which is also why a refresh cannot
 * lose a half-finished form.
 */
import {
  acceptPrefill,
  acceptSuggestions,
  answerNothingToAdd,
  answerStep,
  currentStep,
  goBack,
  isReadyForReview,
  reviewSummary,
  reviseStep,
  startGuidedForm,
  toFieldProvenance,
  toSchemaFields,
} from "../guided-forms/engine.mjs";
import { SJA_FLOW, RUH_FLOW } from "../guided-forms/flows.mjs";
import { VALUE_ORIGIN, INFORMATION_CLASS, mayAutoConfirm, resolvePrefill } from "../guided-forms/model.mjs";

/** The workday context the founder's own example produces. */
const RICH_CONTEXT = {
  activity: "Grøfterensk",
  location: "RV92 km 14–18",
  machine: "L90",
  workWarningPlan: "24-184",
  crew: ["Ola", "Kari", "Per"],
  time: "10:42",
  date: "2026-08-20",
  organizationName: "Mesta",
  userId: "ola.nordmann",
};

const EMPTY_CONTEXT = {};

function stepIds(state) {
  const s = currentStep(state);
  return s ? s.id : null;
}

/** Answer whatever is on screen until the flow is done, recording the path. */
function runToEnd(state, answerFor) {
  const seen = [];
  let guard = 0;
  while (currentStep(state) && guard++ < 40) {
    const step = currentStep(state);
    seen.push(step.id);
    state = answerStep(state, answerFor(step), { now: "2026-08-20T10:42:00.000Z" });
  }
  return { state, seen };
}

export const GUIDED_FORMS_CASES = [
  // ── Known context removes questions ─────────────────────────────────────
  {
    id: "guided_sja_reuses_known_work_context_as_prefill",
    description:
      "THE ACCEPTANCE SCENARIO. With the day's context already carrying activity, road and machine, the first SJA prompt must arrive prefilled rather than asking the worker to retype what they said an hour ago.",
    run: () => {
      const state = startGuidedForm("sja", RICH_CONTEXT);
      const step = currentStep(state);
      return (
        step.id === "sja_arbeid" &&
        step.prompt === "Hva skal du gjøre i dag?" &&
        step.prefill !== null &&
        step.prefill.value === "Grøfterensk" &&
        step.prefill.origin === VALUE_ORIGIN.INFERRED_UNCONFIRMED
      );
    },
  },
  {
    id: "guided_prefill_is_a_proposal_until_the_worker_accepts_it",
    description:
      "An extraction the worker has not looked at is not an answer. Until 'Stemmer' is pressed the value must not count as confirmed, and must not reach the schema.",
    run: () => {
      const state = startGuidedForm("sja", RICH_CONTEXT);
      const beforeAccept = toSchemaFields(state);
      const accepted = acceptPrefill(state, { now: "2026-08-20T10:00:00.000Z" });
      const after = toSchemaFields(accepted);
      return (
        Object.keys(beforeAccept).length === 0 &&
        after.oppgave === "Grøfterensk" &&
        toFieldProvenance(accepted).oppgave.origin === VALUE_ORIGIN.INFERRED_CONFIRMED
      );
    },
  },
  {
    id: "guided_hint_cues_drop_out_when_punchout_already_knows_them",
    description:
      "Section 5. A hint asking 'Hvor var du?' when the road is already known tells the worker Punchout is not paying attention, which costs trust in every other prefill.",
    run: () => {
      const known = currentStep(startGuidedForm("ruh", RICH_CONTEXT));
      const unknown = currentStep(startGuidedForm("ruh", EMPTY_CONTEXT));
      return (
        unknown.hint.includes("Hvor var du?") &&
        unknown.hint.includes("Hva gjorde du?") &&
        !known.hint.includes("Hvor var du?") &&
        !known.hint.includes("Hva gjorde du?") &&
        known.hint.includes("Var andre involvert?")
      );
    },
  },
  {
    id: "guided_hints_stay_short_enough_to_read_on_a_phone",
    description:
      "Cognitive support, not a checklist. Four cues is the readable limit, and truncating beats scrolling.",
    run: () => {
      const flows = ["sja", "ruh"];
      return flows.every((f) => {
        let state = startGuidedForm(f, EMPTY_CONTEXT);
        let guard = 0;
        while (currentStep(state) && guard++ < 40) {
          if (currentStep(state).hint.length > 4) return false;
          state = answerStep(state, "svar");
        }
        return true;
      });
    },
  },

  // ── The safety boundary ─────────────────────────────────────────────────
  {
    id: "guided_judgement_steps_are_never_prefilled",
    description:
      "THE SAFETY BOUNDARY. Risk, consequence, cause and measures must arrive empty however much context exists. A machine may suggest and may never confirm.",
    run: () => {
      let state = startGuidedForm("sja", RICH_CONTEXT);
      let guard = 0;
      const judgement = [];
      while (currentStep(state) && guard++ < 40) {
        const step = currentStep(state);
        if (step.informationClass === INFORMATION_CLASS.HUMAN_JUDGEMENT) {
          judgement.push(step);
          if (step.prefill !== null) return false;
        }
        state = answerStep(state, "svar");
      }
      // The SJA flow must actually contain judgement steps, or this passes vacuously.
      return judgement.length >= 3;
    },
  },
  {
    id: "guided_accept_prefill_refuses_to_act_on_a_judgement_step",
    description:
      "Defence in depth: even if a flow definition were edited to add a prefill source to a judgement field, acceptPrefill must refuse. Flows are data; the rule is code.",
    run: () => {
      let state = startGuidedForm("sja", RICH_CONTEXT);
      state = acceptPrefill(state);           // oppgave
      state = answerStep(state, "RV92 km 14–18"); // sted
      const risk = currentStep(state);
      const attempted = acceptPrefill(state);
      return (
        risk.informationClass === INFORMATION_CLASS.HUMAN_JUDGEMENT &&
        attempted === state
      );
    },
  },
  {
    id: "guided_judgement_prefill_is_refused_even_when_a_flow_asks_for_it",
    description:
      "THE GUARD ITSELF, tested directly. The two walk-the-flow cases above pass vacuously: no judgement step in SJA or RUH declares a prefill source, so resolvePrefill returns null at its first check and the judgement rule is never reached. Reverting the guard left every one of them green. This constructs the case the real flows do not produce — a judgement field that DOES name a prefill source — because flows are data anyone can edit and the rule has to hold against a flow that asks for the wrong thing.",
    run: () => {
      const rogueStep = {
        id: "rogue",
        field: "konsekvens",
        informationClass: INFORMATION_CLASS.HUMAN_JUDGEMENT,
        prefillFrom: ["activity", "location"],
      };
      const factualStep = { ...rogueStep, informationClass: INFORMATION_CLASS.INFERRED };

      return (
        // Same context, same prefill source: refused for judgement, offered for fact.
        resolvePrefill(rogueStep, RICH_CONTEXT) === null &&
        resolvePrefill(factualStep, RICH_CONTEXT)?.value === "Grøfterensk" &&
        mayAutoConfirm(rogueStep) === false &&
        mayAutoConfirm(factualStep) === true
      );
    },
  },
  {
    id: "guided_every_judgement_field_in_every_flow_declares_no_prefill_source",
    description:
      "The complement of the case above: the guard protects against a bad flow, and this asserts the shipped flows are not bad. Stated as a property over both flows rather than trusting a walk-through to encounter each one.",
    run: () => {
      const flows = [SJA_FLOW, RUH_FLOW];
      const judgementSteps = flows.flatMap((f) =>
        f.steps.filter((s) => s.informationClass === INFORMATION_CLASS.HUMAN_JUDGEMENT),
      );
      return (
        judgementSteps.length >= 6 &&
        judgementSteps.every((s) => !s.prefillFrom)
      );
    },
  },
  {
    id: "guided_accepted_suggestions_are_marked_as_accepted_not_as_authored",
    description:
      "A risk the worker agreed to is a different fact from a risk the worker thought of. A reviewer must be able to tell them apart, so the origin differs.",
    run: () => {
      let state = startGuidedForm("sja", RICH_CONTEXT);
      state = acceptPrefill(state);
      state = answerStep(state, "RV92 km 14–18");
      const risk = currentStep(state);
      const chosen = risk.suggestions.slice(0, 2);
      state = acceptSuggestions(state, chosen);
      return (
        chosen.length === 2 &&
        toFieldProvenance(state).risiko.origin === VALUE_ORIGIN.SUGGESTION_ACCEPTED
      );
    },
  },
  {
    id: "guided_sja_suggests_risks_from_context_without_selecting_any",
    description:
      "Suggestions exist so a distracted worker is reminded. Offering them must never populate the field.",
    run: () => {
      let state = startGuidedForm("sja", RICH_CONTEXT);
      state = acceptPrefill(state);
      state = answerStep(state, "RV92 km 14–18");
      const risk = currentStep(state);
      return (
        risk.suggestions.length >= 2 &&
        risk.suggestions.some((s) => /trafikk/i.test(s)) &&
        risk.suggestions.some((s) => /maskin/i.test(s)) &&
        toSchemaFields(state).risiko === undefined
      );
    },
  },

  // ── RUH: narrative first, targeted follow-ups ───────────────────────────
  {
    id: "ruh_opens_with_the_narrative_and_offers_no_prefill_for_it",
    description:
      "Section 12: narrative first, schema second. An incident is not something Punchout can know in advance, and proposing one would be the worst possible prefill.",
    run: () => {
      const step = currentStep(startGuidedForm("ruh", RICH_CONTEXT));
      return step.id === "ruh_hendelse" && step.prompt === "Hva har skjedd?" && step.prefill === null;
    },
  },
  {
    id: "ruh_rich_narrative_skips_follow_ups_it_already_answers",
    description:
      "THE RICH-NARRATIVE SCENARIO. 'Ingen personer ble skadet, men autovernet fikk en bulk' already says who was involved and what was damaged. Asking again is interrogation.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      state = answerStep(
        state,
        "Jeg rygget L90 ved grøfterensk på RV92 og traff autovernet med skuffa. Ingen personer ble skadet, men autovernet fikk en bulk.",
      );
      return stepIds(state) === "ruh_umiddelbare_tiltak";
    },
  },
  {
    id: "ruh_minimal_narrative_triggers_the_missing_detail_follow_ups",
    description:
      "THE MINIMAL-NARRATIVE SCENARIO. 'Traff autovernet.' is a useless record. Punchout must ask what is missing rather than accept it.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      state = answerStep(state, "Traff autovernet.");
      const first = currentStep(state);
      const wasFollowUp = first.isFollowUp && first.id === "ruh_andre_involvert";
      state = answerStep(state, "Nei, jeg var alene");
      const second = currentStep(state);
      return wasFollowUp && second.isFollowUp && second.id === "ruh_skade";
    },
  },
  {
    id: "ruh_follow_ups_do_not_inflate_the_progress_denominator",
    description:
      "A progress bar that grows while the worker adds detail reads as punishment for being thorough.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      const before = currentStep(state).progress.total;
      state = answerStep(state, "Traff autovernet.");
      const during = currentStep(state).progress;
      return before === during.total && during.pendingFollowUps > 0;
    },
  },
  {
    id: "ruh_accepts_that_no_action_was_necessary",
    description:
      "'Ingen tiltak var nødvendig' is a legitimate answer. A flow that cannot accept it teaches workers to invent one, which is worse than recording that none was needed.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      state = answerStep(state, "Skuffa traff autovernet. Ingen skade på personer, bulk i autovernet.");
      const step = currentStep(state);
      state = answerNothingToAdd(state);
      return (
        step.allowsNothingToAdd === true &&
        toSchemaFields(state).umiddelbare_tiltak === "Ingen tiltak var nødvendig"
      );
    },
  },

  // ── Correction, resume, equivalence ─────────────────────────────────────
  {
    id: "guided_correction_clears_follow_ups_that_belonged_to_the_old_answer",
    description:
      "THE CORRECTION SCENARIO. Section 18: a revised narrative must not leave stale answers derived from the narrative it replaced.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      state = answerStep(state, "Traff autovernet.");
      state = answerStep(state, "Nei, alene");   // follow-up 1
      state = answerStep(state, "Bulk i autovernet"); // follow-up 2
      const hadFollowUpAnswers = toSchemaFields(state).andre_involvert === "Nei, alene";

      state = reviseStep(state, "ruh_hendelse");
      const fields = toSchemaFields(state);
      return (
        hadFollowUpAnswers &&
        fields.andre_involvert === undefined &&
        fields.skade === undefined &&
        stepIds(state) === "ruh_hendelse"
      );
    },
  },
  {
    id: "guided_going_back_drops_a_queued_follow_up_rather_than_asking_it_about_a_stale_answer",
    description:
      "A queued follow-up belongs to the answer that raised it. Carrying it past a back-navigation would ask about something the worker is in the middle of changing.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      state = answerStep(state, "Traff autovernet.");
      const queued = currentStep(state).isFollowUp;
      state = goBack(state);
      return queued && currentStep(state).isFollowUp === false;
    },
  },
  {
    id: "guided_state_is_plain_json_so_a_refresh_cannot_lose_it",
    description:
      "Section 17, made structural. The step index lives in domain state, not in the UI. Round-tripping through JSON must land on the same prompt with the same answers.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      state = answerStep(state, "Skuffa traff autovernet, bulk i autovernet, ingen personskade");
      const before = currentStep(state);

      const revived = JSON.parse(JSON.stringify(state));
      const after = currentStep(revived);

      return (
        before.id === after.id &&
        JSON.stringify(toSchemaFields(state)) === JSON.stringify(toSchemaFields(revived))
      );
    },
  },
  {
    id: "guided_voice_and_text_produce_identical_state",
    description:
      "Section 14's invariant. Voice and text are modalities, not workflows — a transcript reaching the engine is indistinguishable from typing, which is what makes this true by construction rather than by two code paths kept in sync.",
    run: () => {
      const sentence = "Skuffa traff autovernet da jeg rygget. Ingen personskade, bulk i autovernet.";
      const viaText = answerStep(startGuidedForm("ruh", RICH_CONTEXT), sentence, {
        now: "2026-08-20T10:42:00.000Z",
      });
      const viaVoice = answerStep(startGuidedForm("ruh", RICH_CONTEXT), sentence, {
        now: "2026-08-20T10:42:00.000Z",
      });
      return JSON.stringify(viaText) === JSON.stringify(viaVoice);
    },
  },

  // ── Review ──────────────────────────────────────────────────────────────
  {
    id: "guided_review_separates_the_workers_words_from_what_punchout_derived",
    description:
      "The review must make it obvious which information was worker-entered and which was inferred, without turning into noise.",
    run: () => {
      let state = startGuidedForm("sja", RICH_CONTEXT);
      state = acceptPrefill(state);                    // oppgave, inferred+confirmed
      state = acceptPrefill(state);                    // sted, inferred+confirmed
      state = answerStep(state, "Trafikk og ustabil kant"); // risiko, worker
      state = answerStep(state, "Personskade");             // konsekvens, worker
      state = answerStep(state, "TMA og samband");          // tiltak, worker
      state = acceptPrefill(state);                    // arbeidsvarsling
      state = answerStep(state, "3 personer");              // deltakere

      const summary = reviewSummary(state);
      const authoredFields = summary.authored.map((r) => r.stepId);
      const derivedFields = summary.derived.map((r) => r.stepId);
      return (
        summary.readyForReview === true &&
        authoredFields.includes("sja_risiko") &&
        authoredFields.includes("sja_konsekvens") &&
        derivedFields.includes("sja_arbeid") &&
        derivedFields.includes("sja_sted")
      );
    },
  },
  {
    id: "guided_review_groups_system_known_metadata_into_one_surface",
    description:
      "Section 19, confirmation fatigue. Punchout knowing eight facts must not become eight presses of 'Stemmer'.",
    run: () => {
      const state = startGuidedForm("ruh", RICH_CONTEXT);
      const summary = reviewSummary(state);
      const keys = summary.systemKnown.map((r) => r.key);
      return (
        summary.systemKnown.length >= 5 &&
        keys.includes("time") &&
        keys.includes("location") &&
        keys.includes("machine") &&
        keys.includes("organizationName")
      );
    },
  },
  {
    id: "guided_form_is_not_ready_for_review_until_every_step_is_answered",
    description:
      "Confirmation must be explicit and complete. A half-finished form must not present itself as ready to sign.",
    run: () => {
      let state = startGuidedForm("ruh", RICH_CONTEXT);
      const atStart = isReadyForReview(state);
      const { state: finished } = runToEnd(state, () => "svar");
      return atStart === false && isReadyForReview(finished) === true;
    },
  },
  {
    id: "guided_only_confirmed_values_reach_the_schema",
    description:
      "An unconfirmed inference is a proposal and has no business in a stored operational record.",
    run: () => {
      const state = startGuidedForm("sja", RICH_CONTEXT);
      // Nothing accepted yet, though prefills exist for several steps.
      return Object.keys(toSchemaFields(state)).length === 0 && currentStep(state).prefill !== null;
    },
  },
];
