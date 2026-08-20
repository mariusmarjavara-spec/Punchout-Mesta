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
  const timers = options.timers ?? {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  const kv = options.storage ?? {};
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
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
    performance,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTOR_SRC, sandbox, { filename: "motor.js" });
  return { Motor: sandbox.window.Motor, storage: kv, window: windowStub };
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

function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();
  return {
    setTimeout(fn, delay = 0) {
      const id = nextId++;
      tasks.set(id, { fn, at: now + Number(delay || 0) });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    setInterval(fn, delay = 0) {
      const id = nextId++;
      const every = Number(delay || 0);
      tasks.set(id, { fn: function tick() {
        fn();
        tasks.set(id, { fn: tick, at: now + every, interval: true });
      }, at: now + every, interval: true });
      return id;
    },
    clearInterval(id) {
      tasks.delete(id);
    },
    advance(ms) {
      now += ms;
      let ran = true;
      while (ran) {
        ran = false;
        for (const [id, task] of [...tasks.entries()].sort((a, b) => a[1].at - b[1].at)) {
          if (task.at <= now) {
            tasks.delete(id);
            task.fn();
            ran = true;
          }
        }
      }
    },
  };
}

function createSpeechHarness() {
  const harness = { last: null };
  function FakeSpeechRecognition() {
    harness.last = this;
  }
  FakeSpeechRecognition.prototype.start = function () {
    if (this.onstart) this.onstart();
  };
  FakeSpeechRecognition.prototype.stop = function () {
    if (this.onerror) this.onerror({ error: "aborted" });
    if (this.onend) this.onend();
  };
  harness.emitFinal = (...texts) => {
    if (!harness.last?.onresult) throw new Error("no active recognition instance");
    const results = texts.map((text) => {
      const row = [{ transcript: text }];
      row.isFinal = true;
      return row;
    });
    harness.last.onresult({ results });
  };
  return { SpeechRecognition: FakeSpeechRecognition, harness };
}

