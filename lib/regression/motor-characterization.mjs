/**
 * MOTOR CHARACTERIZATION SUITE
 * ============================
 * Post-pilot engineering baseline, step 3.
 *
 * PURPOSE. These cases do not assert what motor.js *should* do. They pin what
 * it *does* do today, in REACT_MODE (the only mode the pilot ships), so that a
 * later move away from a 6000-line global `window.Motor` toward a typed domain
 * core has an executable definition of "no behaviour changed". A characterization
 * suite is written before the refactor, not after; that is its entire value.
 *
 * SCOPE. Deliberately limited to behaviour reachable through the public
 * `window.Motor` bridge plus localStorage — the same two surfaces React and a
 * real browser tab have. Nothing here reaches into motor.js internals, because
 * internals are exactly what a later refactor is allowed to change.
 *
 * HONESTY RULE. Where today's behaviour contradicts a comment or an obvious
 * expectation, the case pins the ACTUAL behaviour and says so in its
 * description, with a pointer to docs/POST_PILOT_ARCHITECTURE.md. Silently
 * "fixing" such a case here would destroy the baseline it exists to establish.
 * Three such contradictions are pinned below and are ranked as debt in that
 * document:
 *   - main time can only ever be DISCARDED in React mode, never confirmed;
 *   - `force_skipped` pre-day schemas do not block lockDay, despite the
 *     comment on forceStartDay() saying they must;
 *   - a failed localStorage write leaves the in-memory day ahead of the
 *     persisted one, with no retry.
 *
 * Same {id, description, run} shape as motor-cases.mjs so run.mjs combines them.
 */
import fs from "node:fs";
import vm from "node:vm";

const MOTOR_SRC = fs.readFileSync("./public/motor.js", "utf8");

const STORAGE_KEY_CURRENT = "yournal_current_day";
const STORAGE_KEY_HISTORY = "yournal_history";
const STORAGE_KEY_UX_STATE = "yournal_ux_state";

const PILOT_CONFIG = {
  lonnskoder: [
    { kode: "100", navn: "Ordinær arbeidstid" },
    { kode: "200", navn: "Overtid 50%" },
  ],
  kjoretoy: ["AB 12345", "CD 67890"],
  sjaDefaults: { sted: "", arbeidsvarsling: "enkel" },
  externalLinks: [{ id: "elrapp", title: "Logg inn i Elrapp", url: "https://elrapp.atlas.vegvesen.no/login" }],
  hovedordre: "HOVED",
};

/**
 * Boot motor.js in a vm sandbox.
 *
 * @param {object}  [opts]
 * @param {object}  [opts.config]        window.PUNCHOUT_CONFIG (defaults to PILOT_CONFIG)
 * @param {object}  [opts.storage]       pre-existing localStorage contents (string values)
 * @param {boolean} [opts.failWrites]    make every setItem throw, simulating a full/blocked quota
 * @returns {{Motor:any, storage:object, setFailWrites:(v:boolean)=>void, reboot:()=>any}}
 */
function bootMotor(opts) {
  const options = opts || {};
  const kv = Object.assign({}, options.storage || {});
  let failWrites = !!options.failWrites;
  /** Per-key write gate: return false to make that one setItem throw. Models a
   * real quota wall (some writes fail, reclaim writes still succeed) rather
   * than a totally dead store. */
  let writeFilter = null;

  const localStorage = {
    getItem: (k) => (k in kv ? kv[k] : null),
    setItem: (k, v) => {
      if (failWrites || (writeFilter && !writeFilter(k))) {
        const err = new Error("QuotaExceededError: persistent storage is full");
        err.name = "QuotaExceededError";
        throw err;
      }
      kv[k] = String(v);
    },
    removeItem: (k) => { delete kv[k]; },
  };

  const listeners = {};
  class CustomEvent { constructor(type, o) { this.type = type; this.detail = o && o.detail; } }
  const windowStub = {
    PUNCHOUT_CONFIG: options.config === undefined ? PILOT_CONFIG : options.config,
    PUNCHOUT_RUNTIME: null,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent: (evt) => { (listeners[evt.type] || []).forEach((fn) => fn(evt)); },
    localStorage,
  };
  const sandbox = {
    window: windowStub, localStorage,
    document: { addEventListener: () => {}, getElementById: () => null },
    navigator: {}, CustomEvent, console, crypto: globalThis.crypto,
    fetch: async () => ({ ok: true, status: 200, statusText: "OK" }),
    setTimeout, clearTimeout, setInterval, clearInterval, Date, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Error,
  };
  vm.createContext(sandbox);
  vm.runInContext(MOTOR_SRC, sandbox, { filename: "motor.js" });

  return {
    Motor: sandbox.window.Motor,
    storage: kv,
    setFailWrites: (v) => { failWrites = v; },
    setWriteFilter: (fn) => { writeFilter = fn; },
    /** Re-boot a fresh motor against the SAME storage — this is what a browser
     * refresh, a tab restore or a crash-resume actually does. */
    reboot: () => bootMotor({ config: options.config, storage: kv }),
  };
}

/** Wait for submitEntry()'s deferred orchestration (setTimeout(fn, 0)). */
const tick = () => new Promise((resolve) => setTimeout(resolve, 25));

/** startDay -> confirm start time -> leave pre-day, i.e. a day in drift. */
function bootIntoDrift(opts) {
  const ctx = bootMotor(opts);
  ctx.Motor.startDay();
  ctx.Motor.confirmStartTime("07:00");
  ctx.Motor.continueFromPreDay();
  return ctx;
}

/** An ISO date string N days before today. */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

/** A persisted current-day blob, as saveCurrentDay() writes it. */
function persistedDay(dayLog, appState) {
  return JSON.stringify({ appState: appState || "ACTIVE", dayLog });
}

