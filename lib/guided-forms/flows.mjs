import { INFORMATION_CLASS } from "./model.mjs";

/**
 * The SJA and RUH flows, as data.
 *
 * Deliberately not generalized beyond what these two forms need. The mission is
 * explicit that this is not a form builder: the abstraction exists so the two
 * flows share an engine, not so a third could be authored without code.
 *
 * A step definition carries:
 *   id                  stable, persisted in domain state
 *   prompt              short and human, the meaning being asked for
 *   hintCues            cognitive support; cues drop out when already known
 *   field               the schema field it writes
 *   informationClass    who is allowed to fill it
 *   prefillFrom         context keys, in preference order
 *   suggest             proposals for judgement steps
 *   followUps           targeted questions, asked only when still useful
 *   allowsNothingToAdd  whether "no action was needed" is a real answer
 */

/** Norwegian text is written plainly; the UI layer owns presentation. */
const CUE = (text, knownWhen) => (knownWhen ? { text, knownWhen } : { text });

// ─────────────────────────────────────────────────────────────────────────────
// SJA — before the work starts. Factual reuse is aggressive; judgement is not.
// ─────────────────────────────────────────────────────────────────────────────
export const SJA_FLOW = {
  id: "sja",
  schemaType: "sja_preday",
  title: "SJA",
  steps: [
    {
      id: "sja_arbeid",
      prompt: "Hva skal du gjøre i dag?",
      hintCues: [CUE("Hvilken oppgave?"), CUE("Hvilken maskin?", "machine")],
      field: "oppgave",
      informationClass: INFORMATION_CLASS.INFERRED,
      prefillFrom: ["activity", "orderReference", "location"],
    },
    {
      id: "sja_sted",
      prompt: "Hvor skal arbeidet utføres?",
      hintCues: [CUE("Vei og kilometer?"), CUE("Noe spesielt med stedet?")],
      field: "sted",
      informationClass: INFORMATION_CLASS.INFERRED,
      prefillFrom: ["location"],
    },
    {
      id: "sja_risiko",
      prompt: "Hva kan gå galt?",
      hintCues: [
        CUE("Trafikk?"),
        CUE("Maskin og folk om hverandre?"),
        CUE("Grunnforhold eller vegkant?"),
        CUE("Sikt og vær?"),
      ],
      field: "risiko",
      informationClass: INFORMATION_CLASS.HUMAN_JUDGEMENT,
      suggest: suggestRisks,
    },
    {
      id: "sja_konsekvens",
      prompt: "Hva kan konsekvensen bli?",
      hintCues: [CUE("For folk?"), CUE("For utstyr?"), CUE("For trafikken?")],
      field: "konsekvens",
      informationClass: INFORMATION_CLASS.HUMAN_JUDGEMENT,
    },
    {
      id: "sja_tiltak",
      prompt: "Hvordan reduserer dere risikoen?",
      hintCues: [CUE("Sikring?"), CUE("Varsling?"), CUE("Samband?"), CUE("Arbeidsmåte?")],
      field: "tiltak",
      informationClass: INFORMATION_CLASS.HUMAN_JUDGEMENT,
    },
    {
      id: "sja_arbeidsvarsling",
      prompt: "Er arbeidsvarslingen på plass?",
      hintCues: [CUE("Hvilken plan gjelder?", "workWarningPlan")],
      field: "arbeidsvarsling",
      informationClass: INFORMATION_CLASS.INFERRED,
      prefillFrom: ["workWarningPlan"],
    },
    {
      id: "sja_deltakere",
      prompt: "Hvem deltar i arbeidet?",
      hintCues: [CUE("Hvor mange?"), CUE("Noen fra andre lag?")],
      field: "deltakere",
      informationClass: INFORMATION_CLASS.INFERRED,
      prefillFrom: ["crew"],
    },
  ],
};

/**
 * Risk proposals from what is already known about the work.
 *
 * Every one of these is a proposal and none is ever auto-selected — the model
 * refuses to prefill a HUMAN_JUDGEMENT field regardless of what is returned
 * here. Suggestions exist so a distracted worker is reminded, not so the form
 * fills itself.
 */
