/**
 * CONFIGURATION CONTRACT REGRESSION CASES
 * =======================================
 * Post-pilot engineering baseline. These pin the contract between
 *
 *   public/punchout-config.js  (static, documented, single-org fallback path)
 *   lib/organization/types.mjs toRuntimeConfig()  (compiled multi-org path)
 *   app/layout.tsx buildInjectedConfigScript()    (what the browser receives)
 *   public/motor.js normalizeConfig()             (what the motor consumes)
 *   hooks/use-motor-state.ts RuntimeConfig        (what React is typed against)
 *
 * Two real, verified contract breaks existed on this chain before these cases
 * were written, both silent (no error, no warning, no failing test anywhere):
 *
 *   1. MAIN ORDER NEVER REACHED THE MOTOR. normalizeConfig() read
 *      `raw.hoofdordre` and assigned the result to `ADMIN_CONFIG.hoofdordre`,
 *      while all 12 real reads in motor.js use `ADMIN_CONFIG.hovedordre` —
 *      a key only ever set to the hardcoded literal "HOVED". Mesta's real
 *      active order (204481-0014) therefore never keyed the main timesheet
 *      draft, and never appeared as `ordre` on the exported main-time line.
 *
 *   2. WAGE-CODE LABELS SILENTLY DEGRADED TO THEIR CODE. normalizeConfig()
 *      read `lk.naam` — a spelling no producer in this repo emits — so the
 *      documented `{ kode, navn }` form in public/punchout-config.js fell
 *      through to `lk.kode`, showing "100" where "Ordinær arbeidstid" was
 *      configured.
 *
 * Same {id, description, run} shape as motor-cases.mjs so run.mjs can combine
 * them. Boots motor.js in a vm sandbox with a caller-supplied PUNCHOUT_CONFIG,
 * which motor-cases.mjs's own bootMotor() deliberately does not allow.
 */
import fs from "node:fs";
import vm from "node:vm";

const MOTOR_SRC = fs.readFileSync("./public/motor.js", "utf8");

/**
 * Boot motor.js with an explicit window.PUNCHOUT_CONFIG.
 * @param {object} punchoutConfig raw config exactly as a <script> would set it
 * @returns {{Motor: any, window: any}}
 */