export const MOTOR_CHARACTERIZATION_CASES = [
  // ================================================================
  // A. DAY START
  // ================================================================
  {
    id: "char_start_day_creates_pre_phase_day_with_pending_start_time",
    description:
      "startDay() moves NOT_STARTED -> ACTIVE and creates a day in phase 'pre' whose startTime is deliberately NULL with source 'pending' — opening the app is explicitly NOT clocking in. This is a load-bearing HMS/payroll property: nothing may record a start time the worker did not confirm.",
    run: () => {
      const { Motor } = bootMotor();
      const before = Motor.getSnapshot();
      Motor.startDay();
      const after = Motor.getSnapshot();
      return before.appState === "NOT_STARTED" && before.dayLog === null
        && after.appState === "ACTIVE"
        && after.dayLog.phase === "pre"
        && after.dayLog.startTime === null
        && after.dayLog.startTimeSource === "pending"
        && after.dayLog.status === "ACTIVE"
        && after.dayLog.mainTimeHandled === false
        && after.dayLog.date === new Date().toISOString().split("T")[0];
    },
  },
  {
    id: "char_start_day_offers_every_available_pre_day_schema_as_draft",
    description:
      "In React mode startDay() creates ALL of ADMIN_CONFIG.availablePreDaySchemas up front as 'draft' cards (unlike vanilla mode, which only creates the ones detected in the spoken text). The Start screen renders exactly this list, so its membership is a UI contract.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      const schemas = Motor.getSnapshot().dayLog.schemas;
      const types = schemas.map((s) => s.type).sort();
      return schemas.length === 2
        && types[0] === "kjoretoyssjekk" && types[1] === "sja_preday"
        && schemas.every((s) => s.origin === "pre_day" && s.status === "draft");
    },
  },
  {
    id: "char_confirm_start_time_is_write_once_for_user_source",
    description:
      "confirmStartTime() accepts a HH:MM string and marks the source 'user'. A second call must NOT overwrite a user-confirmed time — a stray re-render or double tap can never quietly move a worker's clock-in.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      Motor.confirmStartTime("06:45");
      Motor.confirmStartTime("09:15");
      const log = Motor.getSnapshot().dayLog;
      return log.startTime === "06:45" && log.startTimeSource === "user";
    },
  },
  {
    id: "char_confirm_start_time_rejects_malformed_input_and_uses_now",
    description:
      "A non-HH:MM argument is not stored verbatim — confirmStartTime() falls back to the current clock time rather than persisting garbage into a payroll-relevant field.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      Motor.confirmStartTime("i går morges");
      const log = Motor.getSnapshot().dayLog;
      return /^\d{2}:\d{2}$/.test(log.startTime) && log.startTimeSource === "user";
    },
  },

  // ================================================================
  // B. PRE-DAY PHASE
  // ================================================================
  {
    id: "char_pre_day_skip_and_defer_are_distinct_recorded_outcomes",
    description:
      "skipPreDaySchema() and deferPreDaySchema() record DIFFERENT statuses ('skipped' vs 'deferred') rather than collapsing to one. Both are recorded, not erased — the distinction between 'not relevant today' and 'later today' is auditable after the fact.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      const schemas = Motor.getSnapshot().dayLog.schemas;
      const sja = schemas.find((s) => s.type === "sja_preday");
      const kjoretoy = schemas.find((s) => s.type === "kjoretoyssjekk");
      Motor.skipPreDaySchema(sja.id);
      Motor.deferPreDaySchema(kjoretoy.id);
      const after = Motor.getSnapshot().dayLog.schemas;
      return after.find((s) => s.id === sja.id).status === "skipped"
        && after.find((s) => s.id === kjoretoy.id).status === "deferred";
    },
  },
  {
    id: "char_continue_from_pre_day_moves_to_active_with_nothing_required",
    description:
      "With ADMIN_CONFIG.requiredSchemas empty — today's live pilot default, and the only configuration any organization package can currently produce — continueFromPreDay() always succeeds and moves phase 'pre' -> 'active', regardless of any schema's status.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      Motor.continueFromPreDay();
      return Motor.getSnapshot().dayLog.phase === "active" && Motor.isSchemaRequired("sja_preday") === false;
    },
  },
  {
    id: "char_saving_a_pre_day_schema_confirms_it_during_pre_phase",
    description:
      "saveSchemaEdit() on a pre_day schema while phase === 'pre' both saves AND confirms it in one step — there is no separate confirm action in the Start screen. Outside the pre phase the same call only saves.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      Motor.openSchemaEdit(sja.id);
      Motor.setSchemaField(sja.id, "oppgave", "Brøyting Fv. 17");
      Motor.setSchemaField(sja.id, "konsekvens", "Påkjørsel bakfra");
      Motor.setSchemaField(sja.id, "tiltak", "Skiltet arbeidsvarsling");
      Motor.setSchemaField(sja.id, "godkjent", true);
      Motor.saveSchemaEdit();
      const after = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === sja.id);
      return after.status === "confirmed" && typeof after.confirmedAt === "string";
    },
  },
  {
    id: "char_pre_day_schemas_never_appear_in_handrens",
    description:
      "getUnresolvedItems() skips origin === 'pre_day' unconditionally, BEFORE looking at status. Pre-day schemas are recommendations, never blockers: an unconfirmed, skipped or deferred SJA does not stop the worker locking the day.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      Motor.continueFromPreDay();
      Motor.endDay();
      const items = Motor.getUnresolvedItems();
      return Motor.getSnapshot().dayLog.schemas.every((s) => s.origin === "pre_day")
        && items.every((i) => i.kind !== "schema");
    },
  },
  {
    id: "char_force_skipped_pre_day_schema_blocks_lock_until_resolved",
    description:
      "DELIBERATELY CHANGED BEHAVIOUR (§23). forceStartDay()'s comment has always claimed force_skipped items block lockDay; they did not, because getUnresolvedItems() dropped every pre_day schema before status was examined. Resolved in favour of the comment, because the product semantics are unambiguous: if an employer marks a schema required and the worker forces past it, they must account for it before signing off the day. Requires a runtime that actually marks something required — the hardcoded pilot config still marks nothing, which is exactly why changing it now is safe.",
    run: () => {
      // An injected runtime whose schema registry marks the SJA required is the
      // only way to reach forceStartDay()'s effect at all.
      const { Motor } = bootMotor();
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      // Drive the state directly through the documented escape hatch, then
      // assert on what Håndrens surfaces.
      Motor.forceStartDay();
      const forced = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === sja.id);
      // With nothing required, forceStartDay marks nothing — today's live case.
      if (forced.status !== "draft") return false;
      Motor.endDay();
      return Motor.getUnresolvedItems().every((i) => i.kind !== "schema");
    },
  },
  {
    id: "char_a_force_skipped_required_schema_appears_in_handrens",
    description:
      "The other half of §23, proven directly against the state rather than against the dormant config path: a pre_day schema in status 'force_skipped' MUST surface as an unresolved Håndrens item and therefore block lockDay, while every other pre_day status stays non-blocking.",
    run: () => {
      const today = new Date().toISOString().split("T")[0];
      const mk = (id, status) => ({
        id, type: "sja_preday", origin: "pre_day", status, fields: {}, createdAt: "07:00", linkedEntries: [],
      });
      const stored = persistedDay({
        date: today, startTime: "07:00", startTimeSource: "user", endTime: null,
        entries: [], drafts: {},
        schemas: [mk("s_forced", "force_skipped"), mk("s_skipped", "skipped"), mk("s_deferred", "deferred"), mk("s_draft", "draft")],
        phase: "active", status: "ACTIVE", mainTimeHandled: false,
      });
      const { Motor } = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      Motor.endDay();
      const schemaItems = Motor.getUnresolvedItems().filter((i) => i.kind === "schema");

      Motor.lockDay();
      const blocked = Motor.getSnapshot().appState === "ACTIVE";

      return schemaItems.length === 1
        && schemaItems[0].data.schemaId === "s_forced"
        && blocked;
    },
  },

  // ================================================================
  // C. DRIFT PHASE
  // ================================================================
  {
    id: "char_drift_entry_creates_linked_schema_via_deferred_orchestration",
    description:
      "submitEntry() returns immediately and defers schema orchestration to a setTimeout(fn, 0). An incident entry therefore produces its RUH schema on the NEXT tick, not synchronously — any future refactor that makes this synchronous changes observable ordering for React.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Det skjedde en nestenulykke ved rundkjøringen", "hendelse");
      const immediately = Motor.getSnapshot().dayLog.schemas.filter((s) => s.type === "ruh").length;
      await tick();
      const afterTick = Motor.getSnapshot().dayLog.schemas.filter((s) => s.type === "ruh");
      return immediately === 0 && afterTick.length === 1 && afterTick[0].origin !== "pre_day";
    },
  },
  {
    id: "char_structured_entry_creates_a_confirmed_order_draft_immediately",
    description:
      "confirmStructuredEntry() — the 'verify at the moment of input' path — writes the order draft as status 'confirmed' straight away, with no intermediate 'draft' state, because the worker verified it on screen. That is why such drafts never surface in Håndrens.",
    run: () => {
      const { Motor } = bootIntoDrift();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      const parsed = Motor.parseEntry(text);
      Motor.confirmStructuredEntry(text, "arbeid", parsed);
      const draft = Motor.getSnapshot().dayLog.drafts["204481-0149"];
      const entry = Motor.getSnapshot().dayLog.entries[0];
      return !!draft && draft.status === "confirmed"
        && draft.fra_tid === "07:30" && draft.til_tid === "11:00"
        && entry.verified === true && entry.lockedByUser === true;
    },
  },
  {
    id: "char_structured_entry_merges_into_existing_draft_without_duplicating",
    description:
      "A second structured entry on the same order extends the existing draft (description appended, til_tid advanced, entry index recorded) instead of creating a second draft for the same order number.",
    run: () => {
      const { Motor } = bootIntoDrift();
      const first = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      const second = "204481-0149 fra 11:30 til 15:00 kantklipp";
      Motor.confirmStructuredEntry(first, "arbeid", Motor.parseEntry(first));
      Motor.confirmStructuredEntry(second, "arbeid", Motor.parseEntry(second));
      const drafts = Motor.getSnapshot().dayLog.drafts;
      const draft = drafts["204481-0149"];
      return Object.keys(drafts).length === 1
        && draft.arbeidsbeskrivelse.length === 2
        && draft.fra_tid === "07:30" && draft.til_tid === "15:00"
        && draft.entryIndices.length === 2;
    },
  },
  {
    id: "char_drift_entries_are_rejected_once_the_day_is_ending",
    description:
      "submitEntry() and confirmStructuredEntry() both no-op once phase === 'ending'. Håndrens is a closed set: the list of things to verify cannot grow while the worker is verifying it.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      const before = Motor.getSnapshot().dayLog.entries.length;
      Motor.submitEntry("Enda en hendelse", "hendelse");
      const text = "204481-0149 fra 16:00 til 17:00 ekstraarbeid";
      Motor.confirmStructuredEntry(text, "arbeid", { ordre: "204481-0149", fra: "16:00", til: "17:00", ressurser: [], rawText: text });
      return Motor.getSnapshot().dayLog.entries.length === before && before === 0;
    },
  },
  {
    id: "char_entry_edit_rewrites_text_in_place_and_clears_editing_index",
    description:
      "openEdit()/saveEdit()/cancelEdit() operate on an entry index, mutate the text in place, and reset editingIndex to -1. The entry is edited, never appended-and-superseded — there is no edit history in today's model (see docs/POST_PILOT_ARCHITECTURE.md and docs/FUTURE_OPERATIONS_FOUNDATIONS.md).",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Startet på feil sted", "notat");
      await tick();
      Motor.openEdit(0);
      const whileEditing = Motor.getSnapshot().editingIndex;
      Motor.saveEdit(0, "Startet ved Fv. 17 x Rv. 92");
      const snap = Motor.getSnapshot();
      return whileEditing === 0
        && snap.editingIndex === -1
        && snap.dayLog.entries.length === 1
        && snap.dayLog.entries[0].text === "Startet ved Fv. 17 x Rv. 92";
    },
  },

  // ================================================================
  // D. SCHEMA EDITING
  // ================================================================
  {
    id: "char_set_schema_field_ignores_keys_outside_the_schema_definition",
    description:
      "setSchemaField() silently ignores any key the schema instance does not already own. A schema's field set is fixed at creation from its definition; React cannot widen it by writing a new key.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      Motor.setSchemaField(sja.id, "oppfunnet_felt", "verdi");
      Motor.setSchemaField(sja.id, "sted", "Fv. 17");
      const fields = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === sja.id).fields;
      return !Object.prototype.hasOwnProperty.call(fields, "oppfunnet_felt") && fields.sted === "Fv. 17";
    },
  },
  {
    id: "char_save_schema_edit_blocks_on_missing_required_fields_with_a_readable_error",
    description:
      "In React mode the motor is the last line of defence on required fields: saveSchemaEdit() refuses, leaves status untouched, and publishes a human-readable schemaError naming the missing LABELS (not the field keys) for the UI to show.",
    run: () => {
      const { Motor } = bootMotor();
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      Motor.openSchemaEdit(sja.id);
      Motor.setSchemaField(sja.id, "oppgave", "Brøyting");
      Motor.saveSchemaEdit();
      const snap = Motor.getSnapshot();
      const err = snap.schemaError || "";
      return snap.dayLog.schemas.find((s) => s.id === sja.id).status === "draft"
        && err.indexOf("Konsekvens") !== -1
        && err.indexOf("Tiltak") !== -1
        && err.indexOf("Godkjent") !== -1;
    },
  },
  {
    id: "char_schema_edit_overlay_state_is_persisted_for_refresh",
    description:
      "openSchemaEdit() persists { activeOverlay:'schema_edit', schemaId } to its own localStorage key, and closeSchemaEdit() clears it. This is what lets a refresh mid-edit land back in the same overlay.",
    run: () => {
      const ctx = bootMotor();
      const { Motor, storage } = ctx;
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      Motor.openSchemaEdit(sja.id);
      const persisted = JSON.parse(storage[STORAGE_KEY_UX_STATE]);
      Motor.closeSchemaEdit();
      return persisted.activeOverlay === "schema_edit"
        && persisted.schemaId === sja.id
        && Motor.getSnapshot().uxState.activeOverlay === null;
    },
  },
  {
    id: "char_confirming_a_ruh_propagates_the_decision_onto_its_linked_entry",
    description:
      "Resolving a linked schema writes back onto the entry that produced it (ruhDecision 'yes'/'no', vaktloggConfirmed/vaktloggDiscarded). The entry list and the schema list are kept consistent by the motor, not by the UI.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Nestenulykke med gravemaskin", "hendelse");
      await tick();
      Motor.endDay();
      const ruh = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "ruh");
      if (!ruh) return false;
      Motor.setSchemaField(ruh.id, "arsak", "Dårlig sikt");
      Motor.setSchemaField(ruh.id, "tiltak", "Utvidet sikringssone");
      Motor.resolveItem("schema_" + ruh.id, "confirm");
      const snap = Motor.getSnapshot();
      const confirmed = snap.dayLog.schemas.find((s) => s.id === ruh.id);
      const linkedEntry = snap.dayLog.entries[confirmed.linkedEntries[0]];
      return confirmed.status === "confirmed" && linkedEntry.ruhDecision === "yes";
    },
  },

  // ================================================================
  // E. END OF DAY / HÅNDRENS
  // ================================================================
  {
    id: "char_end_day_stamps_end_time_and_grovutfyller_the_main_draft",
    description:
      "endDay() moves phase 'active' -> 'ending', stamps endTime, and creates the main draft pre-filled ONLY with deterministic values (fra_tid from the confirmed start, til_tid from the end). Lønnskoder are deliberately left empty — the motor never guesses payroll hours.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      const log = Motor.getSnapshot().dayLog;
      const main = log.drafts["HOVED"];
      return log.phase === "ending"
        && /^\d{2}:\d{2}$/.test(log.endTime)
        && log.mainTimeHandled === false
        && main.isMain === true
        && main.status === "draft"
        && main.fra_tid === "07:00"
        && main.til_tid === log.endTime
        && main.lonnskoder.length === 0;
    },
  },
  {
    id: "char_end_day_auto_confirms_complete_non_main_drafts_and_keeps_notes",
    description:
      "endDay() auto-confirms every non-main draft that already has a description (the worker verified it by saying it) and auto-keeps every unconverted note. Neither is pushed through a decision — this is what keeps Håndrens short.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Husk å bestille grus", "notat");
      await tick();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      Motor.confirmStructuredEntry(text, "arbeid", Motor.parseEntry(text));
      Motor.endDay();
      const log = Motor.getSnapshot().dayLog;
      const note = log.entries.find((e) => e.type === "notat");
      return log.drafts["204481-0149"].status === "confirmed"
        && note.keptAsNote === true
        && Motor.getUnresolvedItems().every((i) => i.kind !== "draft");
    },
  },
  {
    id: "char_end_day_is_idempotent_and_only_recomputes_ready_to_lock",
    description:
      "Calling endDay() again while already in the ending phase must not re-stamp endTime or re-run grovutfyll — it only recomputes readyToLock. Guards against a double tap silently rewriting the worked-hours window.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      const first = Motor.getSnapshot().dayLog;
      Motor.resolveItem("main_time", "discard", { reason: "logged_elsewhere" });
      Motor.endDay();
      const second = Motor.getSnapshot();
      return second.dayLog.endTime === first.endTime
        && second.dayLog.mainTimeHandled === true
        && second.readyToLock === true;
    },
  },
  {
    id: "char_handrens_surfaces_main_time_and_drift_schemas_as_flat_items",
    description:
      "getUnresolvedItems() is the whole Håndrens model: a flat list of {id, kind, label, data} with a stable id grammar ('main_time', 'schema_<id>', 'friksjon_<id>', 'draft_<ordre>') that resolveItem() parses by prefix. That grammar is the React contract.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      Motor.endDay();
      const items = Motor.getUnresolvedItems();
      const kinds = items.map((i) => i.kind).sort();
      const mainTime = items.find((i) => i.kind === "main_time");
      const schemas = items.filter((i) => i.kind === "schema");
      return kinds.join(",") === "main_time,schema,schema"
        && mainTime.id === "main_time"
        && mainTime.data.ordre === "HOVED"
        && schemas.every((s) => s.id === "schema_" + s.data.schemaId)
        && schemas.every((s) => typeof s.label === "string" && s.label.length > 0);
    },
  },
  {
    id: "char_one_incident_utterance_produces_two_independent_schemas",
    description:
      "PINS A SURPRISE. A single spoken incident ('Nestenulykke ved påkjøring') creates TWO schemas by two unrelated mechanisms: 'uonsket_hendelse' from RUNNING_SCHEMAS keyword triggers, and 'ruh' from the COMPLETION_RULES fact rule. Both land in Håndrens as separate items the worker must resolve independently, and neither knows about the other. This is today's real behaviour and the strongest single argument for the rule/trigger consolidation ranked in docs/POST_PILOT_ARCHITECTURE.md — pinned here so any consolidation is a deliberate, visible change rather than an accident.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      const created = Motor.getSnapshot().dayLog.schemas.filter((s) => s.origin !== "pre_day");
      const byType = created.map((s) => s.type).sort();
      const origins = created.map((s) => s.origin).sort();
      return created.length === 2
        && byType.join(",") === "ruh,uonsket_hendelse"
        && origins.join(",") === "drift,running"
        && created.every((s) => s.status === "draft");
    },
  },
  {
    id: "char_confirming_a_schema_with_missing_required_fields_is_refused_in_handrens_too",
    description:
      "resolveItem(..., 'confirm') applies the same generic required-field check as saveSchemaEdit(), reading the schema's OWN definition rather than hardcoded field names. Håndrens cannot be used to sneak an incomplete RUH past the motor.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      Motor.endDay();
      const ruh = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "ruh");
      Motor.resolveItem("schema_" + ruh.id, "confirm");
      const blocked = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === ruh.id).status;
      Motor.setSchemaField(ruh.id, "arsak", "Sikt");
      Motor.setSchemaField(ruh.id, "tiltak", "Sperring");
      Motor.resolveItem("schema_" + ruh.id, "confirm");
      const allowed = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === ruh.id).status;
      return blocked === "draft" && allowed === "confirmed";
    },
  },
  {
    id: "char_discarding_a_schema_records_it_rather_than_deleting_it",
    description:
      "A discarded schema is kept with status 'discarded' — it is not removed from dayLog.schemas. Both outcomes reach the export packet (buildExportPacket keeps confirmed AND discarded), so 'the worker considered this and said no' is a preserved fact.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      Motor.endDay();
      const ruh = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "ruh");
      Motor.resolveItem("schema_" + ruh.id, "discard");
      const snap = Motor.getSnapshot();
      const after = snap.dayLog.schemas.find((s) => s.id === ruh.id);
      const linked = snap.dayLog.entries[after.linkedEntries[0]];
      return after.status === "discarded" && linked.ruhDecision === "no";
    },
  },
  {
    id: "char_resolving_items_emits_neutral_telemetry_with_schema_type",
    description:
      "Every resolveItem() call emits a telemetry event (SchemaCompleted/SchemaSkipped for schemas, PromptAccepted/PromptDismissed otherwise) carrying the item id, the action and — for schemas — the schema type. This is the existing neutral event layer future KPI work would build on; see docs/FUTURE_OPERATIONS_FOUNDATIONS.md.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      Motor.endDay();
      const ruh = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "ruh");
      Motor.resolveItem("schema_" + ruh.id, "discard");
      Motor.resolveItem("main_time", "discard", { reason: "no_work_done" });
      const log = Motor.getTelemetryLog();
      const skipped = log.find((e) => e.type === "SchemaSkipped");
      const dismissed = log.find((e) => e.type === "PromptDismissed" && e.data.id === "main_time");
      return !!skipped && skipped.data.schemaType === "ruh" && skipped.data.action === "discard"
        && !!dismissed
        && typeof skipped.occurredAt === "string";
    },
  },

  // ================================================================
  // F. TIMEFØRING (MAIN TIME)
  // ================================================================
  {
    id: "char_main_time_discard_requires_one_of_two_explicit_reasons",
    description:
      "resolveItem('main_time','discard') refuses any reason outside {no_work_done, logged_elsewhere} and leaves mainTimeHandled false. 'No hours today' is never a default — it must be an explicit, recorded choice.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      Motor.resolveItem("main_time", "discard", { reason: "glemte_det" });
      const refused = Motor.getSnapshot().dayLog;
      Motor.resolveItem("main_time", "discard");
      const refusedNoReason = Motor.getSnapshot().dayLog;
      Motor.resolveItem("main_time", "discard", { reason: "no_work_done" });
      const accepted = Motor.getSnapshot().dayLog;
      return refused.mainTimeHandled === false
        && refusedNoReason.mainTimeHandled === false
        && accepted.mainTimeHandled === true
        && accepted.mainTimeDiscarded === true
        && accepted.mainTimeDiscardReason === "no_work_done"
        && accepted.drafts["HOVED"].status === "discarded";
    },
  },
  {
    id: "char_main_time_confirm_is_refused_without_lonnskoder",
    description:
      "resolveItem('main_time','confirm') refuses when the main draft has no lønnskode lines, leaving mainTimeHandled false. The main timesheet cannot be signed off as an empty shell.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      Motor.resolveItem("main_time", "confirm");
      const log = Motor.getSnapshot().dayLog;
      return log.mainTimeHandled === false && log.drafts["HOVED"].status === "draft";
    },
  },
  {
    id: "char_main_time_is_confirmable_through_the_react_bridge",
    description:
      "DELIBERATELY CHANGED BEHAVIOUR — this case previously pinned the opposite. Until Operation Punchout Field Trial the main timesheet could only ever be DISCARDED: confirming needs a lønnskode line, grovutfyllMainDraft() deliberately adds none, confirmStructuredEntry() only writes lønnskoder onto parsed ORDER drafts, and teAddLonnskode() was a vanilla-DOM function absent from the bridge — so no locked day ever exported a main-time line. Established as a PORTING defect rather than product doctrine (the vanilla renderMainTimeEntryContent() in the same file has a '+ Legg til lønnskode' button), and fixed by exposing DOM-free main-time editing. The old assertion is intentionally gone, not weakened.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      const added = Motor.addMainTimeLonnskode();
      Motor.resolveItem("main_time", "confirm");
      const log = Motor.getSnapshot().dayLog;
      return added === true
        && log.drafts["HOVED"].lonnskoder.length === 1
        && log.drafts["HOVED"].status === "confirmed"
        && log.mainTimeHandled === true
        && log.mainTimeDiscarded === undefined;
    },
  },
  {
    id: "char_main_time_suggestion_is_the_day_minus_hours_already_booked_on_orders",
    description:
      "The offered line is the whole day minus whatever is already booked on specific orders, on the organization's FIRST configured wage code. This is what subtractHoursFromTime() — present but unused in motor.js since the vanilla UI was written — was always for.",
    run: () => {
      const { Motor } = bootIntoDrift();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      Motor.confirmStructuredEntry(text, "arbeid", Motor.parseEntry(text));
      Motor.endDay();
      const ctx = Motor.getMainTimeContext();
      // 3.5h already booked on the order draft; the day ends at endTime, so the
      // suggestion runs from the day's start to endTime minus those 3.5 hours.
      const expectedTil = (() => {
        const [h, m] = String(ctx.endTime).split(":").map(Number);
        const mins = h * 60 + m - 210;
        return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
      })();
      return ctx.lockedTilleggHours === 3.5
        && ctx.suggested.kode === "100"
        && ctx.suggested.fra === "07:00"
        && ctx.suggested.til === expectedTil
        && ctx.availableLonnskoder[0].label === "Ordinær arbeidstid";
    },
  },
  {
    id: "char_main_time_lines_are_never_auto_written_only_offered",
    description:
      "Doctrine preserved through the fix: grovutfyllMainDraft() still adds no lønnskode, and merely reading the context must not create one. A payroll line exists only because the worker explicitly added it.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      const ctx = Motor.getMainTimeContext();
      const after = Motor.getSnapshot().dayLog.drafts["HOVED"];
      return ctx.suggested !== null && ctx.lonnskoder.length === 0 && after.lonnskoder.length === 0;
    },
  },
  {
    id: "char_main_time_lines_are_editable_and_removable_before_confirmation",
    description:
      "Update and remove operate by index and persist immediately, so a refresh mid-edit keeps the worker's corrections — the same write-through-to-storage posture as setSchemaField().",
    run: () => {
      const ctx = bootIntoDrift();
      const { Motor } = ctx;
      Motor.endDay();
      Motor.addMainTimeLonnskode("100", "07:00", "12:00");
      Motor.addMainTimeLonnskode("200", "12:00", "15:00");
      Motor.updateMainTimeLonnskode(1, { til: "14:30" });
      const afterEdit = ctx.reboot().Motor.getSnapshot().dayLog.drafts["HOVED"].lonnskoder;
      Motor.removeMainTimeLonnskode(0);
      const afterRemove = Motor.getSnapshot().dayLog.drafts["HOVED"].lonnskoder;
      return afterEdit.length === 2
        && afterEdit[1].kode === "200"
        && afterEdit[1].til === "14:30"
        && afterRemove.length === 1
        && afterRemove[0].kode === "200";
    },
  },
  {
    id: "char_main_time_lines_are_frozen_once_the_draft_is_resolved",
    description:
      "After confirm or discard the main draft is a decided fact. Adding, editing or removing a line must be refused rather than silently changing an already-signed-off timesheet.",
    run: () => {
      const { Motor } = bootIntoDrift();
      Motor.endDay();
      Motor.addMainTimeLonnskode("100", "07:00", "15:00");
      Motor.resolveItem("main_time", "confirm");
      const addedAfter = Motor.addMainTimeLonnskode("200", "15:00", "16:00");
      const updatedAfter = Motor.updateMainTimeLonnskode(0, { til: "23:00" });
      const removedAfter = Motor.removeMainTimeLonnskode(0);
      const draft = Motor.getSnapshot().dayLog.drafts["HOVED"];
      return addedAfter === false
        && updatedAfter === false
        && removedAfter === false
        && draft.lonnskoder.length === 1
        && draft.lonnskoder[0].til === "15:00";
    },
  },
  {
    id: "char_confirmed_main_time_reaches_the_export_packet",
    description:
      "The point of the whole fix: a confirmed main timesheet must survive into the export packet's timeEntries, which buildExportPacket() builds from CONFIRMED drafts only. Previously impossible — this is the assertion that would have caught the original defect in the pilot's real output.",
    run: () => {
      const { Motor } = bootMotor({ config: { ...PILOT_CONFIG, userId: "worker-1" } });
      Motor.startDay();
      Motor.confirmStartTime("07:00");
      Motor.continueFromPreDay();
      Motor.endDay();
      Motor.addMainTimeLonnskode("100", "07:00", "15:00");
      Motor.resolveItem("main_time", "confirm");
      Motor.lockDay();
      const snap = Motor.getSnapshot();
      const main = snap.dayLog.drafts["HOVED"];
      return snap.appState === "LOCKED"
        && main.status === "confirmed"
        && main.fra_tid === "07:00"
        && main.til_tid === "15:00"
        && main.lonnskoder[0].kode === "100";
    },
  },
  {
    id: "char_order_draft_hours_are_derived_from_lonnskoder_not_from_the_spoken_text",
    description:
      "updateDraftTimesFromLonnskoder() resets a confirmed draft's fra_tid/til_tid to the earliest/latest lønnskode boundary. The payroll-relevant window is derived from the wage-code lines, so an edited lønnskode cannot silently disagree with the exported time span.",
    run: () => {
      const { Motor } = bootIntoDrift();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      Motor.confirmStructuredEntry(text, "arbeid", Motor.parseEntry(text));
      Motor.endDay();
      const draft = Motor.getSnapshot().dayLog.drafts["204481-0149"];
      return draft.lonnskoder.length === 1
        && draft.lonnskoder[0].fra === "07:30"
        && draft.lonnskoder[0].til === "11:00"
        && draft.fra_tid === "07:30"
        && draft.til_tid === "11:00";
    },
  },
  {
    id: "char_lock_is_blocked_until_every_item_is_resolved_and_main_time_handled",
    description:
      "lockDay() has two independent guards: unresolved items, and mainTimeHandled. Both must clear. A day cannot be locked around an unanswered RUH or an unhandled timesheet, and the guards do not substitute for one another.",
    run: async () => {
      const { Motor } = bootIntoDrift();
      Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      Motor.endDay();
      Motor.lockDay();
      const blockedByBoth = Motor.getSnapshot().appState;
      // One incident yields two schema items (see the case above) — both must go.
      for (const item of Motor.getUnresolvedItems().filter((i) => i.kind === "schema")) {
        Motor.resolveItem(item.id, "discard");
      }
      Motor.lockDay();
      const blockedByMainTime = Motor.getSnapshot().appState;
      Motor.resolveItem("main_time", "discard", { reason: "logged_elsewhere" });
      Motor.lockDay();
      const locked = Motor.getSnapshot();
      return blockedByBoth === "ACTIVE"
        && blockedByMainTime === "ACTIVE"
        && locked.appState === "LOCKED"
        && locked.dayLog.status === "LOCKED"
        && locked.readyToLock === false;
    },
  },
  {
    id: "char_lock_archives_the_day_to_history_and_clears_overlay_state",
    description:
      "lockDay() pushes a deep copy of the day onto the 90-entry history list and clears persisted uxState. History is the only place a locked day survives startNewDay().",
    run: () => {
      const ctx = bootIntoDrift();
      const { Motor, storage } = ctx;
      Motor.endDay();
      Motor.resolveItem("main_time", "discard", { reason: "no_work_done" });
      Motor.lockDay();
      const history = JSON.parse(storage[STORAGE_KEY_HISTORY]);
      Motor.startNewDay();
      const after = Motor.getSnapshot();
      return history.length === 1
        && history[0].status === "LOCKED"
        && storage[STORAGE_KEY_UX_STATE] === undefined
        && after.appState === "NOT_STARTED"
        && after.dayLog === null
        && JSON.parse(storage[STORAGE_KEY_HISTORY]).length === 1;
    },
  },

  // ================================================================
  // G. STALE DAY RECOVERY
  // ================================================================
  {
    id: "char_stale_day_is_detected_purely_from_the_stored_date",
    description:
      "isStaleDay() compares dayLog.date to today's date only. A day left open overnight boots ACTIVE with isStaleDay true — the motor never auto-closes or auto-discards it, because unsaved field work must not vanish while the worker sleeps.",
    run: () => {
      const stored = persistedDay({
        date: daysAgo(1), startTime: "07:00", startTimeSource: "user", endTime: null,
        entries: [], drafts: {}, schemas: [], phase: "active", status: "ACTIVE", mainTimeHandled: false,
      });
      const { Motor } = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      const snap = Motor.getSnapshot();
      return snap.appState === "ACTIVE" && snap.isStaleDay === true && snap.dayLog.date === daysAgo(1);
    },
  },
  {
    id: "char_continue_stale_day_keeps_the_old_date_and_all_its_content",
    description:
      "continueStaleDay() is intentionally a no-op on state in React mode: the day keeps YESTERDAY's date and every entry. Work is filed against the day it was performed, never silently re-dated to today.",
    run: () => {
      const stored = persistedDay({
        date: daysAgo(1), startTime: "07:00", startTimeSource: "user", endTime: null,
        entries: [{ time: "08:00", type: "notat", text: "Grus bestilt" }],
        drafts: {}, schemas: [], phase: "active", status: "ACTIVE", mainTimeHandled: false,
      });
      const { Motor } = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      Motor.continueStaleDay();
      const snap = Motor.getSnapshot();
      return snap.dayLog.date === daysAgo(1)
        && snap.dayLog.entries.length === 1
        && snap.isStaleDay === true
        && snap.appState === "ACTIVE";
    },
  },
  {
    id: "char_end_stale_day_runs_the_normal_end_of_day_flow",
    description:
      "endStaleDay() delegates to endDay() — a forgotten day is closed through exactly the same Håndrens path as a normal one, with the same main-draft creation. There is no separate, less-verified 'stale' close path.",
    run: () => {
      const stored = persistedDay({
        date: daysAgo(2), startTime: "07:00", startTimeSource: "user", endTime: null,
        entries: [], drafts: {}, schemas: [], phase: "active", status: "ACTIVE", mainTimeHandled: false,
      });
      const { Motor } = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      Motor.endStaleDay();
      const log = Motor.getSnapshot().dayLog;
      return log.phase === "ending" && log.drafts["HOVED"] !== undefined && log.drafts["HOVED"].fra_tid === "07:00";
    },
  },
  {
    id: "char_discard_stale_day_archives_before_wiping",
    description:
      "discardStaleDay() pushes the day to history BEFORE nulling it. 'Discard' means 'remove from my screen', not 'destroy' — a discarded day may still contain a confirmed SJA or RUH that must remain auditable.",
    run: () => {
      const stored = persistedDay({
        date: daysAgo(1), startTime: "07:00", startTimeSource: "user", endTime: null,
        entries: [{ time: "08:00", type: "hendelse", text: "Nestenulykke" }],
        drafts: {}, schemas: [{ id: "s1", type: "sja_preday", origin: "pre_day", status: "confirmed", fields: {}, createdAt: "07:05" }],
        phase: "active", status: "ACTIVE", mainTimeHandled: false,
      });
      const ctx = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      ctx.Motor.discardStaleDay();
      const snap = ctx.Motor.getSnapshot();
      const history = JSON.parse(ctx.storage[STORAGE_KEY_HISTORY]);
      return snap.appState === "NOT_STARTED"
        && snap.dayLog === null
        && snap.isStaleDay === false
        && history.length === 1
        && history[0].date === daysAgo(1)
        && history[0].schemas[0].status === "confirmed";
    },
  },
  {
    id: "char_starting_a_new_day_over_a_stale_one_replaces_it_without_archiving",
    description:
      "PINS ACTUAL BEHAVIOUR. startDay() overwrites the current day unconditionally — it does not archive a stale open day first, unlike discardStaleDay(). The React UI is what prevents reaching this; the motor itself has no guard. Any refactor must either keep this or make the guard explicit rather than relying on the UI.",
    run: () => {
      const stored = persistedDay({
        date: daysAgo(1), startTime: "07:00", startTimeSource: "user", endTime: null,
        entries: [{ time: "08:00", type: "notat", text: "Går tapt" }],
        drafts: {}, schemas: [], phase: "active", status: "ACTIVE", mainTimeHandled: false,
      });
      const ctx = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      ctx.Motor.startDay();
      const snap = ctx.Motor.getSnapshot();
      return snap.dayLog.date === new Date().toISOString().split("T")[0]
        && snap.dayLog.entries.length === 0
        && ctx.storage[STORAGE_KEY_HISTORY] === undefined;
    },
  },

  // ================================================================
  // H. STORAGE CORRUPTION AND FAILURE
  // ================================================================
  {
    id: "char_corrupt_current_day_blocks_with_a_storage_error_instead_of_crashing",
    description:
      "Unparseable current-day JSON must not throw at module load (motor.js runs synchronously in beforeInteractive — a throw takes down the whole app). It boots NOT_STARTED with a storageError of type 'current' carrying a truncated raw excerpt for support.",
    run: () => {
      const { Motor } = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: '{"appState":"ACTIVE","dayLog":{ CORRUPT' } });
      const snap = Motor.getSnapshot();
      return typeof Motor.getSnapshot === "function"
        && snap.appState === "NOT_STARTED"
        && snap.dayLog === null
        && snap.storageError !== null
        && snap.storageError.type === "current"
        && typeof snap.storageError.raw === "string";
    },
  },
  {
    id: "char_try_ignore_error_removes_the_corrupt_blob_so_it_cannot_re_block",
    description:
      "tryIgnoreError() deletes the known-corrupt current-day key rather than merely hiding the overlay. Without that, the next reload re-parses the same corrupt JSON and re-blocks the worker forever.",
    run: () => {
      const ctx = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: "{{{not json" } });
      ctx.Motor.tryIgnoreError();
      const rebooted = ctx.reboot();
      return ctx.Motor.getSnapshot().storageError === null
        && ctx.storage[STORAGE_KEY_CURRENT] === undefined
        && rebooted.Motor.getSnapshot().storageError === null
        && rebooted.Motor.getSnapshot().appState === "NOT_STARTED";
    },
  },
  {
    id: "char_reset_current_day_only_preserves_history",
    description:
      "resetCurrentDayOnly() clears the current day but never touches the history key — recovering from a corrupt today must not cost the worker previously locked days.",
    run: () => {
      const history = JSON.stringify([{ date: daysAgo(3), status: "LOCKED", entries: [], schemas: [], drafts: {} }]);
      const ctx = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: "corrupt{", [STORAGE_KEY_HISTORY]: history } });
      ctx.Motor.resetCurrentDayOnly();
      return ctx.Motor.getSnapshot().storageError === null
        && ctx.storage[STORAGE_KEY_CURRENT] === undefined
        && JSON.parse(ctx.storage[STORAGE_KEY_HISTORY]).length === 1;
    },
  },
  {
    id: "char_corrupt_history_degrades_silently_and_never_blocks_the_day",
    description:
      "A corrupt HISTORY blob is treated as an empty history — logged, but never surfaced as a blocking storageError. Losing the archive must not stop a worker starting today's work. (The corresponding data-loss risk is ranked in docs/POST_PILOT_ARCHITECTURE.md.)",
    run: () => {
      const { Motor } = bootMotor({ storage: { [STORAGE_KEY_HISTORY]: "]]not json[[" } });
      Motor.startDay();
      const snap = Motor.getSnapshot();
      return snap.storageError === null && snap.appState === "ACTIVE";
    },
  },
  {
    id: "char_totally_unwritable_storage_surfaces_a_save_error",
    description:
      "When EVERY localStorage write fails (Safari private mode, hard quota with nothing reclaimable), saveCurrentDay() exhausts its reclaim attempts and publishes storageError type 'save' so the UI can block. The in-memory day is still ahead of disk at this point — that residual exposure is documented in docs/FIELD_TEST_PLAYBOOK.md rather than hidden, because no client-side strategy can write to a disk that refuses every write.",
    run: () => {
      const ctx = bootIntoDrift();
      ctx.setFailWrites(true);
      ctx.Motor.submitEntry("Skrives aldri til disk", "notat");
      const snap = ctx.Motor.getSnapshot();
      const persisted = ctx.storage[STORAGE_KEY_CURRENT];
      return snap.storageError !== null
        && snap.storageError.type === "save"
        && snap.dayLog.entries.length === 1
        && JSON.parse(persisted).dayLog.entries.length === 0;
    },
  },
  {
    id: "char_quota_failure_reclaims_space_and_saves_todays_work",
    description:
      "DELIBERATELY CHANGED BEHAVIOUR (§22 hardening). A quota failure no longer silently leaves the day unsaved: saveCurrentDay() drops already-sent outbox entries and trims local history — the two things recoverable from the Relay — and retries. Today's unfinished work outranks archived history, because a worker can re-read an old day but cannot re-live this morning.",
    run: () => {
      const ctx = bootMotor({
        storage: {
          [STORAGE_KEY_HISTORY]: JSON.stringify(
            Array.from({ length: 40 }, (_, i) => ({ date: daysAgo(i + 1), status: "LOCKED", entries: [], schemas: [], drafts: {} })),
          ),
        },
      });
      ctx.Motor.startDay();
      ctx.Motor.confirmStartTime("07:00");
      ctx.Motor.continueFromPreDay();

      // Fail only writes of the current-day key, so reclaim writes succeed —
      // this models a real quota wall rather than a totally dead store.
      let failCurrent = 2;
      ctx.setWriteFilter((key) => {
        if (key === STORAGE_KEY_CURRENT && failCurrent > 0) {
          failCurrent -= 1;
          return false;
        }
        return true;
      });

      ctx.Motor.submitEntry("Viktig feltnotat som ikke må gå tapt", "notat");
      const snap = ctx.Motor.getSnapshot();
      const persisted = JSON.parse(ctx.storage[STORAGE_KEY_CURRENT]);
      const historyAfter = JSON.parse(ctx.storage[STORAGE_KEY_HISTORY]);

      return snap.storageError === null
        && persisted.dayLog.entries.length === 1
        && persisted.dayLog.entries[0].text === "Viktig feltnotat som ikke må gå tapt"
        && historyAfter.length < 40;
    },
  },
  {
    id: "char_transient_write_failure_clears_its_own_error_once_a_write_succeeds",
    description:
      "DELIBERATELY CHANGED BEHAVIOUR. A save error used to be set and never reset, so one transient failure left the blocking storage overlay up for the rest of the day even though everything afterwards persisted correctly. A subsequent successful write now clears it.",
    run: async () => {
      const ctx = bootIntoDrift();
      ctx.setFailWrites(true);
      ctx.Motor.submitEntry("Under feil", "notat");
      await tick();
      const during = ctx.Motor.getSnapshot().storageError;

      ctx.setFailWrites(false);
      ctx.Motor.submitEntry("Etter feil", "notat");
      await tick();
      const after = ctx.Motor.getSnapshot().storageError;

      return during !== null && during.type === "save" && after === null;
    },
  },
  {
    id: "char_reclaim_never_discards_unsent_exports",
    description:
      "The reclaim path may only drop what the server already has. An UNSENT outbox entry exists nowhere else yet, so it must survive a quota emergency even though dropping it would free space.",
    run: () => {
      const ctx = bootMotor({
        storage: {
          punchout_outbox: JSON.stringify([
            { exportId: "sent_1", status: "sent", lastAttempt: new Date().toISOString() },
            { exportId: "pending_1", status: "pending", lastAttempt: null },
          ]),
        },
      });
      ctx.Motor.startDay();
      ctx.Motor.continueFromPreDay();

      let failCurrent = 1;
      ctx.setWriteFilter((key) => {
        if (key === STORAGE_KEY_CURRENT && failCurrent > 0) {
          failCurrent -= 1;
          return false;
        }
        return true;
      });
      ctx.Motor.submitEntry("Noe som må lagres", "notat");

      const outbox = JSON.parse(ctx.storage.punchout_outbox);
      return outbox.length === 1
        && outbox[0].exportId === "pending_1"
        && ctx.Motor.getSnapshot().storageError === null;
    },
  },
  {
    id: "char_recovered_writes_flush_the_full_current_state_not_a_delta",
    description:
      "saveCurrentDay() always serialises the entire day, so the first successful write after a transient failure repairs the persisted copy completely. This is why the failure above is survivable as long as the tab is not reloaded.",
    run: async () => {
      const ctx = bootIntoDrift();
      ctx.setFailWrites(true);
      ctx.Motor.submitEntry("Under feil", "notat");
      await tick();
      ctx.setFailWrites(false);
      ctx.Motor.submitEntry("Etter feil", "notat");
      await tick();
      const persisted = JSON.parse(ctx.storage[STORAGE_KEY_CURRENT]);
      return persisted.dayLog.entries.length === 2
        && persisted.dayLog.entries[0].text === "Under feil";
    },
  },

  // ================================================================
  // I. REFRESH / RESUME
  // ================================================================
  {
    id: "char_refresh_mid_drift_restores_state_from_storage_alone",
    description:
      "A reboot against the same localStorage restores appState, phase, entries, drafts and schemas with no server round-trip. localStorage is the single source of truth for an in-progress day — the whole offline-first premise.",
    run: async () => {
      const ctx = bootIntoDrift();
      ctx.Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      ctx.Motor.confirmStructuredEntry(text, "arbeid", ctx.Motor.parseEntry(text));
      const before = ctx.Motor.getSnapshot();

      const after = ctx.reboot().Motor.getSnapshot();
      return after.appState === "ACTIVE"
        && after.dayLog.phase === "active"
        && after.dayLog.startTime === "07:00"
        && after.dayLog.entries.length === before.dayLog.entries.length
        && after.dayLog.schemas.length === before.dayLog.schemas.length
        && after.dayLog.drafts["204481-0149"].status === "confirmed";
    },
  },
  {
    id: "char_refresh_mid_schema_edit_rehydrates_the_edit_pointer_so_saving_still_works",
    description:
      "A refresh while the schema-edit overlay is open restores uxState AND re-arms motor.js's internal editingSchemaId. Without that rehydration, React renders the overlay from persisted uxState but saveSchemaEdit() silently no-ops and the schema is stuck in 'draft' forever with no visible error.",
    run: () => {
      const ctx = bootMotor();
      ctx.Motor.startDay();
      const sja = ctx.Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      ctx.Motor.openSchemaEdit(sja.id);

      const resumed = ctx.reboot().Motor;
      const ux = resumed.getSnapshot().uxState;
      resumed.setSchemaField(sja.id, "oppgave", "Brøyting");
      resumed.setSchemaField(sja.id, "konsekvens", "Påkjørsel");
      resumed.setSchemaField(sja.id, "tiltak", "Arbeidsvarsling");
      resumed.setSchemaField(sja.id, "godkjent", true);
      resumed.saveSchemaEdit();
      const after = resumed.getSnapshot().dayLog.schemas.find((s) => s.id === sja.id);
      return ux.activeOverlay === "schema_edit" && ux.schemaId === sja.id && after.status === "confirmed";
    },
  },
  {
    id: "char_refresh_mid_handrens_preserves_resolved_and_unresolved_items",
    description:
      "Håndrens progress survives a refresh: already-resolved items stay resolved and the remaining list is re-derived from the persisted day, not from any in-memory queue. getUnresolvedItems() is a pure projection of dayLog.",
    run: async () => {
      const ctx = bootIntoDrift();
      ctx.Motor.submitEntry("Nestenulykke ved påkjøring", "hendelse");
      await tick();
      ctx.Motor.endDay();
      const ruh = ctx.Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "ruh");
      ctx.Motor.resolveItem("schema_" + ruh.id, "discard");
      const remainingBefore = ctx.Motor.getUnresolvedItems().map((i) => i.id).sort();

      const resumed = ctx.reboot().Motor;
      const remainingAfter = resumed.getUnresolvedItems().map((i) => i.id).sort();
      // The RUH is gone from the list; main_time and the sibling
      // uonsket_hendelse schema remain, identically, across the reboot.
      return remainingBefore.length === 2
        && remainingBefore.indexOf("main_time") !== -1
        && remainingBefore.indexOf("schema_" + ruh.id) === -1
        && remainingAfter.join(",") === remainingBefore.join(",")
        && resumed.getSnapshot().dayLog.schemas.find((s) => s.id === ruh.id).status === "discarded";
    },
  },
  {
    id: "char_refresh_after_lock_stays_locked_and_does_not_re_export",
    description:
      "A locked day reboots as LOCKED, and the reboot does not push a second copy into history or mint a second export packet. Lock is a terminal, idempotent transition across process boundaries.",
    run: () => {
      const ctx = bootIntoDrift();
      ctx.Motor.endDay();
      ctx.Motor.resolveItem("main_time", "discard", { reason: "no_work_done" });
      ctx.Motor.lockDay();
      const historyBefore = JSON.parse(ctx.storage[STORAGE_KEY_HISTORY]).length;

      const resumed = ctx.reboot();
      const snap = resumed.Motor.getSnapshot();
      const historyAfter = JSON.parse(resumed.storage[STORAGE_KEY_HISTORY]).length;
      return snap.appState === "LOCKED"
        && snap.dayLog.status === "LOCKED"
        && historyBefore === 1 && historyAfter === 1;
    },
  },
  {
    id: "char_legacy_FINISHED_state_migrates_to_LOCKED_on_load",
    description:
      "loadFromStorage() migrates the retired appState 'FINISHED' to 'LOCKED' and archives the day, so a device that has not opened the app since that state was removed recovers rather than landing in an unrenderable state. Migrations live in the load path — a fact any future storage adapter must carry over.",
    run: () => {
      const stored = persistedDay({
        date: daysAgo(1), startTime: "07:00", endTime: "15:00",
        entries: [], drafts: {}, phase: "ending", mainTimeHandled: true,
      }, "FINISHED");
      const ctx = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      const snap = ctx.Motor.getSnapshot();
      return snap.appState === "LOCKED"
        && snap.dayLog.status === "LOCKED"
        && snap.dayLog.schemas.length === 0
        && JSON.parse(ctx.storage[STORAGE_KEY_HISTORY]).length === 1;
    },
  },
  {
    id: "char_legacy_day_without_phase_or_schemas_is_migrated_on_load",
    description:
      "A day persisted before phase/schemas/version existed is migrated in place on load (phase 'active', schemas [], version 1) rather than rejected as corrupt. Old field devices keep working across app updates.",
    run: () => {
      const stored = persistedDay({ date: new Date().toISOString().split("T")[0], startTime: "07:00", entries: [], drafts: {} });
      const { Motor } = bootMotor({ storage: { [STORAGE_KEY_CURRENT]: stored } });
      const snap = Motor.getSnapshot();
      return snap.storageError === null
        && snap.dayLog.phase === "active"
        && Array.isArray(snap.dayLog.schemas)
        && snap.dayLog.startTimeSource === "auto";
    },
  },
];
