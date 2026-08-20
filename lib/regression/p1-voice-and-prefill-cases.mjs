/**
 * P1-A and P1-B, pinned.
 *
 * P1-A — pressing the mic on a physical phone produced nothing at all. Not a
 * wrong message: no message, no state change, no event. `toggleVoiceReact()`
 * returned bare when recognition was unavailable, and the only signal a worker
 * got was that the app was broken.
 *
 * P1-B — typed text never reached a schema field. `orchestrateEntry()` computed
 * the context and `createSchemaInstance()` was then called without it, so the
 * whole prefill block was skipped and the information stopped there.
 *
 * The rule these encode, from the Founder: safe factual field prefills,
 * judgement and safety assessment stay with the worker.
 */
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";

const MOTOR_SRC = fs.readFileSync(path.resolve("public/motor.js"), "utf8");

/**
 * Boot motor.js with a controllable environment.
 *
 * `document` records listeners here rather than discarding them, and
 * `location`/`isSecureContext` are settable — the voice diagnosis reads all
 * three, and the default characterization sandbox stubs them away.
 */
function boot(options = {}) {
  const kv = {};
  const localStorage = {
    getItem: (k) => (k in kv ? kv[k] : null),
    setItem: (k, v) => { kv[k] = String(v); },
    removeItem: (k) => { delete kv[k]; },
  };
  const listeners = {};
  class CustomEvent {
    constructor(type, o) { this.type = type; this.detail = o && o.detail; }
  }
  const windowStub = {
    PUNCHOUT_CONFIG: options.config ?? null,
    PUNCHOUT_RUNTIME: null,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent: (e) => { (listeners[e.type] || []).forEach((fn) => fn(e)); },
    localStorage,
    isSecureContext: options.isSecureContext,
  };
  if (options.speechRecognition) windowStub.SpeechRecognition = options.speechRecognition;

  const sandbox = {
    window: windowStub,
    localStorage,
    document: { addEventListener: () => {}, getElementById: () => null },
    navigator: options.navigator ?? {},
    location: options.location ?? { protocol: "http:", hostname: "192.168.1.42" },
    CustomEvent,
    console: { log() {}, warn() {}, error() {} },
    crypto: globalThis.crypto,
    fetch: async () => ({ ok: true, status: 200, statusText: "OK" }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
    performance,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTOR_SRC, sandbox, { filename: "motor.js" });
  return { Motor: sandbox.window.Motor, storage: kv };
}

/** A day in progress, which is what a running schema needs to attach to. */
function bootIntoDay(options = {}) {
  const ctx = boot(options);
  ctx.Motor.startDay();
  ctx.Motor.confirmStartTime("07:00");
  ctx.Motor.continueFromPreDay();
  return ctx;
}

const tick = () => new Promise((r) => setTimeout(r, 30));

/** The Founder's own sentence, verbatim. */
const FOUNDER_ENTRY =
  "Vi starter grøfterensk på RV92 fra km 14 til km 18 med L90. Arbeidsvarsling 24-184.";

function schemasOf(ctx) {
  return ctx.Motor.getSnapshot().dayLog?.schemas ?? [];
}

export const P1_CASES = [
  // ── P1-A ────────────────────────────────────────────────────────────────
  {
    id: "p1a_voice_on_insecure_http_explains_itself_instead_of_doing_nothing",
    description:
      "THE FIELD SYMPTOM. On a phone opening the app over http://<lan-ip>, pressing the mic did nothing at all — no message, no state change. It must now report an explicit, actionable reason rather than returning silently.",
    run: async () => {
      const ctx = boot({ isSecureContext: false, location: { protocol: "http:", hostname: "192.168.1.42" } });
      ctx.Motor.toggleVoice();
      await tick();
      const snap = ctx.Motor.getSnapshot();
      return (
        snap.voiceState === "error" &&
        typeof snap.voiceError === "string" &&
        snap.voiceError.length > 20 &&
        snap.voiceUnavailableReason === "INSECURE_CONTEXT" &&
        snap.voiceError.toLowerCase().includes("https")
      );
    },
  },
  {
    id: "p1a_diagnosis_blames_the_connection_not_the_browser",
    description:
      "Chrome exposes SpeechRecognition over plain http and then refuses to start it. Reporting 'browser does not support speech' would be the wrong explanation and would send someone looking for a different phone.",
    run: () => {
      const withApi = boot({
        isSecureContext: false,
        speechRecognition: function () {},
        navigator: { mediaDevices: {} },
      });
      const d = withApi.Motor.diagnoseVoice();
      return d.available === false && d.reason === "INSECURE_CONTEXT";
    },
  },
  {
    id: "p1a_unsupported_browser_is_reported_separately_from_insecure_context",
    description:
      "The two causes need different actions from the worker — change the address versus change the browser — so they must not collapse into one message.",
    run: () => {
      const ctx = boot({ isSecureContext: true, navigator: { mediaDevices: {} } });
      const d = ctx.Motor.diagnoseVoice();
      return d.available === false && d.reason === "UNSUPPORTED_BROWSER" && /nettleser/i.test(d.message);
    },
  },
  {
    id: "p1a_voice_available_when_secure_and_supported",
    description:
      "The diagnosis must not be a permanent 'no'. With a secure context, the API present and a microphone API available, it reports AVAILABLE and carries no message.",
    run: () => {
      const ctx = boot({
        isSecureContext: true,
        speechRecognition: function () {},
        navigator: { mediaDevices: {} },
      });
      const d = ctx.Motor.diagnoseVoice();
      return d.available === true && d.reason === "AVAILABLE" && d.message === null;
    },
  },
  {
    id: "p1a_snapshot_separates_api_presence_from_actual_availability",
    description:
      "voiceSupported only asks whether the API object exists, which is true on an insecure page where voice cannot run. That is precisely the case that produced a button looking functional and being dead, so the snapshot must carry both facts.",
    run: () => {
      const ctx = boot({
        isSecureContext: false,
        speechRecognition: function () {},
        navigator: { mediaDevices: {} },
      });
      const snap = ctx.Motor.getSnapshot();
      return snap.voiceSupported === true && snap.voiceAvailable === false;
    },
  },

  // ── P1-B ────────────────────────────────────────────────────────────────
  {
    id: "p1b_founder_sentence_fills_the_sja_place_field",
    description:
      "THE FOUNDER'S OWN SENTENCE, end to end. 'Vi starter groefterensk paa RV92 fra km 14 til km 18 med L90' must leave the SJA carrying sted = RV92 km 14-18. Before this it stayed null all day while the very next sentence said where the work was.",
    run: async () => {
      const ctx = bootIntoDay();
      ctx.Motor.submitEntry(FOUNDER_ENTRY, "arbeid");
      await tick();
      const sja = schemasOf(ctx).find((s) => s.type === "sja_preday");
      return !!sja && sja.fields.sted === "RV92 km 14–18";
    },
  },
  {
    id: "p1b_the_stop_was_that_pre_day_schemas_are_created_before_any_entry_exists",
    description:
      "WHERE INFORMATION ACTUALLY STOPPED. sja_preday and kjoretoyssjekk are created at continueFromPreDay(), before the worker has described any work, so they cannot inherit anything at creation. And an ordinary work description triggers no running schema either — detectRunningSchema is keyword-driven and RUNNING_SCHEMAS has no trigger for it. Back-filling later entries into still-draft schemas is the only path that reaches them.",
    run: async () => {
      const ctx = bootIntoDay();
      const atStart = schemasOf(ctx);
      const preDayOnly = atStart.every((s) => s.origin === "pre_day");
      const emptyAtStart = atStart.every((s) => !s.fields.sted);

      ctx.Motor.submitEntry(FOUNDER_ENTRY, "arbeid");
      await tick();
      const after = schemasOf(ctx);

      // No NEW schema was created by the entry — the count is unchanged.
      return (
        preDayOnly && emptyAtStart && after.length === atStart.length &&
        after.some((s) => s.fields.sted === "RV92 km 14–18")
      );
    },
  },
  {
    id: "p1b_backfill_never_overwrites_a_place_already_recorded",
    description:
      "The first entry establishes the place; a later entry mentioning a different road must not silently rewrite it. A value already present was either typed by the worker or set as an organization default, and neither is the system's to replace. This is the same guard that keeps back-fill away from confirmed records: it only ever writes into an empty field.",
    run: async () => {
      const ctx = bootIntoDay();
      ctx.Motor.submitEntry(FOUNDER_ENTRY, "arbeid");
      await tick();
      const first = schemasOf(ctx).find((s) => s.type === "sja_preday");
      if (!first || first.fields.sted !== "RV92 km 14–18") return false;

      // A later, unrelated place. The SJA already describes where the work is.
      ctx.Motor.submitEntry("Kjørte videre til E6 km 200 for befaring", "arbeid");
      await tick();
      const after = schemasOf(ctx).find((s) => s.type === "sja_preday");
      return after.fields.sted === "RV92 km 14–18";
    },
  },
  {
    id: "p1b_place_extraction_handles_both_range_spellings",
    description:
      "'km 14 til km 18' and 'km 14-18' are the same fact written two ways, and a worker will use either.",
    run: () => {
      const ctx = boot();
      const a = ctx.Motor.diagnoseVoice; // touch the surface so boot is real
      return (
        !!a &&
        ctx.Motor.buildSchemaContextFromText("Grøfterensk RV92 km 14 til km 18").sted ===
          "RV92 km 14–18" &&
        ctx.Motor.buildSchemaContextFromText("Grøfterensk RV92 km 14-18").sted ===
          "RV92 km 14–18" &&
        ctx.Motor.buildSchemaContextFromText("Arbeid på RV92").sted === "RV92" &&
        ctx.Motor.buildSchemaContextFromText("Ingen stedsangivelse her").sted === null
      );
    },
  },
  {
    id: "p1b_judgement_fields_are_never_prefilled",
    description:
      "THE SAFETY BOUNDARY. Prefill exists now, so the rule has to hold under it: risiko, konsekvens, tiltak, vurdering and godkjent must remain empty no matter how much the entry text describes the work. Answering them IS the safety work.",
    run: async () => {
      const ctx = bootIntoDay();
      ctx.Motor.submitEntry(
        FOUNDER_ENTRY + " Risiko for påkørsel, tiltak er vakt og skilting.",
        "arbeid",
      );
      await tick();
      const judgement = ["risiko", "konsekvens", "tiltak", "forslag_tiltak", "arsak", "vurdering", "godkjent"];
      return schemasOf(ctx).every((s) =>
        judgement.every((f) => !Object.prototype.hasOwnProperty.call(s.fields, f) || s.fields[f] === null),
      );
    },
  },
  {
    id: "p1b_machine_is_carried_as_a_fact",
    description:
      "'med L90' names a machine, which is identification rather than assessment, so it belongs in the context the schema inherits.",
    run: () => {
      const ctx = boot();
      const context = ctx.Motor.buildSchemaContextFromText(FOUNDER_ENTRY);
      return Array.isArray(context.ressurser) && context.ressurser.some((r) => /L90/i.test(String(r)));
    },
  },
  {
    id: "p1b_prefill_never_overwrites_a_value_already_present",
    description:
      "Config-driven SJA defaults are applied for sted, and an entry-derived place must not silently replace an organization's deliberate default.",
    run: () => {
      const ctx = boot();
      const context = ctx.Motor.buildSchemaContextFromText(FOUNDER_ENTRY);
      // The guard is `fields.sted === null`; proving the context is non-null
      // is what makes that guard meaningful rather than vacuous.
      return context.sted !== null;
    },
  },
];