function bootMotorWithConfig(punchoutConfig) {
  const kv = {};
  const localStorage = {
    getItem: (k) => (k in kv ? kv[k] : null),
    setItem: (k, v) => { kv[k] = String(v); },
    removeItem: (k) => { delete kv[k]; },
  };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const windowStub = {
    PUNCHOUT_CONFIG: punchoutConfig,
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
  return { Motor: sandbox.window.Motor, window: windowStub };
}

/** The exact shape public/punchout-config.js ships today. Kept literal, not
 * imported, so a silent edit to that file surfaces here as a failing case
 * rather than as a test that quietly follows the change. */
const STATIC_CONFIG_FILE_SHAPE = {
  lonnskoder: [
    { kode: "100", navn: "Ordinær arbeidstid" },
    { kode: "200", navn: "Overtid 50%" },
    { kode: "300", navn: "Overtid 100%" },
    { kode: "999", navn: "TESTKODE" },
  ],
  kjoretoy: ["AB 12345", "CD 67890", "EF 11111"],
  sjaDefaults: { sted: "", arbeidsvarsling: "enkel" },
  externalLinks: [
    { id: "elrapp", title: "Logg inn i Elrapp", url: "https://elrapp.atlas.vegvesen.no/login" },
    { id: "linx", title: "Linx-innlogging", url: "https://linx.no" },
  ],
  hovedordre: "HOVED",
};

/** Drive a day to the point where the main timesheet draft exists. */
function toMainDraft(Motor) {
  Motor.startDay();
  Motor.continueFromPreDay();
  Motor.endDay();
  return Motor.getSnapshot().dayLog.drafts;
}

export const CONFIG_CONTRACT_CASES = [
  // ----------------------------------------------------------------
  // 1. MAIN ORDER (hovedordre / hoofdordre)
  // ----------------------------------------------------------------
  {
    id: "config_contract_hovedordre_from_static_config_reaches_main_draft",
    description:
      "public/punchout-config.js's documented `hovedordre` must key the main timesheet draft. Previously normalizeConfig() read only `hoofdordre`, so this field was ignored entirely and the draft was always keyed 'HOVED'.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, hovedordre: "204481-0014" });
      const drafts = toMainDraft(Motor);
      return Object.prototype.hasOwnProperty.call(drafts, "204481-0014")
        && drafts["204481-0014"].ordre === "204481-0014"
        && drafts["204481-0014"].isMain === true
        && !Object.prototype.hasOwnProperty.call(drafts, "HOVED");
    },
  },
  {
    id: "config_contract_primary_active_order_must_not_become_the_main_bucket",
    description:
      "GUARDS AGAINST A REGRESSION THIS MISSION ACTUALLY INTRODUCED AND REVERTED. `hoofdordre` (the organization's primary ACTIVE WORK ORDER, from toRuntimeConfig) must never be adopted as `hovedordre` (the main timesheet bucket). Mapping one to the other collides the worker's confirmed work draft with the main-time slot: getUnresolvedItems() then returns ZERO items while mainTimeHandled stays false — lockDay blocked forever with nothing to resolve — and a main-time discard silently flips real confirmed work to 'discarded'. Caught by lib/regression/cross-organization.mjs, pinned here so it cannot come back.",
    run: () => {
      const raw = { ...STATIC_CONFIG_FILE_SHAPE };
      delete raw.hovedordre;
      const { Motor } = bootMotorWithConfig({ ...raw, hoofdordre: "204481-0149" });
      // The worker books real work against the organization's primary order.
      Motor.startDay();
      Motor.confirmStartTime("07:00");
      Motor.continueFromPreDay();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      Motor.confirmStructuredEntry(text, "arbeid", Motor.parseEntry(text));
      Motor.endDay();
      const drafts = Motor.getSnapshot().dayLog.drafts;
      const mainTime = Motor.getUnresolvedItems().find((i) => i.kind === "main_time");
      return drafts["HOVED"] !== undefined
        && drafts["HOVED"].isMain === true
        && drafts["204481-0149"].status === "confirmed"
        && drafts["204481-0149"].isMain === undefined
        && !!mainTime
        && mainTime.data.ordre === "HOVED";
    },
  },
  {
    id: "config_contract_primary_active_order_is_still_exposed_to_consumers",
    description:
      "Keeping the two fields separate must not drop `hoofdordre` from the snapshot — lib/sync/dry-run.mjs and any future order-picker UI read it. It passes through untouched, and is empty rather than undefined when unknown.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, hoofdordre: "204481-0014" });
      const withOrder = Motor.getSnapshot().config;
      const { Motor: bare } = bootMotorWithConfig(STATIC_CONFIG_FILE_SHAPE);
      return withOrder.hoofdordre === "204481-0014"
        && withOrder.hovedordre === "HOVED"
        && bare.getSnapshot().config.hoofdordre === "";
    },
  },
  {
    id: "config_contract_hovedordre_falls_back_to_HOVED_when_unconfigured",
    description:
      "With no `hovedordre` configured, the documented PILOT_DEFAULTS fallback 'HOVED' must apply — the fix must not have turned an unconfigured org into an empty or undefined main-bucket key, which would make every main draft key on the empty string.",
    run: () => {
      const raw = { ...STATIC_CONFIG_FILE_SHAPE };
      delete raw.hovedordre;
      const { Motor } = bootMotorWithConfig(raw);
      const drafts = toMainDraft(Motor);
      return drafts["HOVED"] !== undefined && Motor.getSnapshot().config.hovedordre === "HOVED";
    },
  },
  {
    id: "config_contract_main_order_shown_to_worker_in_handrens",
    description:
      "The user-visible consequence of the main-order break: getUnresolvedItems()'s main_time entry — the card the worker actually reviews and signs off in Håndrens — carried the organization's real order only if ADMIN_CONFIG.hovedordre was correct. It reported 'HOVED' for every organization before the fix.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, hovedordre: "204481-0014" });
      Motor.startDay();
      Motor.confirmStartTime("07:00");
      Motor.continueFromPreDay();
      Motor.endDay();
      const mainTime = Motor.getUnresolvedItems().find((i) => i.kind === "main_time");
      return !!mainTime && mainTime.data.ordre === "204481-0014" && mainTime.data.startTime === "07:00";
    },
  },
  {
    id: "config_contract_configured_main_bucket_coexists_with_real_order_drafts",
    description:
      "An organization that renames its main bucket (e.g. 'TIMEBANK') must still keep real order drafts entirely separate: resolving the main time must not touch them. Uses the only main-time resolution React can actually reach today — discard with a reason; see the characterization suite for why confirm is unreachable.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, hovedordre: "TIMEBANK" });
      Motor.startDay();
      Motor.confirmStartTime("07:00");
      Motor.continueFromPreDay();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      const parsed = Motor.parseEntry(text);
      if (!parsed) return false;
      Motor.confirmStructuredEntry(text, "arbeid", parsed);
      Motor.endDay();
      Motor.resolveItem("main_time", "discard", { reason: "logged_elsewhere" });
      const drafts = Motor.getSnapshot().dayLog.drafts;
      return drafts["TIMEBANK"] !== undefined
        && drafts["TIMEBANK"].status === "discarded"
        && drafts["204481-0149"].status === "confirmed"
        && drafts["HOVED"] === undefined;
    },
  },
  {
    id: "config_contract_main_bucket_and_primary_order_stay_independent",
    description:
      "Both fields appear on getSnapshot().config (typed as RuntimeConfig in hooks/use-motor-state.ts) and must be independently settable. Neither may default to the other's value — that coupling is exactly the deadlock guarded above.",
    run: () => {
      const { Motor } = bootMotorWithConfig({
        ...STATIC_CONFIG_FILE_SHAPE,
        hovedordre: "BUCKET",
        hoofdordre: "204481-0014",
      });
      const config = Motor.getSnapshot().config;
      return config.hovedordre === "BUCKET" && config.hoofdordre === "204481-0014";
    },
  },

  // ----------------------------------------------------------------
  // 2. WAGE CODE LABELS (navn / label)
  // ----------------------------------------------------------------
  {
    id: "config_contract_lonnskode_navn_becomes_label",
    description:
      "public/punchout-config.js documents `{ kode, navn }` as a supported wage-code form (section 1). normalizeConfig() read the non-existent spelling `naam`, so every such code degraded to its own kode as the display label — 'Ordinær arbeidstid' rendered as '100'.",
    run: () => {
      const { Motor } = bootMotorWithConfig(STATIC_CONFIG_FILE_SHAPE);
      const codes = Motor.getSnapshot().config.lonnskoder;
      return codes.length === 4
        && codes[0].kode === "100" && codes[0].label === "Ordinær arbeidstid"
        && codes[1].label === "Overtid 50%"
        && codes[2].label === "Overtid 100%";
    },
  },
  {
    id: "config_contract_lonnskode_label_form_still_supported",
    description:
      "The compiled path (toRuntimeConfig maps WageCode.label) emits `{ kode, label }`. That form must keep working unchanged — `label` takes precedence over `navn`.",
    run: () => {
      const { Motor } = bootMotorWithConfig({
        ...STATIC_CONFIG_FILE_SHAPE,
        lonnskoder: [{ kode: "100", label: "Fra runtime", navn: "Fra statisk fil" }],
      });
      const codes = Motor.getSnapshot().config.lonnskoder;
      return codes.length === 1 && codes[0].label === "Fra runtime";
    },
  },
  {
    id: "config_contract_lonnskode_without_any_name_falls_back_to_kode",
    description:
      "A wage code with neither `label` nor `navn` must still render something rather than 'undefined' — the kode itself. This fallback predates the fix and must survive it.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, lonnskoder: [{ kode: "500" }] });
      const codes = Motor.getSnapshot().config.lonnskoder;
      return codes.length === 1 && codes[0].label === "500";
    },
  },
  {
    id: "config_contract_lonnskode_defaults_apply_when_not_an_array",
    description:
      "A missing or malformed lonnskoder value must fall back to PILOT_DEFAULTS (DEFAULT_LONNSKODER), never leave the timesheet with zero selectable codes.",
    run: () => {
      const raw = { ...STATIC_CONFIG_FILE_SHAPE };
      delete raw.lonnskoder;
      const { Motor } = bootMotorWithConfig(raw);
      const codes = Motor.getSnapshot().config.lonnskoder;
      return codes.length === 4 && codes[0].kode === "ORD" && codes[0].label === "Ordinær";
    },
  },

  {
    id: "config_contract_structured_entry_uses_a_configured_lonnskode",
    description:
      "confirmStructuredEntry() is the only path that puts a lønnskode on an order draft in React mode, and it hardcoded the literal 'ORD' — a DEFAULT_LONNSKODER code that appears in no organization's configured wageCodes. Every structured order line the pilot exported therefore carried a wage code payroll was never told about. It must now use the organization's own first configured code.",
    run: () => {
      const { Motor } = bootMotorWithConfig(STATIC_CONFIG_FILE_SHAPE);
      Motor.startDay();
      Motor.continueFromPreDay();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      const parsed = Motor.parseEntry(text);
      if (!parsed) return false;
      Motor.confirmStructuredEntry(text, "arbeid", parsed);
      const draft = Motor.getSnapshot().dayLog.drafts["204481-0149"];
      const configuredCodes = Motor.getSnapshot().config.lonnskoder.map((lk) => lk.kode);
      return !!draft
        && draft.lonnskoder.length === 1
        && draft.lonnskoder[0].kode === "100"
        && configuredCodes.indexOf(draft.lonnskoder[0].kode) !== -1
        && draft.lonnskoder[0].fra === "07:30"
        && draft.lonnskoder[0].til === "11:00";
    },
  },
  {
    id: "config_contract_structured_entry_lonnskode_falls_back_when_no_codes_configured",
    description:
      "With an empty configured wage-code list the old literal 'ORD' must remain as the last-resort fallback — matching teAddLonnskode()'s existing precedent — so the fix above cannot produce an undefined kode.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, lonnskoder: [] });
      Motor.startDay();
      Motor.continueFromPreDay();
      const text = "204481-0149 fra 07:30 til 11:00 asfaltarbeid";
      const parsed = Motor.parseEntry(text);
      if (!parsed) return false;
      Motor.confirmStructuredEntry(text, "arbeid", parsed);
      const draft = Motor.getSnapshot().dayLog.drafts["204481-0149"];
      return !!draft && draft.lonnskoder.length === 1 && draft.lonnskoder[0].kode === "ORD";
    },
  },

  // ----------------------------------------------------------------
  // 3. VEHICLES (kjoretoy)
  // ----------------------------------------------------------------
  {
    id: "config_contract_kjoretoy_passes_through_verbatim",
    description:
      "components/punchout/start-day-phase.tsx renders config.kjoretoy directly as quick-pick buttons for the kjoretoyssjekk field. The array must reach the snapshot verbatim, in order, with no reshaping.",
    run: () => {
      const { Motor } = bootMotorWithConfig(STATIC_CONFIG_FILE_SHAPE);
      const kj = Motor.getSnapshot().config.kjoretoy;
      return Array.isArray(kj) && kj.length === 3 && kj[0] === "AB 12345" && kj[2] === "EF 11111";
    },
  },
  {
    id: "config_contract_kjoretoy_empty_means_free_text_not_defaults",
    description:
      "public/punchout-config.js documents `kjoretoy: []` as 'fri tekst (ingen nedtrekksliste)'. An explicitly empty array must stay empty — it must NOT be treated as missing and replaced by defaults, or the documented free-text mode would be unreachable.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, kjoretoy: [] });
      return Motor.getSnapshot().config.kjoretoy.length === 0;
    },
  },

  // ----------------------------------------------------------------
  // 4. SJA DEFAULTS
  // ----------------------------------------------------------------
  {
    id: "config_contract_sja_defaults_prefill_new_sja_schema",
    description:
      "sjaDefaults.arbeidsvarsling/sted must pre-fill a freshly created sja_preday instance (createSchemaInstance). This is the whole point of the section-3 config block, and nothing else in the suite covered it.",
    run: () => {
      const { Motor } = bootMotorWithConfig({
        ...STATIC_CONFIG_FILE_SHAPE,
        sjaDefaults: { sted: "Fv. 17 Steinkjer", arbeidsvarsling: "manuell" },
      });
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      return !!sja && sja.fields.sted === "Fv. 17 Steinkjer" && sja.fields.arbeidsvarsling === "manuell";
    },
  },
  {
    id: "config_contract_sja_default_arbeidsvarsling_is_a_legal_enum_option",
    description:
      "sjaDefaults.arbeidsvarsling is pre-filled into an enum field whose options are declared in PRE_DAY_SCHEMAS.sja_preday. The shipped default ('enkel') must be one of those options, or the config would seed a value the schema editor cannot represent.",
    run: () => {
      const { Motor } = bootMotorWithConfig(STATIC_CONFIG_FILE_SHAPE);
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      const def = Motor.getSchemaFieldDefinitions("sja_preday", "pre_day");
      const options = def && def.fields.arbeidsvarsling && def.fields.arbeidsvarsling.options;
      return !!sja && Array.isArray(options) && options.indexOf(sja.fields.arbeidsvarsling) !== -1;
    },
  },
  {
    id: "config_contract_sja_defaults_never_prefill_judgement_fields",
    description:
      "NEVER_AUTO_FILL (konsekvens/tiltak/risiko-style judgement fields) must stay null on a new SJA no matter what config says — the worker, not the config, owns them. Guards against a future config key quietly seeding a risk assessment.",
    run: () => {
      const { Motor } = bootMotorWithConfig({
        ...STATIC_CONFIG_FILE_SHAPE,
        sjaDefaults: { sted: "X", arbeidsvarsling: "full", konsekvens: "Ingen", tiltak: "Ingen" },
      });
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      return !!sja && sja.fields.konsekvens === null && sja.fields.tiltak === null;
    },
  },
  {
    id: "config_contract_null_sja_defaults_leaves_fields_empty",
    description:
      "Organizations with `sjaDefaults: null` (banenord, gronnvik, nordkraft runtime.json all ship exactly this) must get an entirely empty SJA, with no crash on the null.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, sjaDefaults: null });
      Motor.startDay();
      const sja = Motor.getSnapshot().dayLog.schemas.find((s) => s.type === "sja_preday");
      return !!sja && sja.fields.sted === null && sja.fields.arbeidsvarsling === null;
    },
  },

  // ----------------------------------------------------------------
  // 5. EXTERNAL LINKS
  // ----------------------------------------------------------------
  {
    id: "config_contract_external_links_pass_through_with_id_title_url",
    description:
      "components/punchout/start-day-phase.tsx keys on suggestion.id and renders suggestion.title / suggestion.url. All three must survive normalizeConfig unchanged, in configured order.",
    run: () => {
      const { Motor } = bootMotorWithConfig(STATIC_CONFIG_FILE_SHAPE);
      const links = Motor.getSnapshot().config.externalLinks;
      return links.length === 2
        && links[0].id === "elrapp"
        && links[0].title === "Logg inn i Elrapp"
        && links[0].url === "https://elrapp.atlas.vegvesen.no/login"
        && links[1].id === "linx";
    },
  },
  {
    id: "config_contract_external_links_empty_array_stays_empty",
    description:
      "app/layout.tsx emits `externalLinks: runtime.runtimeConfig?.externalLinks ?? []`. An organization that publishes no links must show no link buttons — an empty array must never be replaced by PILOT_DEFAULTS' Mesta-flavoured links, which would send another organization's workers to Elrapp.",
    run: () => {
      const { Motor } = bootMotorWithConfig({ ...STATIC_CONFIG_FILE_SHAPE, externalLinks: [] });
      return Motor.getSnapshot().config.externalLinks.length === 0;
    },
  },

  // ----------------------------------------------------------------
  // 6. WHOLE-CONTRACT SHAPE
  // ----------------------------------------------------------------
  {
    id: "config_contract_normalized_shape_matches_runtime_config_interface",
    description:
      "getSnapshot().config is what hooks/use-motor-state.ts types as RuntimeConfig. Every declared key must be present with the declared kind on a fully-configured boot, so the TS type is a description of reality rather than an aspiration.",
    run: () => {
      const { Motor } = bootMotorWithConfig(STATIC_CONFIG_FILE_SHAPE);
      const c = Motor.getSnapshot().config;
      return Array.isArray(c.lonnskoder)
        && c.lonnskoder.every((lk) => typeof lk.kode === "string" && typeof lk.label === "string")
        && c.sjaDefaults !== undefined
        && Array.isArray(c.kjoretoy)
        && Array.isArray(c.externalLinks)
        && typeof c.hovedordre === "string"
        && typeof c.hoofdordre === "string";
    },
  },
  {
    id: "config_contract_totally_absent_config_boots_with_documented_defaults",
    description:
      "A page served with no window.PUNCHOUT_CONFIG at all (script blocked, cache miss, provisioning race) must still boot the motor on PILOT_DEFAULTS rather than throw at module load — motor.js runs synchronously in beforeInteractive, so a throw here takes down the whole app.",
    run: () => {
      const { Motor } = bootMotorWithConfig(undefined);
      const c = Motor.getSnapshot().config;
      return typeof Motor.getSnapshot === "function"
        && c.hovedordre === "HOVED"
        && c.lonnskoder.length === 4
        && c.kjoretoy.length === 0
        && c.sjaDefaults === null;
    },
  },
];