function suggestRisks(context) {
  const out = [];
  const location = String(context?.location ?? "").toLowerCase();
  const activity = String(context?.activity ?? "").toLowerCase();

  if (/rv|e\d|fv|vei|veg|km/.test(location)) {
    out.push("Trafikk tett på arbeidsområdet");
  }
  if (context?.machine) {
    out.push("Person/maskin-konflikt");
  }
  if (/grøft|grofterensk|grøfterensk|kant|skråning/.test(activity)) {
    out.push("Ustabil vegkant");
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUH — after something happened. Narrative first, structure second.
// ─────────────────────────────────────────────────────────────────────────────
export const RUH_FLOW = {
  id: "ruh",
  schemaType: "ruh",
  title: "RUH",
  steps: [
    {
      id: "ruh_hendelse",
      prompt: "Hva har skjedd?",
      /**
       * The narrative field, and the reason this flow exists.
       *
       * Section 12: do not force observations into schema fragments before the
       * worker has said what happened. This step deliberately has no prefill —
       * an incident is not something Punchout can know in advance, and
       * proposing one would be the worst possible prefill.
       *
       * Cues drop out as context fills, so a worker whose location and machine
       * are already known is asked only about the parts Punchout cannot see.
       */
      hintCues: [
        CUE("Hvor var du?", "location"),
        CUE("Hva gjorde du?", "activity"),
        CUE("Var andre involvert?"),
        CUE("Hva ble konsekvensen?"),
      ],
      field: "beskrivelse",
      informationClass: INFORMATION_CLASS.INFERRED,
      followUps: [
        {
          id: "ruh_andre_involvert",
          prompt: "Var noen andre involvert?",
          field: "andre_involvert",
          satisfiedWhenAnswerMentions: [
            "ingen andre", "alene", "kollega", "makker", "signalmann",
            "fører", "person", "folk", "vi ", "sammen med",
          ],
        },
        {
          id: "ruh_skade",
          prompt: "Ble noe skadet?",
          field: "skade",
          satisfiedWhenAnswerMentions: [
            "skade", "skadet", "bulk", "knust", "brudd", "revnet",
            "ingen skade", "uskadd", "ingen personskade",
          ],
        },
      ],
    },
    {
      id: "ruh_umiddelbare_tiltak",
      prompt: "Hva gjorde du med en gang?",
      hintCues: [
        CUE("Stanset du arbeidet?"),
        CUE("Sikret du området?"),
        CUE("Varslet du noen?"),
        CUE("Ble noe reparert eller ryddet?"),
      ],
      field: "umiddelbare_tiltak",
      informationClass: INFORMATION_CLASS.HUMAN_JUDGEMENT,
      /**
       * "Ingen tiltak var nødvendig" is a legitimate answer, and the mission
       * says so explicitly. A flow that cannot accept it teaches workers to
       * invent an action, which is worse than recording that none was needed.
       */
      allowsNothingToAdd: true,
      nothingToAddLabel: "Ingen tiltak var nødvendig",
    },
    {
      id: "ruh_arsak",
      prompt: "Hvorfor tror du dette skjedde?",
      hintCues: [
        CUE("Utstyr?"),
        CUE("Arbeidsmåte?"),
        CUE("Omgivelser?"),
        CUE("Kommunikasjon eller planlegging?"),
      ],
      field: "arsak",
      informationClass: INFORMATION_CLASS.HUMAN_JUDGEMENT,
    },
    {
      id: "ruh_forebygging",
      prompt: "Hva kan vi gjøre for å unngå dette neste gang?",
      hintCues: [
        CUE("Utstyr eller sikring?"),
        CUE("Arbeidsmåte eller plan?"),
        CUE("Opplæring?"),
      ],
      field: "tiltak",
      informationClass: INFORMATION_CLASS.HUMAN_JUDGEMENT,
    },
  ],
};

export const FLOWS = { sja: SJA_FLOW, ruh: RUH_FLOW };

/** @returns {object|null} */
export function getFlow(flowId) {
  return FLOWS[flowId] ?? null;
}