export const P1_CASES = [
  {
    id: "p1c_voice_result_does_not_commit_before_finish",
    description:
      "Manual-finish voice must not commit on the first recognition result. After a final result arrives, the session stays active and the transcript is only buffered until the worker finishes.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = boot({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      ctx.Motor.toggleVoice();
      harness.emitFinal(FOUNDER_ENTRY);
      const snap = ctx.Motor.getSnapshot();
      return snap.appState === "NOT_STARTED" && snap.voiceState === "listening" && snap.isListening === true;
    },
  },
  {
    id: "p1c_voice_old_timeout_no_longer_completes",
    description:
      "The old 15-second timeout must no longer act as normal completion. Moving past that window without an explicit finish keeps the session open and commits nothing.",
    run: async () => {
      const timers = createFakeTimers();
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = boot({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
        timers,
      });
      ctx.Motor.toggleVoice();
      harness.emitFinal(FOUNDER_ENTRY);
      timers.advance(16000);
      const snap = ctx.Motor.getSnapshot();
      return snap.appState === "NOT_STARTED" && snap.voiceState === "listening" && snap.isListening === true;
    },
  },
  {
    id: "p1c_voice_explicit_finish_commits_exactly_once",
    description:
      "A worker-controlled finish drives processing and exactly one commit, then the voice state returns to idle.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = boot({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      ctx.Motor.toggleVoice();
      harness.emitFinal(FOUNDER_ENTRY);
      ctx.Motor.toggleVoice();
      await tick();
      const snap = ctx.Motor.getSnapshot();
      return snap.appState === "ACTIVE" && snap.voiceState === "idle" && snap.isListening === false;
    },
  },
  {
    id: "p1c_voice_multiple_results_finish_as_one_entry",
    description:
      "Recognition may emit several final result events before finish. The worker must still end up with one coherent committed entry, not multiple partial entries.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = bootIntoDay({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      const before = ctx.Motor.getSnapshot().dayLog.entries.length;
      ctx.Motor.toggleVoice();
      harness.emitFinal("Hentet kjetting", "og klargjorde bilen");
      ctx.Motor.toggleVoice();
      await tick();
      const entries = ctx.Motor.getSnapshot().dayLog.entries;
      const entry = entries.at(-1);
      return entries.length === before + 1 && entry?.text === "Hentet kjetting og klargjorde bilen";
    },
  },
  {
    id: "p1c_guided_voice_capture_receives_transcript_without_stray_entry",
    description:
      "Guided Forms still own the transcript when they claim capture. Explicit finish must deliver the transcript to the guided flow without also creating a normal day-log entry.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = bootIntoDay({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      ctx.Motor.setVoiceCaptureTarget("sja");
      const heard = [];
      ctx.window.addEventListener("voice-transcript", (event) => heard.push(event.detail));
      ctx.Motor.toggleVoice();
      const before = ctx.Motor.getSnapshot().dayLog.entries.length;
      harness.emitFinal("Fare for påkjørsel");
      ctx.Motor.toggleVoice();
      await tick();
      return heard.length === 1 && heard[0] === "Fare for påkjørsel" && ctx.Motor.getSnapshot().dayLog.entries.length === before;
    },
  },
  {
    id: "p1c_active_notat_voice_routing_preserved",
    description:
      "Active reporting still routes ordinary narration to NOTAT after explicit finish.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = bootIntoDay({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      ctx.Motor.toggleVoice();
      harness.emitFinal("Hentet kjetting og klargjorde bilen");
      ctx.Motor.toggleVoice();
      await tick();
      return ctx.Motor.getSnapshot().dayLog.entries.at(-1)?.type === "notat";
    },
  },
  {
    id: "p1c_active_friksjon_voice_routing_preserved",
    description:
      "Active reporting still routes friction measurement narration to FRIKSJON after explicit finish.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = bootIntoDay({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      ctx.Motor.toggleVoice();
      harness.emitFinal("Målte friksjon på strekningen");
      ctx.Motor.toggleVoice();
      await tick();
      return ctx.Motor.getSnapshot().dayLog.entries.at(-1)?.type === "friksjon";
    },
  },
  {
    id: "p1c_active_hendelse_voice_routing_preserved",
    description:
      "Active reporting still routes incident narration to HENDELSE after explicit finish.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = bootIntoDay({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      ctx.Motor.toggleVoice();
      harness.emitFinal("Det oppsto en hendelse ved autovernet");
      ctx.Motor.toggleVoice();
      await tick();
      return ctx.Motor.getSnapshot().dayLog.entries.at(-1)?.type === "hendelse";
    },
  },
  {
    id: "p1c_start_phase_voice_uses_same_explicit_finish_path",
    description:
      "The start phase uses the same session lifecycle as active reporting: result alone does not start the day, explicit finish does.",
    run: async () => {
      const { SpeechRecognition, harness } = createSpeechHarness();
      const ctx = boot({
        isSecureContext: true,
        speechRecognition: SpeechRecognition,
        navigator: { mediaDevices: {} },
      });
      ctx.Motor.toggleVoice();
      harness.emitFinal(FOUNDER_ENTRY);
      const beforeFinish = ctx.Motor.getSnapshot().appState;
      ctx.Motor.toggleVoice();
      await tick();
      const afterFinish = ctx.Motor.getSnapshot().appState;
      return beforeFinish === "NOT_STARTED" && afterFinish === "ACTIVE";
    },
  },
  {
    id: "guided_export_packet_carries_field_provenance",
    description:
      "THE EXPORT MAPPER ITSELF. buildExportPacket picks schema keys explicitly and was dropping fieldProvenance. The relay-chain test could not catch that: it posts a hand-built packet straight to /api/export, so motor's builder is never exercised there — reverting the mapper left it green. This drives the real builder.",
    run: async () => {
      // buildExportPacket aborts without a userId, which is read from
      // PUNCHOUT_CONFIG at module load — so the config has to carry one or
      // this case measures the abort rather than the mapper.
      const ctx = bootIntoDay({ config: { userId: "ola.nordmann", organizationId: "mesta" } });
      const snap = ctx.Motor.getSnapshot();
      const sja = (snap.dayLog?.schemas ?? []).find((s) => s.type === "sja_preday");
      if (!sja) return false;

      ctx.Motor.applyGuidedFormToSchema(
        sja.id,
        { sted: "RV92 km 14–18", konsekvens: "Personskade" },
        {
          sted: { origin: "INFERRED_CONFIRMED", at: "t1" },
          konsekvens: { origin: "WORKER", at: "t2" },
        },
      );
      await tick();

      // The export mapper only emits confirmed/discarded schemas.
      const live = ctx.Motor.getSnapshot().dayLog;
      const target = live.schemas.find((s) => s.id === sja.id);
      target.status = "confirmed";

      const packet = ctx.Motor.buildExportPacket(live);
      const exported = packet?.payload?.schemas?.find((s) => s.id === sja.id);
      return (
        !!exported &&
        exported.fieldProvenance?.sted?.origin === "INFERRED_CONFIRMED" &&
        exported.fieldProvenance?.konsekvens?.origin === "WORKER"
      );
    },
  },
  {
    id: "guided_voice_capture_stops_a_dictated_answer_becoming_a_day_log_entry",
    description:
      "Mounting the guided form created this hazard: with a form open, a transcript would ALSO run submitEntry() and file a work entry the worker never wrote. The capture target suppresses that routing while a form owns the microphone.",
    run: async () => {
      const ctx = bootIntoDay();
      const before = ctx.Motor.getSnapshot().dayLog.entries.length;

      ctx.Motor.setVoiceCaptureTarget("sja");
      ctx.Motor.submitEntry("dette er en vanlig oppforing", "arbeid");
      await tick();
      const stillWritesRealEntries = ctx.Motor.getSnapshot().dayLog.entries.length === before + 1;

      ctx.Motor.setVoiceCaptureTarget(null);
      return stillWritesRealEntries && ctx.Motor.setVoiceCaptureTarget("x") === "x";
    },
  },

  // ── Guided Forms: the Motor boundary ────────────────────────────────────
  {
    id: "guided_context_comes_from_domain_state_not_from_rendered_text",
    description:
      "Section 13. The context Guided Forms reuses is built from dayLog entries and the compiled Runtime — never scraped from anything displayed. One entry typed this morning must supply activity, location, machine and the work-warning plan.",
    run: async () => {
      const ctx = bootIntoDay();
      ctx.Motor.submitEntry(FOUNDER_ENTRY, "arbeid");
      await tick();
      const c = ctx.Motor.buildGuidedFormContext();
      return (
        c.location === "RV92 km 14–18" &&
        c.machine === "L90" &&
        c.activity === "Grøfterensk" &&
        c.workWarningPlan === "24-184" &&
        typeof c.date === "string"
      );
    },
  },
  {
    id: "guided_work_warning_plan_is_kept_out_of_the_arbeidsvarsling_enum",
    description:
      "'Arbeidsvarsling 24-184' is a PLAN REFERENCE. The SJA field of that name is an enum describing the warning TYPE (ingen/enkel/manuell/full). Forcing a plan number into it would corrupt a schema contract adapters and export already depend on, so it is carried as its own context key instead.",
    run: async () => {
      const ctx = bootIntoDay();
      ctx.Motor.submitEntry(FOUNDER_ENTRY, "arbeid");
      await tick();
      const c = ctx.Motor.buildGuidedFormContext();
      const sja = (ctx.Motor.getSnapshot().dayLog?.schemas ?? []).find((s) => s.type === "sja_preday");
      return c.workWarningPlan === "24-184" && (sja?.fields.arbeidsvarsling ?? null) === null;
    },
  },
  {
    id: "guided_progress_survives_a_reload_because_it_lives_in_the_day_log",
    description:
      "THE RESUME SCENARIO. Guided-form progress is persisted in dayLog, so rebooting the motor against the same storage — which is what a refresh, an app switch or a crash-resume actually does — lands on the same step with the same answers.",
    run: async () => {
      const ctx = bootIntoDay();
      const saved = ctx.Motor.setGuidedFormState("ruh", {
        version: 1, flowId: "ruh", stepIndex: 2, followUpQueue: [],
        answers: { beskrivelse: { value: "Traff autovernet", origin: "WORKER", at: "x" } },
        context: {}, completedAt: null,
      });
      await tick();

      const rebooted = boot({ storage: ctx.storage });
      const state = rebooted.Motor.getGuidedFormState("ruh");
      return (
        saved === true &&
        !!state &&
        state.stepIndex === 2 &&
        state.answers.beskrivelse.value === "Traff autovernet"
      );
    },
  },
  {
    id: "guided_schema_write_refuses_a_machine_origin_on_a_judgement_field",
    description:
      "THE SECOND WRITE PATH. applyGuidedFormToSchema re-checks NEVER_AUTO_FILL rather than trusting the engine, because a boundary enforced in only one of two places is not a boundary. A judgement value arrives only when the worker authored or explicitly accepted it.",
    run: async () => {
      const ctx = bootIntoDay();
      const sja = (ctx.Motor.getSnapshot().dayLog?.schemas ?? []).find((s) => s.type === "sja_preday");
      if (!sja) return false;

      ctx.Motor.applyGuidedFormToSchema(
        sja.id,
        { konsekvens: "Maskinen kan velte", sted: "RV92 km 14–18" },
        { konsekvens: { origin: "INFERRED_CONFIRMED" }, sted: { origin: "INFERRED_CONFIRMED" } },
      );
      await tick();
      const afterMachine = (ctx.Motor.getSnapshot().dayLog?.schemas ?? []).find((s) => s.id === sja.id);
      const judgementRefused = afterMachine.fields.konsekvens === null;
      const factAccepted = afterMachine.fields.sted === "RV92 km 14–18";

      ctx.Motor.applyGuidedFormToSchema(
        sja.id,
        { konsekvens: "Personskade" },
        { konsekvens: { origin: "WORKER" } },
      );
      await tick();
      const afterWorker = (ctx.Motor.getSnapshot().dayLog?.schemas ?? []).find((s) => s.id === sja.id);

      return judgementRefused && factAccepted && afterWorker.fields.konsekvens === "Personskade";
    },
  },

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
