// --- React Mode ---
// When true, motor skips all DOM rendering (React handles UI)
var REACT_MODE = true;

// --- Constants ---
var STORAGE_KEY_CURRENT = "yournal_current_day";
var STORAGE_KEY_HISTORY = "yournal_history";

// Fields that must NEVER be auto-filled (user responsibility)
var NEVER_AUTO_FILL = ["konsekvens", "tiltak", "forslag_tiltak", "arsak", "vurdering"];

// ============================================================
// ADMIN CONFIGURATION (data, not logic)
// ============================================================

// Default wage codes — used as fallback when no config is provided
var DEFAULT_LONNSKODER = [
  { kode: "ORD",   label: "Ordin\u00e6r" },
  { kode: "OT50",  label: "Overtid 50%" },
  { kode: "OT100", label: "Overtid 100%" },
  { kode: "NATT",  label: "Nattillegg" }
];


// ============================================================
// PILOT DEFAULTS — eksplisitt fallback for all config.
// Brukes av normalizeConfig() når RUNTIME_CONFIG mangler felt.
// Endre her, ikke spredt i koden.
// ============================================================
var PILOT_DEFAULTS = {
  lonnskoder: DEFAULT_LONNSKODER,
  sjaDefaults: null,
  kjoretoy: [],
  externalLinks: [
    { id: "elrapp", title: "Logg inn i Elrapp", url: "https://elrapp.no" },
    { id: "linx",   title: "Linx-innlogging",   url: "https://linx.no"  },
  ],
  hoofdordre: "HOVED",
};

// ============================================================
// normalizeConfig — tar råconfig, returnerer fullstendig
// normalisert config med eksplisitt fallback for hvert felt.
// Kalles én gang ved init; NORMALIZED_CONFIG brukes overalt.
// ============================================================
function normalizeConfig(raw) {
  return {
    lonnskoder: Array.isArray(raw.lonnskoder)
      ? raw.lonnskoder.map(function(lk) {
          return { kode: lk.kode, label: lk.label || lk.naam || lk.kode };
        })
      : PILOT_DEFAULTS.lonnskoder.map(function(lk) { return { kode: lk.kode, label: lk.label }; }),
    sjaDefaults: raw.sjaDefaults || null,
    kjoretoy: Array.isArray(raw.kjoretoy) ? raw.kjoretoy : PILOT_DEFAULTS.kjoretoy,
    externalLinks: Array.isArray(raw.externalLinks) ? raw.externalLinks : PILOT_DEFAULTS.externalLinks,
    hoofdordre: raw.hoofdordre || PILOT_DEFAULTS.hoofdordre,
  };
}
var ADMIN_CONFIG = {
  // Required schemas - admin-controlled, blocks start if when() returns true
  // Schema is REQUIRED only if it appears here with when() returning true
  requiredSchemas: [
    // Example: { schema: "sja_preday", when: function(ctx) { return true; } }
    // Empty = nothing is required, user can always start
  ],

  // Conditional schemas - suggested based on context, shows question first
  conditionalSchemas: [
    // Example: winter friction check between 04:00-07:00
    // {
    //   schema: "friksjonsrunde",
    //   question: "Har du kj\u00f8rt friksjonsrunde i dag?",
    //   yesSchema: "friksjonsmaling",
    //   noSchema: "friksjon_aarsak",
    //   when: function(ctx) { return ctx.isWinter && ctx.hour >= 4 && ctx.hour <= 7; }
    // }
  ],

  // Season flags (set by admin)
  isWinter: false,  // Admin sets this based on season

  // Available pre-day schemas (for detection/triggering)
  availablePreDaySchemas: ["sja_preday", "kjoretoyssjekk"],

  // Available drift schemas
  availableDriftSchemas: ["hendelse", "vaktlogg", "friksjonsmaling"],

  // RUH trigger types (which entry types prompt for RUH)
  ruhTriggerTypes: ["hendelse"],

  // Immediate confirmation types (must be confirmed before next input)
  immediateConfirmTypes: ["vaktlogg"],

  // End-of-day confirmation types
  endOfDayConfirmTypes: ["friksjonsmaling"],

  // Note conversion targets
  noteConversionTargets: [
    { key: "loggbok_kjoretoy", label: "Loggbok kj\u00f8ret\u00f8y" },
    { key: "forbedringsforslag", label: "Forbedringsforslag" },
    { key: "kvalitetsavvik", label: "Kvalitetsavvik" },
    { key: "huskelapp", label: "Huskelapp (intern)" }
  ],

  // Available wage codes — set from DEFAULT_LONNSKODER, overridden by RUNTIME_CONFIG below
  lonnskoder: DEFAULT_LONNSKODER,

  // Main order number — overridden by RUNTIME_CONFIG below
  hovedordre: "HOVED",

  // Export configuration (edge → customer endpoint)
  userId: null,              // string — identifies the worker, default "anonymous"
  exportEndpoint: null,      // URL — null = export disabled
  exportHmacSecret: null     // string — null = no HMAC signature
};

// ============================================================
// RUNTIME CONFIG — normalises window.PUNCHOUT_CONFIG once at init.
// All motor code reads from ADMIN_CONFIG or RUNTIME_CONFIG, never
// from window.PUNCHOUT_CONFIG directly.
// ============================================================

var RUNTIME_CONFIG = (typeof window !== 'undefined' && window.PUNCHOUT_CONFIG)
  ? window.PUNCHOUT_CONFIG
  : {};

var NORMALIZED_CONFIG = normalizeConfig(RUNTIME_CONFIG);
ADMIN_CONFIG.lonnskoder = NORMALIZED_CONFIG.lonnskoder;
ADMIN_CONFIG.hoofdordre = NORMALIZED_CONFIG.hoofdordre;

// --- State ---
// Only one active day at a time. null = no active day.
var appState = "NOT_STARTED"; // NOT_STARTED | ACTIVE | FINISHED | LOCKED
var dayLog = null;
var editingIndex = -1;
var isListening = false;
var recognition = null;

// Voice hardening state
var voiceSessionActive = false;  // Prevents overlapping recognition instances
var voiceResultHandled = false;  // Single commit guard per session
var voiceState = "idle";         // "idle" | "listening" | "processing" | "error"
var voiceError = null;           // Human-readable error string, auto-clears
var voiceErrorTimer = null;      // Timer for auto-clearing voiceError
var voiceAutoTimeout = null;     // 15s auto-timeout for field safety

// Schema error state (REACT_MODE)
var schemaError = null;           // Human-readable validation error, auto-clears
var schemaErrorTimer = null;      // Timer for auto-clearing schemaError

// Orchestration state
var lastOrchestration = null;  // Result of last voice extraction
var pendingDraftDecisions = []; // Drafts awaiting decision at day end
var currentDraftDecisionIndex = 0;
var editingDraftOrdre = null;   // Ordre being edited

// Schema decision state (end of day)
var pendingSchemaDecisions = [];
var currentSchemaDecisionIndex = 0;
var editingSchemaId = null;

// Extended flow state
var pendingRuhQuestion = null;        // { entryIndex } - waiting for RUH decision
var pendingImmediateConfirm = null;   // { type, entryIndex } - waiting for vaktlogg confirm
var pendingNoteDecisions = [];        // Entries with type "notat" awaiting decision
var currentNoteDecisionIndex = 0;
var pendingFriksjonDecisions = [];    // Friksjonsmålinger awaiting end-of-day confirm
var currentFriksjonDecisionIndex = 0;

// Håndrens state (React mode)
var readyToLock = false;  // true when all items resolved, user must explicitly lock

// ============================================================
// UX STATE - persisted UI position for refresh resilience
// ============================================================
var STORAGE_KEY_UX_STATE = "yournal_ux_state";

var uxState = {
  activeOverlay: null,
  // "schema_edit" | "draft_edit" | "time_entry" | "main_time_entry" | "external_instruction" | null

  schemaId: null,
  draftOrdre: null
};

function saveUxState() {
  try {
    localStorage.setItem(STORAGE_KEY_UX_STATE, JSON.stringify(uxState));
    emitStateChange("uxState");
  } catch (e) {
    console.error("Failed to save uxState:", e);
  }
}

function loadUxState() {
  try {
    var saved = localStorage.getItem(STORAGE_KEY_UX_STATE);
    if (saved) {
      var parsed = JSON.parse(saved);
      uxState.activeOverlay = parsed.activeOverlay || null;
      uxState.schemaId = parsed.schemaId || null;
      uxState.draftOrdre = parsed.draftOrdre || null;
      // Rehydrate in-memory edit pointer: React renders SchemaEditOverlay
      // straight from persisted uxState after a refresh, but never calls
      // openSchemaEdit() again, so without this saveSchemaEdit() silently
      // no-ops (editingSchemaId stays null) and the schema is stuck in
      // "draft" forever with no visible error.
      if (uxState.activeOverlay === "schema_edit" && uxState.schemaId) {
        editingSchemaId = uxState.schemaId;
      }
    }
  } catch (e) {
    console.error("Failed to load uxState:", e);
    clearUxState();
  }
}

function clearUxState() {
  uxState.activeOverlay = null;
  uxState.schemaId = null;
  uxState.draftOrdre = null;
  try {
    localStorage.removeItem(STORAGE_KEY_UX_STATE);
  } catch (e) {
    console.error("Failed to clear uxState:", e);
  }
  emitStateChange("uxState");
}

// ============================================================
// PRE-DAY AND RUNNING SCHEMA DEFINITIONS
// ============================================================

var PRE_DAY_SCHEMAS = {
  kjoretoyssjekk: {
    id: "kjoretoyssjekk_v0",
    label: "Daglig kj\u00f8ret\u00f8ysjekk",
    triggers: ["kj\u00f8ret\u00f8ysjekk", "bilsjekk", "sjekk av bil", "kj\u00f8ret\u00f8y"],
    fields: {
      kjoretoy: { label: "Kj\u00f8ret\u00f8y", type: "string", required: true },
      dato: { label: "Dato", type: "date", required: true },
      lys_ok: { label: "Lys OK", type: "boolean", required: false },
      bremser_ok: { label: "Bremser OK", type: "boolean", required: false },
      dekk_ok: { label: "Dekk OK", type: "boolean", required: false },
      kommentar: { label: "Kommentar", type: "string", required: false }
    }
  },
  sja_preday: {
    id: "sja_preday_v0",
    label: "SJA (f\u00f8r arbeid)",
    triggers: ["sja", "sikker jobb"],
    fields: {
      oppgave: { label: "Oppgave", type: "string", required: true },
      sted: { label: "Sted", type: "string", required: false },
      risiko: { label: "Risiko", type: "string", required: false },
      konsekvens: { label: "Konsekvens", type: "string", required: true },  // Never auto-fill
      tiltak: { label: "Tiltak", type: "string", required: true },  // Never auto-fill
      arbeidsvarsling: { label: "Arbeidsvarsling", type: "enum", required: false, options: ["ingen", "enkel", "manuell", "full"] },
      godkjent: { label: "Godkjent", type: "boolean", required: true }
    }
  }
};

var RUNNING_SCHEMAS = {
  skademelding: {
    id: "skademelding_v0",
    label: "Skademelding",
    triggers: ["skademelding", "skade p\u00e5", "skadet"],
    fields: {
      tidspunkt: { label: "Tidspunkt", type: "time", required: true },
      sted: { label: "Sted", type: "string", required: false },
      beskrivelse: { label: "Beskrivelse", type: "string", required: true },
      involverte: { label: "Involverte", type: "string", required: false },
      vitner: { label: "Vitner", type: "string", required: false },
      tiltak_utfort: { label: "Tiltak utf\u00f8rt", type: "string", required: false }  // User fills
    }
  },
  uonsket_hendelse: {
    id: "uonsket_hendelse_v0",
    label: "U\u00f8nsket hendelse",
    triggers: ["u\u00f8nsket hendelse", "nestenulykke", "avvik", "nesten ulykke"],
    fields: {
      tidspunkt: { label: "Tidspunkt", type: "time", required: true },
      beskrivelse: { label: "Beskrivelse", type: "string", required: true },
      arsak: { label: "\u00c5rsak", type: "string", required: false },  // User fills
      forslag_tiltak: { label: "Forslag tiltak", type: "string", required: false }   // User fills
    }
  },
  ad_hoc: {
    id: "ad_hoc_v0",
    label: "Egendefinert skjema",
    triggers: [],  // Only manually selected
    fields: {
      tittel: { label: "Tittel", type: "string", required: true },
      innhold: { label: "Innhold", type: "string", required: false }
    }
  }
};

// ============================================================
// DRIFT SCHEMAS (events during work)
// ============================================================

var DRIFT_SCHEMAS = {
  hendelse: {
    id: "hendelse_v0",
    label: "Hendelse",
    triggers: ["hendelse", "skjedde", "oppsto"],
    fields: {
      tidspunkt: { label: "Tidspunkt", type: "time", required: true },
      beskrivelse: { label: "Beskrivelse", type: "string", required: true },
      sted: { label: "Sted", type: "string", required: false }
    }
  },
  vaktlogg: {
    id: "vaktlogg_v0",
    label: "Vaktlogg",
    triggers: ["vaktlogg", "loggf\u00f8r", "logg dette"],
    requiresImmediateConfirm: true,
    fields: {
      tidspunkt: { label: "Tidspunkt", type: "time", required: true },
      innhold: { label: "Innhold", type: "string", required: true }
    }
  },
  friksjonsmaling: {
    id: "friksjonsmaling_v0",
    label: "Friksjonsm\u00e5ling",
    triggers: ["friksjon", "friksjonsm\u00e5ling", "m\u00e5lte friksjon"],
    confirmedAtEndOfDay: true,
    fields: {
      tidspunkt: { label: "Tidspunkt", type: "time", required: true },
      sted: { label: "Sted", type: "string", required: true },
      verdi: { label: "Verdi", type: "number", required: true },
      kommentar: { label: "Kommentar", type: "string", required: false }
    }
  },
  ruh: {
    id: "ruh_v0",
    label: "RUH (Rapport Uønsket Hendelse)",
    triggers: [],  // Only via explicit conversion from hendelse
    fields: {
      tidspunkt: { label: "Tidspunkt", type: "time", required: true },
      beskrivelse: { label: "Beskrivelse", type: "string", required: true },
      sted: { label: "Sted", type: "string", required: false },
      arsak: { label: "Årsak", type: "string", required: true },  // NEVER_AUTO_FILL
      tiltak: { label: "Tiltak", type: "string", required: true }   // NEVER_AUTO_FILL
    }
  },
  // PAUSE: Informational only
  // - Does NOT trigger schema decision
  // - Does NOT appear in end-of-day
  // - Does NOT require confirmation
  // - Slutt-tid = neste ikke-pause entry (no auto-calculation to hours)
  pause: {
    id: "pause_v0",
    label: "Pause",
    triggers: ["pause", "lunsj", "matpause", "lunsjpause", "tilbake fra pause"],
    informationalOnly: true,  // Marker: ingen beslutningsflyt
    fields: {
      tidspunkt: { label: "Tidspunkt", type: "time", required: false }  // Auto-set to now
    }
  }
};

// ============================================================
// CONVERSION SCHEMAS (note -> schema at end of day)
// ============================================================

var CONVERSION_SCHEMAS = {
  loggbok_kjoretoy: {
    id: "loggbok_kjoretoy_v0",
    label: "Loggbok kj\u00f8ret\u00f8y",
    fields: {
      dato: { label: "Dato", type: "date", required: true },
      kjoretoy: { label: "Kj\u00f8ret\u00f8y", type: "string", required: true },
      innhold: { label: "Innhold", type: "string", required: true }
    }
  },
  forbedringsforslag: {
    id: "forbedringsforslag_v0",
    label: "Forbedringsforslag",
    fields: {
      tittel: { label: "Tittel", type: "string", required: true },
      beskrivelse: { label: "Beskrivelse", type: "string", required: true },
      begrunnelse: { label: "Begrunnelse", type: "string", required: false }
    }
  },
  kvalitetsavvik: {
    id: "kvalitetsavvik_v0",
    label: "Kvalitetsavvik",
    fields: {
      beskrivelse: { label: "Beskrivelse", type: "string", required: true },
      arsak: { label: "\u00c5rsak", type: "string", required: true },  // NEVER_AUTO_FILL
      tiltak: { label: "Tiltak", type: "string", required: true }   // NEVER_AUTO_FILL
    }
  },
  huskelapp: {
    id: "huskelapp_v0",
    label: "Huskelapp (intern)",
    fields: {
      innhold: { label: "Innhold", type: "string", required: true }
    }
  }
};

// ============================================================
// MOTOR BRIDGE (for React UI integration)
// ============================================================

// Returns immutable snapshot of motor state
// UI should ONLY read state through this function
function getSnapshot() {
  return {
    appState: appState,
    dayLog: dayLog ? JSON.parse(JSON.stringify(dayLog)) : null,
    uxState: JSON.parse(JSON.stringify(uxState)),
    storageError: storageError ? JSON.parse(JSON.stringify(storageError)) : null,
    isStaleDay: isStaleDay(),
    isListening: isListening,
    voiceState: voiceState,
    voiceError: voiceError,
    schemaError: schemaError,
    voiceSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    editingIndex: editingIndex,
    outboxStatus: getOutboxStatus(),
    exportEnabled: !!ADMIN_CONFIG.exportEndpoint,
    readyToLock: readyToLock,
    unresolvedCount: getUnresolvedCount(),
    exportStatus: getExportStatus(),
    config: NORMALIZED_CONFIG
  };
}

// Emits state change event for specific key
// UI listens to these events to know when to re-render
function emitStateChange(key) {
  window.dispatchEvent(
    new CustomEvent("motor-state-change", { detail: { key: key } })
  );
}

// Emit all state changes (convenience for operations that affect multiple)
function emitAllStateChanges() {
  emitStateChange("appState");
  emitStateChange("dayLog");
  emitStateChange("uxState");
  emitStateChange("storageError");
  emitStateChange("isStaleDay");
}

// Expose motor interface on window for React UI bridge
// IMPORTANT: UI must NEVER write directly to these - only call functions
window.Motor = {
  // State access (read-only snapshots)
  getSnapshot: getSnapshot,

  // Day lifecycle
  startDay: startDay,
  endDay: endDay,
  lockDay: lockDay,
  startNewDay: startNewDay,

  // Voice/Entry
  submitEntry: submitEntry,
  confirmStartTime: confirmStartTime,

  // Schema operations
  openSchemaEdit: openSchemaEdit,
  closeSchemaEdit: closeSchemaEdit,
  saveSchemaEdit: saveSchemaEdit,

  // Draft operations
  openDraftEdit: openDraftEdit,
  closeDraftEdit: closeDraftEdit,
  saveDraftEdit: saveDraftEdit,

  // Time entry
  openTimeEntryOverlay: openTimeEntryOverlay,
  openMainTimeEntryOverlay: openMainTimeEntryOverlay,
  hideTimeEntryOverlay: hideTimeEntryOverlay,
  confirmTimeEntry: confirmTimeEntry,
  confirmMainTimeEntry: confirmMainTimeEntry,
  discardMainTimeEntry: discardMainTimeEntry,

  // Decision flow (legacy — vanilla mode)
  draftDecision: draftDecision,
  schemaDecision: schemaDecision,
  friksjonDecision: friksjonDecision,
  noteDecision: noteDecision,

  // Structured entry (verify at moment of input)
  parseEntry: parseEntry,
  confirmStructuredEntry: confirmStructuredEntry,

  // Håndrens (React mode — flat verification)
  getUnresolvedItems: getUnresolvedItems,
  resolveItem: resolveItem,

  // Pre-day
  showPreDayOverlay: showPreDayOverlay,
  hidePreDayOverlay: hidePreDayOverlay,
  continueFromPreDay: continueFromPreDay,
  forceStartDay: forceStartDay,
  skipPreDaySchema: skipPreDaySchema,
  deferPreDaySchema: deferPreDaySchema,
  isSchemaRequired: isSchemaRequired,

  // External systems (DELEGATED - Punchout only opens, never writes)
  // FORBIDDEN: Auto-resume dialog after window.open
  // FORBIDDEN: Focus listeners, visibility API, polling
  openExternalSystem: openExternalSystem,
  confirmExternalTask: confirmExternalTask,
  closeExternalInstructionOverlay: closeExternalInstructionOverlay,

  // Stale day handling (React needs these)
  continueStaleDay: continueStaleDay,
  endStaleDay: endStaleDay,
  discardStaleDay: discardStaleDay,

  // Storage error handling (React needs these)
  resetCurrentDayOnly: resetCurrentDayOnly,
  tryIgnoreError: tryIgnoreError,

  // Entry editing (React mode)
  openEdit: openEdit,
  saveEdit: saveEdit,
  cancelEdit: cancelEdit,

  // Voice
  toggleVoice: toggleVoice,

  // Export
  syncExports: syncExports,

  // Report
  buildHumanReadableReport: buildHumanReadableReport
};

// --- Init ---
function init() {
  loadFromStorage();
  loadUxState();

  // In React mode, only initialize state - React handles all UI
  if (REACT_MODE) {
    setupVoice(); // Initialize speech recognition for React voice button
    // Emit initial state for React
    emitStateChange('appState');
    emitStateChange('dayLog');
    emitStateChange('uxState');
    initExportSync();
    return;
  }

  // Legacy vanilla JS mode below
  setupVoice();

  // Check for storage errors first
  if (storageError) {
    showStorageErrorOverlay();
    return;
  }

  // Check for stale day (day from previous date)
  if (dayLog && isStaleDay()) {
    showStaleDayBanner();
  }

  if (!REACT_MODE) {
    render();
  }

  // Restore overlay state if needed (e.g., after refresh during ending phase)
  restoreOverlayState();

  initExportSync();
}

// --- Stale Day Detection ---
function isStaleDay() {
  if (!dayLog || !dayLog.date) return false;
  var today = new Date().toISOString().split("T")[0];
  return dayLog.date !== today;
}

function showStaleDayBanner() {
  if (REACT_MODE) return;
  var banner = document.getElementById("staleDayBanner");
  var dateEl = document.getElementById("staleDayDate");
  if (banner && dateEl && dayLog) {
    dateEl.textContent = formatDate(dayLog.date);
    banner.classList.remove("hidden");
  }
}

function hideStaleDayBanner() {
  if (REACT_MODE) return;
  var banner = document.getElementById("staleDayBanner");
  if (banner) banner.classList.add("hidden");
}

function continueStaleDay() {
  // User wants to continue with the old day
  hideStaleDayBanner();
}

function endStaleDay() {
  // User wants to end the old day now
  hideStaleDayBanner();
  if (appState === "ACTIVE") {
    endDay();
  }
}

function discardStaleDay() {
  // User wants to discard the old day
  if (REACT_MODE) {
    // React UI handles confirmation dialog.
    // Archive before wiping — "discard" should not mean permanent data
    // loss for a day that may contain confirmed SJA/RUH entries.
    pushToHistory(JSON.parse(JSON.stringify(dayLog)));
    dayLog = null;
    appState = "NOT_STARTED";
    clearUxState();
    saveCurrentDay();
    emitAllStateChanges();
    return;
  }
  if (!REACT_MODE) {
    if (confirm("Er du sikker på at du vil forkaste dagen fra " + formatDate(dayLog.date) + "? All data vil gå tapt.")) {
      hideStaleDayBanner();
      pushToHistory(JSON.parse(JSON.stringify(dayLog)));
      dayLog = null;
      appState = "NOT_STARTED";
      clearUxState();
      saveCurrentDay();
      render();
    }
  }
}

// --- Overlay State Restoration ---
function restoreOverlayState() {
  if (!dayLog) return;

  // PRIORITY 1: Restore from persisted uxState
  if (uxState.activeOverlay) {
    restoreFromUxState();
    return;
  }

  // PRIORITY 2 (vanilla only): Check for unconfirmed hendelser (should show RUH question)
  // In React mode, inline blocking is removed — decisions are deferred to end-of-day.
  if (!REACT_MODE) {
    var unconfirmedHendelse = findUnconfirmedHendelse();
    if (unconfirmedHendelse !== null) {
      pendingRuhQuestion = { entryIndex: unconfirmedHendelse };
      showRuhQuestionOverlay();
      return;
    }

    // PRIORITY 3 (vanilla only): Check for unconfirmed vaktlogg
    var unconfirmedVaktlogg = findUnconfirmedVaktlogg();
    if (unconfirmedVaktlogg !== null) {
      pendingImmediateConfirm = { type: "vaktlogg", entryIndex: unconfirmedVaktlogg };
      showVaktloggConfirmOverlay();
      return;
    }
  }

  // PRIORITY 4: If in pre-day phase, show pre-day overlay
  if (dayLog.phase === "pre" && appState === "ACTIVE") {
    showPreDayOverlay();
    return;
  }

  // PRIORITY 5: If in ending phase, restart decision flow (vanilla only)
  // In React mode, Håndrens reads getUnresolvedItems() — no tunnel
  if (dayLog.phase === "ending") {
    if (REACT_MODE) {
      readyToLock = (getUnresolvedCount() === 0);
    } else {
      startAllDecisions();
    }
    return;
  }
}

function restoreFromUxState() {
  // Route directly to the correct overlay based on persisted uxState
  switch (uxState.activeOverlay) {
    case "schema_edit":
      if (uxState.schemaId) {
        openSchemaEdit(uxState.schemaId);
      } else {
        clearUxState();
      }
      break;

    case "draft_edit":
      if (uxState.draftOrdre) {
        openDraftEdit(uxState.draftOrdre);
      } else {
        clearUxState();
      }
      break;

    case "time_entry":
      if (uxState.draftOrdre) {
        if (!REACT_MODE) {
          rebuildDecisionArrays();
        }
        openTimeEntryOverlay(uxState.draftOrdre);
      } else {
        clearUxState();
      }
      break;

    case "main_time_entry":
      openMainTimeEntryOverlay();
      break;

    // Legacy tunnel overlays (vanilla mode only)
    case "draft_decision":
      if (!REACT_MODE) {
        rebuildDecisionArrays();
        currentDraftDecisionIndex = uxState.decisionIndex || 0;
        showDraftDecisionOverlay();
      } else {
        clearUxState();
      }
      break;

    case "schema_decision":
      if (!REACT_MODE) {
        rebuildDecisionArrays();
        currentSchemaDecisionIndex = uxState.decisionIndex || 0;
        showSchemaDecisionOverlay();
      } else {
        clearUxState();
      }
      break;

    case "friksjon_decision":
      if (!REACT_MODE) {
        rebuildDecisionArrays();
        currentFriksjonDecisionIndex = uxState.decisionIndex || 0;
        showFriksjonDecisionOverlay();
      } else {
        clearUxState();
      }
      break;

    case "note_decision":
      if (!REACT_MODE) {
        rebuildDecisionArrays();
        currentNoteDecisionIndex = uxState.decisionIndex || 0;
        showNoteDecisionOverlay();
      } else {
        clearUxState();
      }
      break;

    case "external_instruction":
      // External instruction overlay - just re-render, user will see it
      // No action needed - the overlay state is already in uxState
      break;

    default:
      clearUxState();
      break;
  }
}

function rebuildDecisionArrays() {
  // Rebuild decision arrays from current dayLog state
  pendingDraftDecisions = getActiveDrafts();
  pendingSchemaDecisions = getSchemasPendingDecision();
  pendingFriksjonDecisions = getFriksjonsPendingDecision();
  pendingNoteDecisions = getNotesPendingDecision();
}

function findUnconfirmedHendelse() {
  if (!dayLog || !dayLog.entries) return null;
  for (var i = 0; i < dayLog.entries.length; i++) {
    var entry = dayLog.entries[i];
    // Hendelse without RUH decision = needs confirmation
    if (entry.type === "hendelse" && !entry.ruhDecision) {
      return i;
    }
  }
  return null;
}

function findUnconfirmedVaktlogg() {
  if (!dayLog || !dayLog.entries) return null;
  for (var i = 0; i < dayLog.entries.length; i++) {
    var entry = dayLog.entries[i];
    // Vaktlogg without confirmation or discard = needs confirmation
    if (entry.type === "vaktlogg" && !entry.vaktloggConfirmed && !entry.vaktloggDiscarded) {
      return i;
    }
  }
  return null;
}

// --- Storage (one active day, immutable history) ---
var storageError = null;  // Holds error info if storage is corrupt

function saveCurrentDay() {
  try {
    if (dayLog) {
      localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify({
        appState: appState,
        dayLog: dayLog
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT);
    }
    emitStateChange("appState");
    emitStateChange("dayLog");
  } catch (e) {
    console.error("Failed to save current day:", e);
    storageError = { type: "save", message: "Kunne ikke lagre dagens data", raw: String(e) };
    emitStateChange("storageError");
  }
}

function loadFromStorage() {
  var saved = localStorage.getItem(STORAGE_KEY_CURRENT);
  if (saved) {
    try {
      var parsed = JSON.parse(saved);
      appState = parsed.appState;
      dayLog = parsed.dayLog;
      // Migration: add phase and schemas if missing
      if (dayLog && !dayLog.phase) {
        dayLog.phase = "active";
      }
      if (dayLog && !dayLog.schemas) {
        dayLog.schemas = [];
      }
      // Migration: add version if missing
      if (dayLog && !dayLog.version) {
        dayLog.version = 1;
      }
      // Migration: startTimeSource for existing data
      if (dayLog && dayLog.startTime && !dayLog.startTimeSource) {
        dayLog.startTimeSource = "auto";
      }
      // Migration: FINISHED → LOCKED (FINISHED state eliminated)
      if (appState === "FINISHED") {
        appState = "LOCKED";
        dayLog.status = "LOCKED";
        pushToHistory(JSON.parse(JSON.stringify(dayLog)));
        saveCurrentDay();
      }
    } catch (e) {
      console.error("Failed to parse current day:", e);
      storageError = {
        type: "current",
        message: "Kunne ikke lese aktiv dag: " + e.message,
        raw: saved.substring(0, 100) + "..."
      };
      appState = "NOT_STARTED";
      dayLog = null;
    }
  } else {
    appState = "NOT_STARTED";
    dayLog = null;
  }
}

function getHistory() {
  var raw = localStorage.getItem(STORAGE_KEY_HISTORY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse history:", e);
    // History is corrupt but we don't block the app
    // Just return empty and let user know
    return [];
  }
}

function pushToHistory(log) {
  try {
    var history = getHistory();
    history.unshift(log);
    // Limit history to 90 days to prevent localStorage overflow
    if (history.length > 90) {
      history = history.slice(0, 90);
    }
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save history:", e);
    // Don't crash - history save failure is not critical
  }
}

// --- Storage Error Handling ---
function showStorageErrorOverlay() {
  if (REACT_MODE) return;
  var overlay = document.getElementById("storageErrorOverlay");
  var detail = document.getElementById("storageErrorDetail");
  if (overlay && storageError) {
    detail.textContent = storageError.message;
    overlay.classList.remove("hidden");
  }
}

function resetCurrentDayOnly() {
  // Only reset current day, preserve history
  localStorage.removeItem(STORAGE_KEY_CURRENT);
  storageError = null;
  appState = "NOT_STARTED";
  dayLog = null;
  if (!REACT_MODE) {
    document.getElementById("storageErrorOverlay").classList.add("hidden");
  }
  emitAllStateChanges();
  render();
}

function tryIgnoreError() {
  // User wants to continue anyway
  storageError = null;
  if (!REACT_MODE) {
    document.getElementById("storageErrorOverlay").classList.add("hidden");
  }
  emitStateChange("storageError");
  render();
}

// --- Voice (Web Speech API, continuous mode, one-result-per-click) ---
var voiceContext = "active";  // "start" or "active" - determines where voice goes

function setupVoice() {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "nb-NO";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = true;

  // --- Deterministic listening state: TRUE only in onstart ---
  recognition.onstart = function () {
    // Guard: if session was already stopped (double-tap race), ignore stale onstart
    if (!voiceSessionActive) return;

    isListening = true;
    voiceState = "listening";
    emitStateChange("isListening");
    emitStateChange("voiceState");
    // Latency marker (dev only)
    if (typeof performance !== "undefined") {
      recognition._voiceT0 = performance.now();
    }
  };

  recognition.onresult = function (event) {
    // Single commit guard
    if (voiceResultHandled) return;

    // isFinal enforcement — only process final results
    var finalTranscript = null;
    for (var i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript = event.results[i][0].transcript;
        break;
      }
    }
    if (!finalTranscript) return;

    // Clear auto-timeout — result received
    if (voiceAutoTimeout) { clearTimeout(voiceAutoTimeout); voiceAutoTimeout = null; }

    voiceResultHandled = true;
    voiceState = "processing";
    emitStateChange("voiceState");

    // Latency: start → result
    if (typeof performance !== "undefined" && recognition._voiceT0) {
      console.log("VOICE LATENCY (start\u2192result):", Math.round(performance.now() - recognition._voiceT0) + "ms");
    }

    var transcript = finalTranscript;

    if (REACT_MODE) {
      // Emit transcript for React UI to display
      window.dispatchEvent(new CustomEvent("voice-transcript", { detail: transcript }));

      var tCommit = typeof performance !== "undefined" ? performance.now() : 0;

      if (appState === "NOT_STARTED") {
        startDay(transcript);
      } else {
        var guessed = guessEntryType(transcript);
        submitEntry(transcript, guessed);
      }

      // Latency: result → commit
      if (tCommit) {
        console.log("VOICE LATENCY (result\u2192commit):", Math.round(performance.now() - tCommit) + "ms");
      }

      // Stop recognition (continuous mode doesn't auto-stop)
      // Then clean up state — onend will release session lock
      isListening = false;
      voiceState = "idle";
      emitStateChange("isListening");
      emitStateChange("voiceState");
      try { recognition.stop(); } catch (_) {}
      return;
    }

    // Vanilla mode (unchanged)
    if (voiceContext === "start") {
      document.getElementById("startDayText").value = transcript;
      setStartVoiceStatus("Tekst mottatt");
      stopStartListening();
      var detected = detectPreDaySchemas(transcript);
      if (detected.length > 0) {
        handlePreDaySchemasFromVoice(detected, transcript);
      }
    } else {
      document.getElementById("entryText").value = transcript;
      var guessed = guessEntryType(transcript);
      document.getElementById("entryType").value = guessed;
      setVoiceStatus("Tekst mottatt");
      stopListening();
    }
  };

  recognition.onerror = function (event) {
    // Clear auto-timeout — error received
    if (voiceAutoTimeout) { clearTimeout(voiceAutoTimeout); voiceAutoTimeout = null; }

    var msg = "Feil: ";
    if (event.error === "no-speech") {
      msg = "Ingen tale fanget opp";
    } else if (event.error === "not-allowed") {
      msg = "Mikrofontilgang avsl\u00e5tt";
    } else if (event.error === "network") {
      msg = "Nettverksfeil \u2013 trenger nett for tale";
    } else if (event.error === "aborted") {
      msg = null; // User-initiated stop, not a real error
    } else {
      msg += event.error;
    }

    if (REACT_MODE) {
      voiceResultHandled = true; // Prevent silent-failure handler in onend
      isListening = false;
      if (msg) {
        voiceState = "error";
        voiceError = msg;
        if (voiceErrorTimer) clearTimeout(voiceErrorTimer);
        voiceErrorTimer = setTimeout(function () {
          voiceState = "idle";
          voiceError = null;
          emitStateChange("voiceState");
        }, 3000);
      } else {
        voiceState = "idle";
      }
      emitStateChange("isListening");
      emitStateChange("voiceState");
      return;
    }

    // Vanilla mode (unchanged)
    if (voiceContext === "start") {
      setStartVoiceStatus(msg || "");
      stopStartListening();
    } else {
      setVoiceStatus(msg || "");
      stopListening();
    }
  };

  recognition.onend = function () {
    // Clear auto-timeout — session ended
    if (voiceAutoTimeout) { clearTimeout(voiceAutoTimeout); voiceAutoTimeout = null; }

    // Always release session lock
    voiceSessionActive = false;

    if (REACT_MODE) {
      // Only show "Hørte ingenting" if we were genuinely listening for a while
      // and got no result and no error. With continuous=true, a normal user-stop
      // goes through onerror("aborted") first, setting voiceResultHandled=true.
      if (!voiceResultHandled && isListening && recognition._voiceT0 &&
          (typeof performance !== "undefined") &&
          (performance.now() - recognition._voiceT0 > 1500)) {
        voiceState = "error";
        voiceError = "H\u00f8rte ingenting \u2013 pr\u00f8v igjen";
        if (voiceErrorTimer) clearTimeout(voiceErrorTimer);
        voiceErrorTimer = setTimeout(function () {
          voiceState = "idle";
          voiceError = null;
          emitStateChange("voiceState");
        }, 3000);
      }
      if (isListening) {
        isListening = false;
        emitStateChange("isListening");
      }
      // Only reset to idle from "listening" — don't overwrite processing/error
      if (voiceState === "listening") {
        voiceState = "idle";
      }
      emitStateChange("voiceState");
      return;
    }

    // Vanilla mode (unchanged)
    if (isListening) {
      if (voiceContext === "start") {
        stopStartListening();
      } else {
        stopListening();
      }
    }
  };
}

function toggleVoiceReact() {
  if (!recognition) {
    setupVoice();
  }
  if (!recognition) {
    return; // Browser doesn't support speech
  }

  // If already listening or session active, stop — onend handles cleanup
  if (isListening || voiceSessionActive) {
    recognition.stop();
    return;
  }

  // Clear previous error
  if (voiceErrorTimer) {
    clearTimeout(voiceErrorTimer);
    voiceErrorTimer = null;
  }
  voiceError = null;

  // Reset per-session guards
  voiceResultHandled = false;
  voiceSessionActive = true;

  try {
    recognition.start();
    // NOTE: isListening is set in onstart, NOT here
    // Auto-timeout: stop mic after 15s if no result (field safety)
    voiceAutoTimeout = setTimeout(function () {
      if (voiceSessionActive && !voiceResultHandled) {
        try { recognition.stop(); } catch (_) {}
      }
    }, 15000);
  } catch (e) {
    voiceSessionActive = false;
    voiceState = "error";
    voiceError = "Kunne ikke starte tale";
    emitStateChange("voiceState");
    voiceErrorTimer = setTimeout(function () {
      voiceState = "idle";
      voiceError = null;
      emitStateChange("voiceState");
    }, 3000);
  }
}

function toggleVoice() {
  if (REACT_MODE) {
    toggleVoiceReact();
    return;
  }
  if (!recognition) {
    setVoiceStatus("Nettleseren st\u00f8tter ikke tale");
    return;
  }
  if (isListening) {
    recognition.stop();
    stopListening();
  } else {
    startListening();
  }
}

function startListening() {
  voiceContext = "active";  // Ensure context is set for active phase
  isListening = true;
  var btn = document.getElementById("btnVoice");
  btn.classList.add("listening");
  document.getElementById("voiceLabel").textContent = "Lytter...";
  setVoiceStatus("Snakk n\u00e5");
  try {
    recognition.start();
  } catch (e) {
    stopListening();
    setVoiceStatus("Kunne ikke starte tale");
  }
}

function stopListening() {
  isListening = false;
  var btn = document.getElementById("btnVoice");
  btn.classList.remove("listening");
  document.getElementById("voiceLabel").textContent = "Trykk for \u00e5 snakke";
}

function setVoiceStatus(msg) {
  document.getElementById("voiceStatus").textContent = msg;
}

// --- Start phase voice functions ---
function toggleStartVoice() {
  if (!recognition) {
    setStartVoiceStatus("Nettleseren støtter ikke tale");
    return;
  }
  if (isListening) {
    recognition.stop();
    stopStartListening();
  } else {
    startStartListening();
  }
}

function startStartListening() {
  voiceContext = "start";
  isListening = true;
  var btn = document.getElementById("btnStartVoice");
  if (btn) btn.classList.add("listening");
  var label = document.getElementById("startVoiceLabel");
  if (label) label.textContent = "Lytter...";
  setStartVoiceStatus("Snakk nå");
  try {
    recognition.start();
  } catch (e) {
    stopStartListening();
    setStartVoiceStatus("Kunne ikke starte tale");
  }
}

function stopStartListening() {
  isListening = false;
  var btn = document.getElementById("btnStartVoice");
  if (btn) btn.classList.remove("listening");
  var label = document.getElementById("startVoiceLabel");
  if (label) label.textContent = "Snakk inn";
}

function setStartVoiceStatus(msg) {
  var el = document.getElementById("startVoiceStatus");
  if (el) el.textContent = msg;
}

// Handle pre-day schema triggers from voice in start phase
function handlePreDaySchemasFromVoice(detectedSchemas, transcript) {
  // Show a message that schemas were detected
  var schemaNames = detectedSchemas.map(function (key) {
    var schema = PRE_DAY_SCHEMAS[key];
    return schema ? schema.label : key;
  }).join(", ");

  setStartVoiceStatus("Oppdaget: " + schemaNames + " – klikk Start dagen");
}

// --- Type guessing (keyword-based, Norwegian) ---
function guessEntryType(text) {
  var lower = text.toLowerCase();
  var pauseWords = ["pause", "lunsj", "spise", "spiser", "hviler", "tar pause", "ferdig med lunsj", "ferdig med pause"];
  var driveWords = ["kj\u00f8r", "kj\u00f8rer", "kj\u00f8rte", "kj\u00f8rt", "drar til", "ferdig p\u00e5", "p\u00e5 vei til", "ankommet", "ankom", "reiser til"];

  // New drift types
  var hendelseWords = ["hendelse", "skjedde", "oppsto", "hendt", "oppst\u00e5tt"];
  var vaktloggWords = ["vaktlogg", "loggf\u00f8r", "logg dette", "loggf\u00f8rer"];
  var friksjonWords = ["friksjon", "friksjonsm\u00e5ling", "m\u00e5lte friksjon", "friksjonsverdier"];

  for (var i = 0; i < hendelseWords.length; i++) {
    if (lower.indexOf(hendelseWords[i]) !== -1) return "hendelse";
  }
  for (var i = 0; i < vaktloggWords.length; i++) {
    if (lower.indexOf(vaktloggWords[i]) !== -1) return "vaktlogg";
  }
  for (var i = 0; i < friksjonWords.length; i++) {
    if (lower.indexOf(friksjonWords[i]) !== -1) return "friksjon";
  }
  for (var i = 0; i < pauseWords.length; i++) {
    if (lower.indexOf(pauseWords[i]) !== -1) return "pause";
  }
  for (var i = 0; i < driveWords.length; i++) {
    if (lower.indexOf(driveWords[i]) !== -1) return "kjoring";
  }
  return "notat";
}

// ============================================================
// PRE-DAY SCHEMA DETECTION
// ============================================================

// Extract ordre number from text (e.g. "204481-0014" or "204481")
function extractOrdreFromText(text) {
  // Look for ordre patterns:
  // "oppdrag 204481-0014", "ordre 204481-0014", "ordrenummer 204481"
  var ordrePatterns = [
    /(?:oppdrag|ordre|ordrenummer)\s+(\d{4,}-?\d*)/i,
    /(\d{6}-\d{4})/  // Standard ordre format like 204481-0014
  ];

  for (var i = 0; i < ordrePatterns.length; i++) {
    var match = text.match(ordrePatterns[i]);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Extract kjøretøy ID from text (e.g. "51401832")
function extractKjoretoyFromText(text) {
  // Look for kjøretøy patterns:
  // "kjøretøy 51401832", "kjøretøysjekk 51401832", "bil 51401832"
  var kjoretoyPatterns = [
    /(?:kj\u00f8ret\u00f8y|kjoretoy|bil|kj\u00f8ret\u00f8ysjekk|kjoretoysjekk)\s+(\d{6,})/i,
    /(?:sjekkliste\s+(?:for\s+)?(?:kj\u00f8ret\u00f8y|kjoretoy|bil))\s+(\d{6,})/i
  ];

  for (var i = 0; i < kjoretoyPatterns.length; i++) {
    var match = text.match(kjoretoyPatterns[i]);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Extract context from input text for schema pre-fill
function extractSchemaContext(text) {
  return {
    ordre: extractOrdreFromText(text),
    kjoretoy: extractKjoretoyFromText(text)
  };
}

function detectPreDaySchemas(text) {
  var lower = text.toLowerCase();
  var detected = [];

  var keys = Object.keys(PRE_DAY_SCHEMAS);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var schema = PRE_DAY_SCHEMAS[key];
    for (var j = 0; j < schema.triggers.length; j++) {
      if (lower.indexOf(schema.triggers[j]) !== -1) {
        detected.push(key);
        break;
      }
    }
  }

  return detected;
}

function createSchemaInstance(schemaKey, origin, context) {
  var schemaDef = origin === "pre_day" ? PRE_DAY_SCHEMAS[schemaKey] : RUNNING_SCHEMAS[schemaKey];
  if (!schemaDef) return null;

  var now = new Date();
  var fields = {};
  var fieldKeys = Object.keys(schemaDef.fields);
  for (var i = 0; i < fieldKeys.length; i++) {
    var fk = fieldKeys[i];
    // Check if this is a never-auto-fill field
    if (NEVER_AUTO_FILL.indexOf(fk) !== -1) {
      fields[fk] = null;
    } else if (fk === "dato") {
      fields[fk] = dayLog ? dayLog.date : now.toISOString().split("T")[0];
    } else if (fk === "tidspunkt") {
      fields[fk] = formatTime(now);
    } else {
      fields[fk] = null;
    }
  }

  // Apply context-based pre-fill for neutral identification fields
  // These are always editable by the user before confirmation
  if (context) {
    // SJA: pre-fill oppgave with ordre reference
    if (schemaKey === "sja_preday" && context.ordre && fields.hasOwnProperty("oppgave")) {
      fields.oppgave = "Oppdrag " + context.ordre;
    }

    // Kjøretøysjekk: pre-fill kjøretøy ID
    if (schemaKey === "kjoretoyssjekk" && context.kjoretoy && fields.hasOwnProperty("kjoretoy")) {
      fields.kjoretoy = context.kjoretoy;
    }
  }

  // Apply config-driven defaults for optional SJA fields (always editable by user)
  if (schemaKey === "sja_preday" && NORMALIZED_CONFIG.sjaDefaults) {
    var sjaD = NORMALIZED_CONFIG.sjaDefaults;
    if (sjaD.sted && fields.hasOwnProperty("sted") && fields.sted === null) {
      fields.sted = sjaD.sted;
    }
    if (sjaD.arbeidsvarsling && fields.hasOwnProperty("arbeidsvarsling") && fields.arbeidsvarsling === null) {
      fields.arbeidsvarsling = sjaD.arbeidsvarsling;
    }
  }

  return {
    id: "schema_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    type: schemaKey,
    origin: origin,
    status: "draft",  // draft | confirmed | discarded | skipped
    createdAt: formatTime(now),
    confirmedAt: null,
    fields: fields,
    linkedEntries: []
  };
}

// ============================================================
// RUNNING SCHEMA DETECTION
// ============================================================

function detectRunningSchema(text) {
  var lower = text.toLowerCase();

  var keys = Object.keys(RUNNING_SCHEMAS);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var schema = RUNNING_SCHEMAS[key];
    for (var j = 0; j < schema.triggers.length; j++) {
      if (lower.indexOf(schema.triggers[j]) !== -1) {
        return key;
      }
    }
  }

  return null;
}

// --- Day actions ---
function startDay(inputText) {
  var now = new Date();
  var text = inputText || "";

  dayLog = {
    date: now.toISOString().split("T")[0],
    startTime: null,           // Set by user confirmation or auto-fallback, not app-open
    startTimeSource: "pending", // "pending" | "user" | "auto"
    endTime: null,
    entries: [],
    drafts: {},
    schemas: [],
    phase: "pre",     // "pre" | "active" | "ending" — always start in pre-day phase
    status: "ACTIVE",
    mainTimeHandled: false  // Flag: main timesheet has been handled at end of day
  };

  // Detect pre-day schemas from input text
  var preDayKeys = detectPreDaySchemas(text);

  // Extract context for schema pre-fill (ordre, kjøretøy, etc.)
  var schemaContext = extractSchemaContext(text);

  if (REACT_MODE) {
    // Always create ALL available pre-day schemas as interactive cards in Start screen
    var allPreDayKeys = ADMIN_CONFIG.availablePreDaySchemas || [];
    for (var i = 0; i < allPreDayKeys.length; i++) {
      var schema = createSchemaInstance(allPreDayKeys[i], "pre_day", schemaContext);
      if (schema) {
        dayLog.schemas.push(schema);
      }
    }
  } else if (preDayKeys.length > 0) {
    // Vanilla JS: only create schemas detected from voice/text input
    for (var i = 0; i < preDayKeys.length; i++) {
      var schema = createSchemaInstance(preDayKeys[i], "pre_day", schemaContext);
      if (schema) {
        dayLog.schemas.push(schema);
      }
    }
  }

  appState = "ACTIVE";
  saveCurrentDay();

  if (dayLog.phase === "pre") {
    showPreDayOverlay();
  }

  // DOM rendering (vanilla JS mode only)
  if (!REACT_MODE) {
    render();
  }
}

function startDayWithVoice() {
  var text = document.getElementById("startDayText") ? document.getElementById("startDayText").value : "";
  startDay(text);
}

/**
 * confirmStartTime — Explicit start time confirmation by user.
 * If no timeString provided, uses current time.
 */
function confirmStartTime(timeString) {
  if (!dayLog) return;
  // Don't overwrite if already user-confirmed
  if (dayLog.startTime && dayLog.startTimeSource === "user") return;

  if (timeString && /^\d{2}:\d{2}$/.test(timeString)) {
    dayLog.startTime = timeString;
  } else {
    dayLog.startTime = formatTime(new Date());
  }
  dayLog.startTimeSource = "user";
  saveCurrentDay();
}

function endDay() {
  if (appState !== "ACTIVE") return;

  // Guard: If already in ending phase, recalculate readyToLock and return
  if (dayLog.phase === "ending") {
    readyToLock = (getUnresolvedCount() === 0);
    return;
  }

  var now = new Date();
  dayLog.endTime = formatTime(now);
  dayLog.phase = "ending";
  dayLog.mainTimeHandled = false;

  // Create/get main draft and grovutfyll (without lønnskode pre-fill)
  var mainDraft = getOrCreateMainDraft();
  grovutfyllMainDraft(mainDraft);

  // Auto-keep all notes (canonical flow: notes are never forced through decision)
  if (dayLog.entries) {
    for (var i = 0; i < dayLog.entries.length; i++) {
      var entry = dayLog.entries[i];
      if (entry.type === "notat" && !entry.converted && !entry.keptAsNote) {
        entry.keptAsNote = true;
      }
    }
  }

  // Auto-confirm complete non-main drafts (worker verified by saying them)
  if (dayLog.drafts) {
    var draftKeys = Object.keys(dayLog.drafts);
    for (var i = 0; i < draftKeys.length; i++) {
      var d = dayLog.drafts[draftKeys[i]];
      if (d.ordre === ADMIN_CONFIG.hovedordre) continue;
      if (d.status === "draft" && d.arbeidsbeskrivelse.length > 0) {
        d.status = "confirmed";
        d.confirmedAt = new Date().toISOString();
      }
    }
  }

  // Check if everything is already resolved (e.g. no schemas, no drafts)
  readyToLock = (getUnresolvedCount() === 0);

  saveCurrentDay();

  // In vanilla mode, start old decision tunnel for backwards compat
  if (!REACT_MODE) {
    startAllDecisions();
  }
  // In React mode, UI reads getUnresolvedItems() and shows Håndrens
}

function startAllDecisions() {
  // Gather all items needing decision
  pendingDraftDecisions = getActiveDrafts();
  currentDraftDecisionIndex = 0;

  pendingSchemaDecisions = getSchemasPendingDecision();
  currentSchemaDecisionIndex = 0;

  // Gather friksjonsmålinger pending confirmation
  pendingFriksjonDecisions = getFriksjonsPendingDecision();
  currentFriksjonDecisionIndex = 0;

  // Gather notes for potential conversion
  pendingNoteDecisions = getNotesPendingDecision();
  currentNoteDecisionIndex = 0;

  showNextDecision();
}

function showNextDecision() {
  // Canonical order: schemas → friksjon → main time → drafts
  // Notes are auto-kept in endDay(), no note decision loop.
  if (currentSchemaDecisionIndex < pendingSchemaDecisions.length) {
    showSchemaDecisionOverlay();
  } else if (currentFriksjonDecisionIndex < pendingFriksjonDecisions.length) {
    showFriksjonDecisionOverlay();
  } else if (!dayLog.mainTimeHandled) {
    // Main time entry comes after schema/friksjon decisions
    var mainDraft = dayLog.drafts[ADMIN_CONFIG.hovedordre];
    if (mainDraft) {
      openMainTimeEntryOverlay();
    } else {
      dayLog.mainTimeHandled = true;
      saveCurrentDay();
      showNextDecision();
    }
  } else if (currentDraftDecisionIndex < pendingDraftDecisions.length) {
    showDraftDecisionOverlay();
  } else {
    proceedToFinished();
  }
}

function getFriksjonsPendingDecision() {
  if (!dayLog || !dayLog.schemas) return [];
  return dayLog.schemas.filter(function (s) {
    return s.type === "friksjonsmaling" && s.status === "draft";
  });
}

function getNotesPendingDecision() {
  if (!dayLog || !dayLog.entries) return [];
  var notes = [];
  for (var i = 0; i < dayLog.entries.length; i++) {
    var entry = dayLog.entries[i];
    // Include notat entries that haven't been converted yet
    if (entry.type === "notat" && !entry.converted && !entry.keptAsNote) {
      notes.push({ entryIndex: i, entry: entry });
    }
  }
  return notes;
}

function lockDay() {
  // Allow lock from ACTIVE+ending (React Håndrens) or FINISHED (legacy vanilla)
  if (appState === "ACTIVE" && dayLog && dayLog.phase === "ending") {
    // React Håndrens path: guard on unresolved items
    if (getUnresolvedCount() > 0) {
      console.warn("lockDay blocked: " + getUnresolvedCount() + " unresolved items");
      return;
    }
  } else if (appState !== "FINISHED") {
    return;
  }

  // Block if main time not handled
  if (!dayLog.mainTimeHandled) {
    if (!REACT_MODE) alert("Du m\u00e5 fullf\u00f8re hovedtimef\u00f8ring f\u00f8r du kan godkjenne dagen.");
    return;
  }

  dayLog.status = "LOCKED";
  appState = "LOCKED";
  readyToLock = false;
  clearUxState();
  pushToHistory(JSON.parse(JSON.stringify(dayLog)));

  // Export: enqueue immutable packet and trigger sync
  var exportPacket = buildExportPacket(dayLog);
  if (exportPacket) {
    // Store exportId in dayLog for per-day export status tracking
    dayLog.exportId = exportPacket.exportId;
    enqueueExport(exportPacket);
    syncExports();
  }

  saveCurrentDay();
  if (!REACT_MODE) {
    render();
  }
}

function startNewDay() {
  dayLog = null;
  appState = "NOT_STARTED";
  readyToLock = false;
  saveCurrentDay();
  if (!REACT_MODE) {
    render();
  }
}

// --- Entry actions ---
function submitEntry(entryText, entryType) {
  if (appState !== "ACTIVE") return;
  if (dayLog && dayLog.phase === "ending") return;

  // In React mode, inline blocking is removed — decisions are deferred to end-of-day.
  // In vanilla mode, keep blocking for backwards compatibility.
  if (!REACT_MODE) {
    if (pendingImmediateConfirm) {
      alert("Bekreft vaktloggen f\u00f8r du registrerer noe nytt.");
      return;
    }
    if (pendingRuhQuestion) {
      alert("Svar p\u00e5 RUH-sp\u00f8rsm\u00e5let f\u00f8r du registrerer noe nytt.");
      return;
    }
  }

  if (dayLog.phase === "pre" && !REACT_MODE) {
    // Vanilla JS: auto-advance to active when first entry submitted during pre-day
    // REACT_MODE: phase stays "pre" — user must explicitly press "Gå til drift"
    dayLog.phase = "active";
    saveCurrentDay();
  }

  // Auto-set start time if still pending (first entry = fallback)
  if (dayLog.startTime === null) {
    dayLog.startTime = formatTime(new Date());
    dayLog.startTimeSource = "auto";
  }

  // In React mode, use parameters. In vanilla mode, read from DOM
  var input = REACT_MODE ? null : document.getElementById("entryText");
  var type = REACT_MODE ? (entryType || "notat") : document.getElementById("entryType").value;
  var text = REACT_MODE ? (entryText || "").trim() : input.value.trim();
  if (!text) return;

  var entryIndex = dayLog.entries.length;
  dayLog.entries.push({
    time: formatTime(new Date()),
    type: type,
    text: text
  });

  if (REACT_MODE) {
    // Phase 1: Entry visible immediately — UI never waits on parsing
    saveCurrentDay();
    emitStateChange("dayLog");

    // Phase 2: Orchestration + schema triggers deferred to next tick
    var _idx = entryIndex;
    var _text = text;
    var _type = type;
    setTimeout(function () {
      processEntryOrchestration(_idx, _text, _type);
    }, 0);
    return;
  }

  // Vanilla mode: synchronous as before
  lastOrchestration = orchestrateEntry(text);
  if (lastOrchestration.ordre) {
    updateDraftFromOrchestration(lastOrchestration, entryIndex);
  }

  var runningSchemaKey = detectRunningSchema(text);
  if (runningSchemaKey) {
    var newSchema = createSchemaInstance(runningSchemaKey, "running");
    if (newSchema) {
      if (newSchema.fields.beskrivelse !== undefined) {
        newSchema.fields.beskrivelse = text;
      }
      newSchema.linkedEntries.push(entryIndex);
      dayLog.schemas.push(newSchema);
    }
  }

  if (type === "hendelse" && ADMIN_CONFIG.ruhTriggerTypes.indexOf("hendelse") !== -1) {
    pendingRuhQuestion = { entryIndex: entryIndex };
    input.value = "";
    document.getElementById("entryType").value = "notat";
    setVoiceStatus("");
    saveCurrentDay();
    showRuhQuestionOverlay();
    return;
  }

  if (type === "vaktlogg" && ADMIN_CONFIG.immediateConfirmTypes.indexOf("vaktlogg") !== -1) {
    pendingImmediateConfirm = { type: "vaktlogg", entryIndex: entryIndex };
    input.value = "";
    document.getElementById("entryType").value = "notat";
    setVoiceStatus("");
    saveCurrentDay();
    showVaktloggConfirmOverlay();
    return;
  }

  if (type === "friksjon" && ADMIN_CONFIG.endOfDayConfirmTypes.indexOf("friksjonsmaling") !== -1) {
    createFriksjonDraft(entryIndex, text);
  }

  input.value = "";
  document.getElementById("entryType").value = "notat";
  setVoiceStatus("");
  saveCurrentDay();
  if (!REACT_MODE) {
    render();
  }
}

// Deferred orchestration for React mode (runs on next tick after entry is visible)
function processEntryOrchestration(entryIndex, text, type) {
  // Defensive: dayLog could be null if startNewDay() raced with setTimeout(0)
  if (!dayLog) return;

  var t0 = typeof performance !== "undefined" ? performance.now() : 0;

  lastOrchestration = orchestrateEntry(text);
  if (lastOrchestration.ordre) {
    updateDraftFromOrchestration(lastOrchestration, entryIndex);
  }

  var runningSchemaKey = detectRunningSchema(text);
  if (runningSchemaKey) {
    var newSchema = createSchemaInstance(runningSchemaKey, "running");
    if (newSchema) {
      if (newSchema.fields.beskrivelse !== undefined) {
        newSchema.fields.beskrivelse = text;
      }
      newSchema.linkedEntries.push(entryIndex);
      dayLog.schemas.push(newSchema);
    }
  }

  if (type === "hendelse" && ADMIN_CONFIG.ruhTriggerTypes.indexOf("hendelse") !== -1) {
    var ruhSchema = {
      id: "ruh_" + Date.now(),
      type: "ruh",
      origin: "drift",
      status: "draft",
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      linkedEntries: [entryIndex],
      fields: {
        tidspunkt: dayLog.entries[entryIndex].time,
        beskrivelse: dayLog.entries[entryIndex].text,
        sted: null,
        arsak: null,
        tiltak: null
      }
    };
    if (!dayLog.schemas) dayLog.schemas = [];
    dayLog.schemas.push(ruhSchema);
  }

  if (type === "vaktlogg" && ADMIN_CONFIG.immediateConfirmTypes.indexOf("vaktlogg") !== -1) {
    var vaktloggDraftSchema = {
      id: "vaktlogg_" + Date.now(),
      type: "vaktlogg",
      origin: "drift",
      status: "draft",
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      linkedEntries: [entryIndex],
      fields: {
        tidspunkt: dayLog.entries[entryIndex].time,
        innhold: dayLog.entries[entryIndex].text
      }
    };
    if (!dayLog.schemas) dayLog.schemas = [];
    dayLog.schemas.push(vaktloggDraftSchema);
  }

  if (type === "friksjon" && ADMIN_CONFIG.endOfDayConfirmTypes.indexOf("friksjonsmaling") !== -1) {
    createFriksjonDraft(entryIndex, text);
  }

  saveCurrentDay();
  emitStateChange("dayLog");

  if (t0) {
    console.log("VOICE LATENCY (parse+draft):", Math.round(performance.now() - t0) + "ms");
  }
}

function openEdit(index) {
  if (appState !== "ACTIVE" && appState !== "FINISHED") return;
  editingIndex = index;

  if (REACT_MODE) {
    emitStateChange("editingIndex");
    return;
  }

  var entry = dayLog.entries[index];
  document.getElementById("editType").value = entry.type;
  document.getElementById("editText").value = entry.text;
  document.getElementById("editOverlay").classList.remove("hidden");
  document.getElementById("editText").focus();
}

function saveEdit(index, newText) {
  if (REACT_MODE) {
    // React mode: accept parameters directly
    var i = (index !== undefined) ? index : editingIndex;
    if (i < 0 || !dayLog.entries[i]) return;
    var text = (newText || "").trim();
    if (text) {
      dayLog.entries[i].text = text;
      saveCurrentDay();
    }
    editingIndex = -1;
    emitStateChange("editingIndex");
    return;
  }

  if (editingIndex < 0) return;
  var newType = document.getElementById("editType").value;
  var domText = document.getElementById("editText").value.trim();
  if (domText) {
    dayLog.entries[editingIndex].type = newType;
    dayLog.entries[editingIndex].text = domText;
    saveCurrentDay();
  }
  cancelEdit();
  if (!REACT_MODE) {
    render();
  }
}

function cancelEdit() {
  editingIndex = -1;
  if (REACT_MODE) {
    emitStateChange("editingIndex");
    return;
  }
  document.getElementById("editOverlay").classList.add("hidden");
}

// ============================================================
// ADMIN-CONTROLLED SCHEMA REQUIREMENTS
// ============================================================

function getSchemaContext() {
  // Build context for when() functions
  var now = new Date();
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
    time: formatTime(now),
    isWinter: ADMIN_CONFIG.isWinter || false,
    dayOfWeek: now.getDay()  // 0 = Sunday
  };
}

function isSchemaRequired(schemaType) {
  // Check if schema is REQUIRED by admin
  // Returns true only if admin has explicitly required it
  if (!ADMIN_CONFIG.requiredSchemas) return false;

  var ctx = getSchemaContext();
  for (var i = 0; i < ADMIN_CONFIG.requiredSchemas.length; i++) {
    var req = ADMIN_CONFIG.requiredSchemas[i];
    if (req.schema === schemaType) {
      // Check when() condition if it exists
      if (typeof req.when === "function") {
        try {
          return req.when(ctx);
        } catch (e) {
          console.error("Error in requiredSchema when():", e);
          return false;
        }
      }
      return true;  // No when() = always required
    }
  }
  return false;
}

function getConditionalSchemaForNow() {
  // Check if any conditional schema should trigger
  if (!ADMIN_CONFIG.conditionalSchemas) return null;

  var ctx = getSchemaContext();
  for (var i = 0; i < ADMIN_CONFIG.conditionalSchemas.length; i++) {
    var cond = ADMIN_CONFIG.conditionalSchemas[i];
    if (typeof cond.when === "function") {
      try {
        if (cond.when(ctx)) {
          return cond;
        }
      } catch (e) {
        console.error("Error in conditionalSchema when():", e);
      }
    }
  }
  return null;
}

// ============================================================
// PRE-DAY OVERLAY
// ============================================================

function showPreDayOverlay() {
  // In React mode, UI is driven by dayLog.phase state
  if (REACT_MODE) return;

  var container = document.getElementById("preDayOverlay");
  if (!container) return;

  renderPreDayContent();
  container.classList.remove("hidden");
}

function hidePreDayOverlay() {
  // In React mode, UI is driven by dayLog.phase state
  if (REACT_MODE) return;

  var container = document.getElementById("preDayOverlay");
  if (container) container.classList.add("hidden");
}

function renderPreDayContent() {
  var content = document.getElementById("preDayContent");
  if (!content || !dayLog) return;

  var preDaySchemas = dayLog.schemas.filter(function (s) { return s.origin === "pre_day"; });

  if (preDaySchemas.length === 0) {
    hidePreDayOverlay();
    dayLog.phase = "active";
    saveCurrentDay();
    return;
  }

  // Check if all required schemas are confirmed
  var requiredMissing = getRequiredSchemasNotConfirmed();

  var html = '<h3>Skjema for dagens start</h3>';
  if (requiredMissing.length > 0) {
    html += '<p class="preday-desc preday-required-warn">Arbeidsgiver krever at f\u00f8lgende skjema bekreftes f\u00f8r arbeidsdagen kan starte.</p>';
  } else {
    html += '<p class="preday-desc">F\u00f8lgende skjema ble gjenkjent. Du kan fylle ut eller hoppe over.</p>';
  }

  html += '<div class="preday-list">';
  for (var i = 0; i < preDaySchemas.length; i++) {
    var schema = preDaySchemas[i];
    var def = PRE_DAY_SCHEMAS[schema.type];
    var required = isSchemaRequired(schema.type);
    var statusLabel = schema.status === "draft" ? "Kladd" : (schema.status === "skipped" ? "Hoppet over" : (schema.status === "confirmed" ? "Bekreftet" : schema.status));

    html += '<div class="preday-item' + (required ? ' preday-required' : ' preday-recommended') + '">';
    html += '<div class="preday-item-header">';
    if (required) {
      html += '<span class="preday-item-name">' + escapeHtml(def.label) + ' <span class="required-badge">P\u00e5krevd av arbeidsgiver</span></span>';
    } else {
      html += '<span class="preday-item-name">' + escapeHtml(def.label) + ' <span class="recommended-badge">Anbefalt</span></span>';
    }
    html += '<span class="preday-item-status status-' + schema.status + '">' + statusLabel + '</span>';
    html += '</div>';
    html += '<div class="preday-item-actions">';
    if (schema.status !== "confirmed") {
      html += '<button class="btn btn-primary btn-small" onclick="openSchemaEdit(\'' + schema.id + '\')">Fyll ut</button>';
    }
    // Skip button available for ALL schemas unless admin has required it
    if (schema.status === "draft" && !required) {
      html += '<button class="btn btn-secondary btn-small" onclick="skipPreDaySchema(\'' + schema.id + '\')">Hopp over</button>';
    }
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';

  html += '<div class="preday-buttons">';
  // Show "skip all" for any remaining draft schemas that aren't required
  var hasSkippable = preDaySchemas.some(function (s) {
    return !isSchemaRequired(s.type) && s.status === "draft";
  });
  if (hasSkippable) {
    html += '<button class="btn btn-secondary" onclick="skipAllPreDay()">Hopp over anbefalte</button>';
  }
  // Disable continue button ONLY if admin-required schemas not confirmed
  if (requiredMissing.length > 0) {
    html += '<button class="btn btn-primary btn-disabled" disabled title="Arbeidsgiver krever at p\u00e5krevde skjema bekreftes">Fortsett</button>';
  } else {
    html += '<button class="btn btn-primary" onclick="continueFromPreDay()">Fortsett</button>';
  }
  html += '</div>';

  content.innerHTML = html;
}

function getRequiredSchemasNotConfirmed() {
  if (!dayLog || !dayLog.schemas) return [];
  return dayLog.schemas.filter(function (s) {
    return s.origin === "pre_day" &&
      isSchemaRequired(s.type) &&
      s.status !== "confirmed";
  });
}

function skipPreDaySchema(schemaId) {
  var schema = findSchemaById(schemaId);
  if (!schema) return;

  // Block skipping of admin-required schemas
  if (isSchemaRequired(schema.type)) {
    if (!REACT_MODE) alert("Dette skjemaet er p\u00e5krevd av arbeidsgiver og kan ikke hoppes over.");
    return;
  }

  schema.status = "skipped";
  saveCurrentDay();
  if (!REACT_MODE) renderPreDayContent();
}

function deferPreDaySchema(schemaId) {
  var schema = findSchemaById(schemaId);
  if (!schema) return;

  // Block deferral of admin-required schemas
  if (isSchemaRequired(schema.type)) {
    if (!REACT_MODE) alert("Dette skjemaet er påkrevd av arbeidsgiver og kan ikke utsettes.");
    return;
  }

  schema.status = "deferred";
  saveCurrentDay();
  if (!REACT_MODE) renderPreDayContent();
}

function skipAllPreDay() {
  // Only skip schemas that are NOT admin-required
  for (var i = 0; i < dayLog.schemas.length; i++) {
    var s = dayLog.schemas[i];
    if (s.origin === "pre_day" && s.status === "draft") {
      if (!isSchemaRequired(s.type)) {
        s.status = "skipped";
      }
    }
  }
  saveCurrentDay();
  if (!REACT_MODE) renderPreDayContent();
}

function continueFromPreDay() {
  // Block if admin-required schemas are not confirmed
  var requiredMissing = getRequiredSchemasNotConfirmed();
  if (requiredMissing.length > 0) {
    if (!REACT_MODE) {
      alert("Arbeidsgiver krever at p\u00e5krevde skjema bekreftes f\u00f8r arbeidsdagen kan starte.");
    }
    return;
  }

  dayLog.phase = "active";
  saveCurrentDay();
  hidePreDayOverlay();
  if (!REACT_MODE) {
    render();
  }
}

/**
 * forceStartDay — Escape hatch for required schema deadlock.
 * Marks unconfirmed required schemas as "force_skipped" and proceeds.
 * force_skipped items MUST be resolved in Håndrens — they block lockDay.
 */
function forceStartDay() {
  if (!dayLog) return;

  // Mark all unconfirmed required schemas as force_skipped
  if (dayLog.schemas) {
    for (var i = 0; i < dayLog.schemas.length; i++) {
      var s = dayLog.schemas[i];
      if (s.origin === "pre_day" && isSchemaRequired(s.type) && s.status !== "confirmed") {
        s.status = "force_skipped";
        s.forceSkippedAt = new Date().toISOString();
      }
    }
  }

  dayLog.phase = "active";
  saveCurrentDay();
  hidePreDayOverlay();
  if (!REACT_MODE) {
    render();
  }
}

// ============================================================
// RUH QUESTION OVERLAY (after hendelse)
// ============================================================

function showRuhQuestionOverlay() {
  if (REACT_MODE) return;

  var container = document.getElementById("ruhQuestionOverlay");
  var content = document.getElementById("ruhQuestionContent");
  if (!container || !content || !pendingRuhQuestion) return;

  var entry = dayLog.entries[pendingRuhQuestion.entryIndex];
  var html = '<h3>Hendelse registrert</h3>';
  html += '<p class="ruh-question-text">Du registrerte:</p>';
  html += '<div class="ruh-question-entry">"' + escapeHtml(entry.text) + '"</div>';
  html += '<p class="ruh-question-prompt">Vil du registrere dette som RUH (Rapport U\u00f8nsket Hendelse)?</p>';
  html += '<div class="ruh-question-buttons">';
  html += '<button class="btn btn-primary" onclick="ruhDecision(\'yes\')">Ja, registrer RUH</button>';
  html += '<button class="btn btn-secondary" onclick="ruhDecision(\'no\')">Nei, behold som hendelse</button>';
  html += '</div>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function hideRuhQuestionOverlay() {
  if (!REACT_MODE) {
    var container = document.getElementById("ruhQuestionOverlay");
    if (container) container.classList.add("hidden");
  }
}

function ruhDecision(decision) {
  if (!pendingRuhQuestion) return;

  var entryIndex = pendingRuhQuestion.entryIndex;
  var entry = dayLog.entries[entryIndex];

  if (decision === "yes") {
    // Mark entry as having RUH decision
    entry.ruhDecision = "yes";

    // Create RUH schema instance
    var ruhSchema = {
      id: "ruh_" + Date.now(),
      type: "ruh",
      origin: "drift",
      status: "draft",
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      linkedEntries: [entryIndex],
      fields: {
        tidspunkt: entry.time,
        beskrivelse: entry.text,
        sted: null,
        arsak: null,   // Must be filled by user
        tiltak: null   // Must be filled by user
      }
    };
    if (!dayLog.schemas) dayLog.schemas = [];
    dayLog.schemas.push(ruhSchema);

    // Open edit immediately so user can fill required fields
    pendingRuhQuestion = null;
    hideRuhQuestionOverlay();
    saveCurrentDay();
    openSchemaEdit(ruhSchema.id);
    return;
  }

  // "no" - just mark the entry as hendelse without RUH
  entry.ruhDecision = "no";
  pendingRuhQuestion = null;
  hideRuhQuestionOverlay();
  saveCurrentDay();
  if (!REACT_MODE) {
    render();
  }
}

// ============================================================
// VAKTLOGG IMMEDIATE CONFIRM OVERLAY
// ============================================================

function showVaktloggConfirmOverlay() {
  if (REACT_MODE) return;

  var container = document.getElementById("immediateConfirmOverlay");
  var content = document.getElementById("immediateConfirmContent");
  if (!container || !content || !pendingImmediateConfirm) return;

  var entry = dayLog.entries[pendingImmediateConfirm.entryIndex];

  var html = '<h3>Vaktlogg registrert</h3>';
  html += '<p class="vaktlogg-confirm-desc">Bekreft innholdet:</p>';
  html += '<div class="vaktlogg-preview">';
  html += '<div class="vaktlogg-field"><span class="vaktlogg-label">Tidspunkt:</span> ' + escapeHtml(entry.time) + '</div>';
  html += '<div class="vaktlogg-field"><span class="vaktlogg-label">Innhold:</span></div>';
  html += '<div class="vaktlogg-text">' + escapeHtml(entry.text) + '</div>';
  html += '</div>';
  html += '<div class="vaktlogg-buttons">';
  html += '<button class="btn btn-primary" onclick="vaktloggConfirm(\'confirm\')">Bekreft</button>';
  html += '<button class="btn btn-danger" onclick="vaktloggConfirm(\'discard\')">Forkast</button>';
  html += '</div>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function hideVaktloggConfirmOverlay() {
  if (!REACT_MODE) {
    var container = document.getElementById("immediateConfirmOverlay");
    if (container) container.classList.add("hidden");
  }
}

function vaktloggConfirm(decision) {
  if (!pendingImmediateConfirm) return;

  var entryIndex = pendingImmediateConfirm.entryIndex;
  var entry = dayLog.entries[entryIndex];

  if (decision === "confirm") {
    // Create confirmed vaktlogg schema
    var vaktloggSchema = {
      id: "vaktlogg_" + Date.now(),
      type: "vaktlogg",
      origin: "drift",
      status: "confirmed",  // Immediately confirmed
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      linkedEntries: [entryIndex],
      fields: {
        tidspunkt: entry.time,
        innhold: entry.text
      }
    };
    if (!dayLog.schemas) dayLog.schemas = [];
    dayLog.schemas.push(vaktloggSchema);
    entry.vaktloggConfirmed = true;
  } else {
    // Discard - mark entry and remove from list
    entry.vaktloggDiscarded = true;
  }

  pendingImmediateConfirm = null;
  hideVaktloggConfirmOverlay();
  saveCurrentDay();
  if (!REACT_MODE) {
    render();
  }
}

// ============================================================
// FRIKSJONSMÅLING DRAFT
// ============================================================

function createFriksjonDraft(entryIndex, text) {
  var entry = dayLog.entries[entryIndex];
  var friksjonSchema = {
    id: "friksjon_" + Date.now(),
    type: "friksjonsmaling",
    origin: "drift",
    status: "draft",  // Confirmed at end of day
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    linkedEntries: [entryIndex],
    fields: {
      tidspunkt: entry.time,
      sted: null,
      verdi: extractFriksjonValue(text),
      kommentar: text
    }
  };
  if (!dayLog.schemas) dayLog.schemas = [];
  dayLog.schemas.push(friksjonSchema);
}

function extractFriksjonValue(text) {
  // Simple extraction of numbers that look like friction values (0.xx or xx)
  var match = text.match(/\b(0[.,]\d+|\d+[.,]\d+|\d+)\b/);
  if (match) {
    return parseFloat(match[1].replace(",", "."));
  }
  return null;
}

// ============================================================
// SCHEMA EDIT OVERLAY
// ============================================================

function findSchemaById(id) {
  if (!dayLog || !dayLog.schemas) return null;
  for (var i = 0; i < dayLog.schemas.length; i++) {
    if (dayLog.schemas[i].id === id) return dayLog.schemas[i];
  }
  return null;
}

function getSchemaDefinition(schema) {
  if (schema.origin === "pre_day") {
    return PRE_DAY_SCHEMAS[schema.type];
  } else if (schema.origin === "drift") {
    return DRIFT_SCHEMAS[schema.type] || RUNNING_SCHEMAS[schema.type];
  } else if (schema.origin === "conversion") {
    return CONVERSION_SCHEMAS[schema.type];
  } else {
    return RUNNING_SCHEMAS[schema.type];
  }
}

function openSchemaEdit(schemaId) {
  editingSchemaId = schemaId;
  var schema = findSchemaById(schemaId);
  if (!schema) return;

  var def = getSchemaDefinition(schema);
  if (!def) return;

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "schema_edit";
  uxState.schemaId = schemaId;
  saveUxState();

  // DOM rendering (vanilla JS mode only)
  if (!REACT_MODE) {
    var content = document.getElementById("schemaEditContent");
    var html = '<h3>Rediger: ' + escapeHtml(def.label) + '</h3>';

    var fieldKeys = Object.keys(def.fields);
    for (var i = 0; i < fieldKeys.length; i++) {
      var fk = fieldKeys[i];
      var fieldDef = def.fields[fk];
      var val = schema.fields[fk] || "";
      var reqMark = fieldDef.required ? ' <span class="schema-req">*</span>' : '';

      html += '<label class="edit-label">' + escapeHtml(fieldDef.label) + reqMark + '</label>';

      if (fieldDef.type === "enum" && fieldDef.options) {
        html += '<select id="schemaField_' + fk + '">';
        html += '<option value="">-- Velg --</option>';
        for (var j = 0; j < fieldDef.options.length; j++) {
          var opt = fieldDef.options[j];
          var sel = val === opt ? ' selected' : '';
          html += '<option value="' + opt + '"' + sel + '>' + escapeHtml(opt) + '</option>';
        }
        html += '</select>';
      } else if (fieldDef.type === "boolean") {
        html += '<select id="schemaField_' + fk + '">';
        html += '<option value="">-- Velg --</option>';
        html += '<option value="true"' + (val === true || val === "true" ? ' selected' : '') + '>Ja</option>';
        html += '<option value="false"' + (val === false || val === "false" ? ' selected' : '') + '>Nei</option>';
        html += '</select>';
      } else {
        html += '<input id="schemaField_' + fk + '" type="text" value="' + escapeHtml(String(val)) + '" />';
      }
    }

    html += '<div class="overlay-buttons">';
    html += '<button class="btn btn-primary" onclick="saveSchemaEdit()">Lagre kladd</button>';
    html += '<button class="btn btn-secondary" onclick="closeSchemaEdit()">Avbryt</button>';
    html += '</div>';

    content.innerHTML = html;
    document.getElementById("schemaEditOverlay").classList.remove("hidden");
  }
}

function saveSchemaEdit() {
  if (!editingSchemaId) return;
  var schema = findSchemaById(editingSchemaId);
  if (!schema) return;

  var def = getSchemaDefinition(schema);
  if (!def) return;

  // In React mode, skip DOM field reading (React would pass fields separately)
  // For now, just confirm the schema with existing values
  if (!REACT_MODE) {
    var fieldKeys = Object.keys(def.fields);
    for (var i = 0; i < fieldKeys.length; i++) {
      var fk = fieldKeys[i];
      var fieldDef = def.fields[fk];
      var el = document.getElementById("schemaField_" + fk);
      if (!el) continue;

      var val = el.value;
      if (fieldDef.type === "boolean") {
        if (val === "true") schema.fields[fk] = true;
        else if (val === "false") schema.fields[fk] = false;
        else schema.fields[fk] = null;
      } else {
        schema.fields[fk] = val || null;
      }
    }
  }

  // In REACT_MODE: validate required fields before confirming.
  // Motor is last defense — React validation is helper layer only.
  if (REACT_MODE) {
    var missingLabels = [];
    var defFieldKeys = Object.keys(def.fields);
    for (var vi = 0; vi < defFieldKeys.length; vi++) {
      var vfk = defFieldKeys[vi];
      var vFieldDef = def.fields[vfk];
      if (vFieldDef.required) {
        var vVal = schema.fields[vfk];
        if (vVal === null || vVal === undefined || vVal === "") {
          missingLabels.push(vFieldDef.label);
        }
      }
    }
    if (missingLabels.length > 0) {
      schemaError = "Fyll ut: " + missingLabels.join(", ");
      if (schemaErrorTimer) clearTimeout(schemaErrorTimer);
      schemaErrorTimer = setTimeout(function() {
        schemaError = null;
        schemaErrorTimer = null;
        emitStateChange("schemaError");
      }, 4000);
      emitStateChange("schemaError");
      return;
    }
    // Validation passed — clear any lingering error
    if (schemaError) { clearSchemaError(); }
  }

  // Mark pre-day schemas as confirmed when saved
  if (schema.origin === "pre_day" && dayLog.phase === "pre") {
    schema.status = "confirmed";
    schema.confirmedAt = new Date().toISOString();
  }

  var schemaOrigin = schema.origin;
  var schemaType = schema.type;

  saveCurrentDay();
  closeSchemaEdit();

  // Handle different contexts
  if (dayLog.phase === "pre") {
    if (!REACT_MODE) renderPreDayContent();
  } else if (dayLog.phase === "ending") {
    if (REACT_MODE) {
      // Håndrens: React re-derives from getUnresolvedItems(), no tunnel needed
      readyToLock = (getUnresolvedCount() === 0);
    } else {
      // Vanilla: continue decision tunnel
      if (schemaOrigin === "conversion") {
        afterConversionSchemaEdit();
      } else if (schemaType === "friksjonsmaling") {
        showFriksjonDecisionOverlay();
      } else if (schemaType === "ruh") {
        render();
      } else {
        showSchemaDecisionOverlay();
      }
    }
  } else {
    if (!REACT_MODE) {
      render();
    }
  }
}

function closeSchemaEdit() {
  editingSchemaId = null;
  clearUxState();
  if (!REACT_MODE) {
    var el = document.getElementById("schemaEditOverlay");
    if (el) el.classList.add("hidden");
  }
}

// Clear schema validation error and notify React
function clearSchemaError() {
  if (schemaErrorTimer) { clearTimeout(schemaErrorTimer); schemaErrorTimer = null; }
  schemaError = null;
  emitStateChange("schemaError");
}

/**
 * setSchemaField — React calls this per field change in the schema edit overlay.
 * Mutates schema.fields[key] in place and persists. React re-reads via getSnapshot().
 * Validation happens in saveSchemaEdit(), not here.
 */
function setSchemaField(schemaId, key, value) {
  if (!dayLog) return;
  var schema = findSchemaById(schemaId);
  if (!schema) return;
  if (!schema.fields.hasOwnProperty(key)) return;
  schema.fields[key] = value;
  saveCurrentDay();
}

// ============================================================
// ACTIVE SCHEMAS PANEL
// ============================================================

function getDraftSchemaCount() {
  if (!dayLog || !dayLog.schemas) return 0;
  var count = 0;
  for (var i = 0; i < dayLog.schemas.length; i++) {
    if (dayLog.schemas[i].status === "draft" || dayLog.schemas[i].status === "skipped") {
      count++;
    }
  }
  return count;
}

function renderSchemasPanel() {
  var container = document.getElementById("schemasPanel");
  if (!container) return;

  var schemas = dayLog ? dayLog.schemas : [];
  var activeSchemas = schemas.filter(function (s) {
    return s.status === "draft" || s.status === "skipped";
  });

  if (activeSchemas.length === 0) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  var html = '<div class="schemas-section">';
  html += '<div class="schemas-header">Aktive skjema (' + activeSchemas.length + ' uferdig)</div>';

  for (var i = 0; i < activeSchemas.length; i++) {
    var schema = activeSchemas[i];
    var def = getSchemaDefinition(schema);
    var statusLabel = schema.status === "draft" ? "Kladd" : "Hoppet over";
    var originLabel = schema.origin === "pre_day" ? "Start" : "L\u00f8pende";

    html += '<div class="schema-item" onclick="openSchemaEdit(\'' + schema.id + '\')">';
    html += '<div class="schema-item-name">' + escapeHtml(def ? def.label : schema.type) + '</div>';
    html += '<div class="schema-item-meta">';
    html += '<span class="schema-item-origin">' + originLabel + '</span>';
    html += '<span class="schema-item-status status-' + schema.status + '">' + statusLabel + '</span>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
  container.classList.remove("hidden");
}

// ============================================================
// END-OF-DAY SCHEMA DECISIONS
// ============================================================

function getSchemasPendingDecision() {
  if (!dayLog || !dayLog.schemas) return [];
  return dayLog.schemas.filter(function (s) {
    // Exclude SJA from end-of-day decisions - it's confirmed only in PRE-DAY
    if (s.type === "sja_preday") return false;
    // Exclude friksjonsmaling - has its own decision loop
    if (s.type === "friksjonsmaling") return false;
    return s.status === "draft" || s.status === "skipped" || s.status === "deferred";
  });
}

function showSchemaDecisionOverlay() {
  if (currentSchemaDecisionIndex >= pendingSchemaDecisions.length) {
    hideSchemaDecisionOverlay();
    showNextDecision();  // Continue to next decision type
    return;
  }

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "schema_decision";
  uxState.decisionPhase = "schemas";
  uxState.decisionIndex = currentSchemaDecisionIndex;
  saveUxState();

  var schema = pendingSchemaDecisions[currentSchemaDecisionIndex];
  var def = getSchemaDefinition(schema);

  // DOM rendering (vanilla JS mode only)
  if (REACT_MODE) return;

  var container = document.getElementById("schemaDecisionOverlay");
  var content = document.getElementById("schemaDecisionContent");

  var html = '<h3>' + escapeHtml(def ? def.label : schema.type) + '</h3>';

  // Show current field values
  html += '<div class="decision-preview">';
  if (def) {
    var fieldKeys = Object.keys(def.fields);
    for (var i = 0; i < fieldKeys.length; i++) {
      var fk = fieldKeys[i];
      var fieldDef = def.fields[fk];
      var val = schema.fields[fk];
      var displayVal = val === null || val === undefined ? '<span class="schema-missing">Ikke utfylt</span>' : escapeHtml(String(val));
      html += '<div class="decision-row"><span class="decision-label">' + escapeHtml(fieldDef.label) + '</span><span>' + displayVal + '</span></div>';
    }
  }
  html += '</div>';

  if (schema.status === "skipped") {
    html += '<div class="decision-warn">Dette skjemaet ble hoppet over ved dagens start.</div>';
  }

  html += '<div class="decision-question">Hva vil du gj\u00f8re med dette skjemaet?</div>';

  html += '<div class="decision-buttons">';
  html += '<button class="btn btn-primary" onclick="schemaDecision(\'confirm\')">Bekreft</button>';
  html += '<button class="btn btn-secondary" onclick="schemaDecision(\'edit\')">Endre</button>';
  html += '<button class="btn btn-danger" onclick="schemaDecision(\'discard\')">Forkast</button>';
  html += '</div>';

  var total = pendingDraftDecisions.length + pendingSchemaDecisions.length;
  var current = pendingDraftDecisions.length + currentSchemaDecisionIndex + 1;
  html += '<div class="decision-progress">' + current + ' av ' + total + '</div>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function hideSchemaDecisionOverlay() {
  if (!REACT_MODE) {
    document.getElementById("schemaDecisionOverlay").classList.add("hidden");
  }
}

function schemaDecision(action) {
  var schema = pendingSchemaDecisions[currentSchemaDecisionIndex];

  if (action === "edit") {
    openSchemaEdit(schema.id);
    return;
  }

  if (action === "confirm") {
    schema.status = "confirmed";
    schema.confirmedAt = new Date().toISOString();
    console.log("[MOCK SEND] Skjema bekreftet: " + schema.type + " (" + schema.id + ")");

    // Propagate entry flags for linked entries
    if (schema.linkedEntries && schema.linkedEntries.length > 0) {
      for (var i = 0; i < schema.linkedEntries.length; i++) {
        var entry = dayLog.entries[schema.linkedEntries[i]];
        if (!entry) continue;
        if (schema.type === "vaktlogg") {
          entry.vaktloggConfirmed = true;
        }
        if (schema.type === "ruh") {
          entry.ruhDecision = "yes";
        }
      }
    }
  }

  if (action === "discard") {
    schema.status = "discarded";

    // Propagate entry flags for linked entries
    if (schema.linkedEntries && schema.linkedEntries.length > 0) {
      for (var i = 0; i < schema.linkedEntries.length; i++) {
        var entry = dayLog.entries[schema.linkedEntries[i]];
        if (!entry) continue;
        if (schema.type === "vaktlogg") {
          entry.vaktloggDiscarded = true;
        }
        if (schema.type === "ruh") {
          entry.ruhDecision = "no";
        }
      }
    }
  }

  saveCurrentDay();
  currentSchemaDecisionIndex++;
  showSchemaDecisionOverlay();
}

// --- Render ---
function render() {
  // In React mode, UI rendering is handled by React components
  if (REACT_MODE) return;

  showView(appState);

  var phaseText = {
    "NOT_STARTED": "Ikke startet",
    "ACTIVE": "Dagen p\u00e5g\u00e5r",
    "FINISHED": "Gjennomgang",
    "LOCKED": "L\u00e5st"
  };
  document.getElementById("phase").textContent = phaseText[appState] || "";

  // Update header badge for active schemas
  updateHeaderBadge();

  if (appState === "NOT_STARTED") {
    renderHistory();
  } else if (appState === "ACTIVE") {
    renderEntries("entriesList", true);
    renderOrchestrationPanel();
    renderDraftPanel();
    renderSchemasPanel();
  } else if (appState === "FINISHED") {
    renderSummary("finishedSummary");
    renderEntries("finishedEntries", true);
    renderConfirmedSchemas();
    renderConfirmedDrafts("confirmedDrafts");

    // Disable "Godkjenn og lås" if main time not handled
    var lockBtn = document.getElementById("btnLock");
    if (lockBtn) {
      if (dayLog && dayLog.mainTimeHandled) {
        lockBtn.disabled = false;
        lockBtn.classList.remove("btn-disabled");
      } else {
        lockBtn.disabled = true;
        lockBtn.classList.add("btn-disabled");
      }
    }
  } else if (appState === "LOCKED") {
    renderSummary("lockedSummary");
    renderEntries("lockedEntries", false);
    renderLockedSchema();
    renderConfirmedDrafts("confirmedDraftsLocked");
  }
}

function updateHeaderBadge() {
  var badge = document.getElementById("headerBadge");
  if (!badge) return;

  var count = getDraftCount() + getDraftSchemaCount();
  if (count > 0 && appState === "ACTIVE") {
    badge.textContent = count + " kladd" + (count > 1 ? "er" : "");
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function showView(state) {
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) {
    views[i].classList.remove("active");
  }
  var viewMap = {
    "NOT_STARTED": "viewNotStarted",
    "ACTIVE": "viewActive",
    "FINISHED": "viewFinished",
    "LOCKED": "viewLocked",
    "HISTORY": "viewHistory"
  };
  var viewId = viewMap[state];
  if (viewId) {
    document.getElementById(viewId).classList.add("active");
  }
}

function renderEntries(containerId, editable) {
  if (!dayLog) return;
  var container = document.getElementById(containerId);
  if (!container) return;

  var html = "";
  for (var i = 0; i < dayLog.entries.length; i++) {
    var entry = dayLog.entries[i];
    var typeLabel = { notat: "Notat", pause: "Pause", kjoring: "Kj\u00f8ring", hendelse: "Hendelse", vaktlogg: "Vaktlogg", friksjon: "Friksjon" };
    var clickAttr = editable ? ' onclick="openEdit(' + i + ')"' : "";
    var readonlyClass = editable ? "" : " readonly";
    html += '<div class="entry type-' + entry.type + readonlyClass + '"' + clickAttr + '>'
      + '<span class="entry-time">' + entry.time + '</span>'
      + '<span class="entry-type type-' + entry.type + '">' + (typeLabel[entry.type] || entry.type) + '</span>'
      + '<div class="entry-text">' + escapeHtml(entry.text) + '</div>'
      + '</div>';
  }

  if (dayLog.entries.length === 0) {
    html = '<div style="color:#999;text-align:center;padding:20px;">Ingen registreringer enn\u00e5</div>';
  }
  container.innerHTML = html;
}

function renderSummary(containerId) {
  if (!dayLog) return;
  var container = document.getElementById(containerId);
  if (!container) return;

  var total = dayLog.entries.length;
  var pauser = 0;
  var kjoringer = 0;
  for (var i = 0; i < dayLog.entries.length; i++) {
    if (dayLog.entries[i].type === "pause") pauser++;
    if (dayLog.entries[i].type === "kjoring") kjoringer++;
  }

  container.innerHTML = '<div class="summary-block">'
    + row("Dato", formatDate(dayLog.date))
    + row("Startet", dayLog.startTime)
    + row("Avsluttet", dayLog.endTime || "\u2013")
    + row("Registreringer", total)
    + row("Pauser", pauser)
    + row("Kj\u00f8ringer", kjoringer)
    + '</div>';
}

function renderHistory() {
  var history = getHistory();
  var container = document.getElementById("historyList");
  if (history.length === 0) {
    container.innerHTML = '<div class="no-history">Ingen lagrede dager</div>';
    return;
  }
  var html = "";
  for (var i = 0; i < history.length; i++) {
    var log = history[i];
    html += '<div class="history-item" onclick="viewHistoryDay(' + i + ')">'
      + '<span class="date">' + formatDate(log.date) + '</span>'
      + '<span class="count">' + log.entries.length + ' registreringer</span>'
      + '</div>';
  }
  container.innerHTML = html;
}

function viewHistoryDay(index) {
  var history = getHistory();
  var log = history[index];
  if (!log) return;

  document.getElementById("historyDetailTitle").textContent = formatDate(log.date);

  var total = log.entries.length;
  var pauser = 0;
  var kjoringer = 0;
  for (var i = 0; i < log.entries.length; i++) {
    if (log.entries[i].type === "pause") pauser++;
    if (log.entries[i].type === "kjoring") kjoringer++;
  }

  document.getElementById("historyDetailSummary").innerHTML = '<div class="summary-block">'
    + row("Startet", log.startTime)
    + row("Avsluttet", log.endTime || "\u2013")
    + row("Registreringer", total)
    + row("Pauser", pauser)
    + row("Kj\u00f8ringer", kjoringer)
    + '</div>';

  var html = "";
  for (var i = 0; i < log.entries.length; i++) {
    var entry = log.entries[i];
    var typeLabel = { notat: "Notat", pause: "Pause", kjoring: "Kj\u00f8ring", hendelse: "Hendelse", vaktlogg: "Vaktlogg", friksjon: "Friksjon" };
    html += '<div class="entry type-' + entry.type + ' readonly">'
      + '<span class="entry-time">' + entry.time + '</span>'
      + '<span class="entry-type type-' + entry.type + '">' + (typeLabel[entry.type] || entry.type) + '</span>'
      + '<div class="entry-text">' + escapeHtml(entry.text) + '</div>'
      + '</div>';
  }
  document.getElementById("historyDetailEntries").innerHTML = html;

  showView("HISTORY");
}

function renderConfirmedSchemas() {
  var container = document.getElementById("confirmedSchemas");
  if (!container || !dayLog) return;

  var confirmed = dayLog.schemas.filter(function (s) { return s.status === "confirmed"; });
  if (confirmed.length === 0) {
    container.innerHTML = "";
    return;
  }

  var html = '<div class="confirmed-schemas-block">';
  html += '<h4>Bekreftede skjema (' + confirmed.length + ')</h4>';

  for (var i = 0; i < confirmed.length; i++) {
    var schema = confirmed[i];
    var def = getSchemaDefinition(schema);
    var schemaName = def ? def.label : schema.type;

    // Special display for SJA: show confirmation time
    var displayText = schemaName;
    if (schema.type === "sja_preday" && schema.confirmedAt) {
      var confTime = new Date(schema.confirmedAt);
      var timeStr = padTwo(confTime.getHours()) + ":" + padTwo(confTime.getMinutes());
      displayText = "SJA bekreftet kl. " + timeStr;
    }

    html += '<div class="confirmed-schema-item">';
    html += '<span class="confirmed-schema-name">' + escapeHtml(displayText) + '</span>';
    html += '<span class="confirmed-schema-check">\u2713</span>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderConfirmedDrafts(containerId) {
  var container = document.getElementById(containerId || "confirmedDrafts");
  if (!container || !dayLog || !dayLog.drafts) {
    if (container) container.innerHTML = "";
    return;
  }

  var confirmed = [];
  var keys = Object.keys(dayLog.drafts);
  for (var i = 0; i < keys.length; i++) {
    if (dayLog.drafts[keys[i]].status === "confirmed") {
      confirmed.push(dayLog.drafts[keys[i]]);
    }
  }

  if (confirmed.length === 0) {
    container.innerHTML = "";
    return;
  }

  var html = '<div class="confirmed-drafts-block">';
  html += '<h4>Bekreftede timeark (' + confirmed.length + ')</h4>';

  for (var i = 0; i < confirmed.length; i++) {
    var draft = confirmed[i];
    var tid = (draft.fra_tid || "?") + " \u2013 " + (draft.til_tid || "?");
    html += '<div class="confirmed-draft-item" onclick="viewConfirmedDraft(\'' + escapeHtml(draft.ordre) + '\')">';
    html += '<div class="confirmed-draft-ordre">Ordre ' + escapeHtml(draft.ordre) + '</div>';
    html += '<div class="confirmed-draft-tid">' + tid + '</div>';
    if (draft.lonnskoder && draft.lonnskoder.length > 0) {
      html += '<div class="confirmed-draft-lonnskoder">' + draft.lonnskoder.length + ' l\u00f8nnskode(r)</div>';
    }
    html += '<span class="confirmed-draft-check">\u2713</span>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function viewConfirmedDraft(ordre) {
  var draft = dayLog.drafts[ordre];
  if (!draft) return;
  showDraftViewOverlay(draft);
}

function renderLockedSchema() {
  // No longer used - ordrebaserte timeark (confirmed drafts) are the source of truth
  var container = document.getElementById("lockedSchemaOutput");
  if (container) container.innerHTML = "";
}

// --- Helpers ---
function formatTime(date) {
  var h = String(date.getHours()).padStart(2, "0");
  var m = String(date.getMinutes()).padStart(2, "0");
  return h + ":" + m;
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  var parts = isoDate.split("-");
  var months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
  return parseInt(parts[2], 10) + ". " + months[parseInt(parts[1], 10) - 1] + " " + parts[0];
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function row(label, value) {
  return '<div class="summary-row"><span class="label">' + label + '</span><span>' + value + '</span></div>';
}

// ============================================================
// ORCHESTRATION: VOICE -> FACTS + ACTIONS
// ============================================================

// Extract objective facts from voice text (no interpretation, no guessing)
function orchestrateEntry(text) {
  var result = {
    ordre: null,
    tidsrom: { fra: null, til: null },
    ressurser: [],
    behov: [],       // External systems needed
    rawText: text
  };

  // Extract ordre number: patterns like "204481-0014", "ordre 1234-5"
  var ordreMatch = text.match(/\b(\d{4,}-\d{1,4})\b/);
  if (ordreMatch) result.ordre = ordreMatch[1];

  // Extract time range: "fra 08.30 til 14.00", "08:30 - 14:00", "08.30-14.00"
  var timeRangeMatch = text.match(/(\d{1,2})[:\.](\d{2})\s*(?:til|-)\s*(\d{1,2})[:\.](\d{2})/i);
  if (timeRangeMatch) {
    result.tidsrom.fra = padTwo(timeRangeMatch[1]) + ":" + timeRangeMatch[2];
    result.tidsrom.til = padTwo(timeRangeMatch[3]) + ":" + timeRangeMatch[4];
  } else {
    // Try to extract single times
    var times = extractAllTimes(text);
    if (times.length >= 2) {
      result.tidsrom.fra = times[0];
      result.tidsrom.til = times[1];
    } else if (times.length === 1) {
      result.tidsrom.fra = times[0];
    }
  }

  // Extract resources (equipment)
  var ressurser = extractRessurser(text);
  if (ressurser) result.ressurser = ressurser;

  // Detect external system needs (keywords)
  var lower = text.toLowerCase();
  if (lower.indexOf("maskinlogg") !== -1 || lower.indexOf("logge inn p\u00e5 maskin") !== -1 || lower.indexOf("logg inn") !== -1) {
    result.behov.push("Maskinlogg");
  }
  if (lower.indexOf("elrapp") !== -1) {
    result.behov.push("Elrapp");
  }
  if (lower.indexOf("sja") !== -1 || lower.indexOf("sikker jobb") !== -1) {
    result.behov.push("SJA");
  }
  if (lower.indexOf("arbeidsvarsling") !== -1) {
    result.behov.push("Arbeidsvarsling");
  }

  return result;
}

// Check if orchestration found anything significant
function hasOrchestrationData(orch) {
  return orch && (orch.ordre || orch.tidsrom.fra || orch.ressurser.length > 0 || orch.behov.length > 0);
}

// ============================================================
// TIMEARK DRAFT SYSTEM (ordre-based)
// ============================================================

function ensureDrafts() {
  if (!dayLog.drafts) dayLog.drafts = {};
}

function getOrCreateDraft(ordre) {
  ensureDrafts();
  if (!dayLog.drafts[ordre]) {
    dayLog.drafts[ordre] = {
      ordre: ordre,
      dato: dayLog.date,
      fra_tid: null,
      til_tid: null,
      arbeidsbeskrivelse: [],
      ressurser: [],
      lonnskoder: [],  // Array of { kode: "ORD", fra: "08:30", til: "14:00" }
      maskintimer: [],  // Array of { maskin: "string", timer: number }
      arbeidsvarsling: null,
      entryIndices: [],
      status: "draft"  // draft | confirmed | discarded
    };
  }
  return dayLog.drafts[ordre];
}

function updateDraftFromOrchestration(orch, entryIndex) {
  if (!orch.ordre) return;

  var draft = getOrCreateDraft(orch.ordre);

  // Update times (first time wins for fra, last time wins for til)
  if (orch.tidsrom.fra && !draft.fra_tid) {
    draft.fra_tid = orch.tidsrom.fra;
  }
  if (orch.tidsrom.til) {
    draft.til_tid = orch.tidsrom.til;
  }

  // Accumulate resources (no duplicates)
  for (var i = 0; i < orch.ressurser.length; i++) {
    if (draft.ressurser.indexOf(orch.ressurser[i]) === -1) {
      draft.ressurser.push(orch.ressurser[i]);
    }
  }

  // Track which entries reference this ordre
  if (draft.entryIndices.indexOf(entryIndex) === -1) {
    draft.entryIndices.push(entryIndex);
  }

  saveCurrentDay();
}

function updateDraftDescriptions() {
  // Rebuild descriptions from all entries referencing each draft
  ensureDrafts();
  var ordreKeys = Object.keys(dayLog.drafts);
  for (var i = 0; i < ordreKeys.length; i++) {
    var draft = dayLog.drafts[ordreKeys[i]];
    draft.arbeidsbeskrivelse = [];
    for (var j = 0; j < draft.entryIndices.length; j++) {
      var idx = draft.entryIndices[j];
      if (dayLog.entries[idx] && dayLog.entries[idx].type === "notat") {
        draft.arbeidsbeskrivelse.push(dayLog.entries[idx].text);
      }
    }
  }
}

function getDraftCount() {
  if (!dayLog || !dayLog.drafts) return 0;
  var count = 0;
  var keys = Object.keys(dayLog.drafts);
  for (var i = 0; i < keys.length; i++) {
    if (dayLog.drafts[keys[i]].status === "draft") count++;
  }
  return count;
}

function getActiveDrafts() {
  if (!dayLog || !dayLog.drafts) return [];
  var active = [];
  var keys = Object.keys(dayLog.drafts);
  for (var i = 0; i < keys.length; i++) {
    if (dayLog.drafts[keys[i]].status === "draft") {
      active.push(dayLog.drafts[keys[i]]);
    }
  }
  return active;
}

// ============================================================
// ORCHESTRATION UI
// ============================================================

function renderOrchestrationPanel() {
  var container = document.getElementById("orchestrationPanel");
  if (!container) return;

  if (!lastOrchestration || !hasOrchestrationData(lastOrchestration)) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  var orch = lastOrchestration;
  var html = '<div class="orch-block">';
  html += '<div class="orch-header">Ekstrahert fra siste entry</div>';

  if (orch.ordre) {
    html += '<div class="orch-row"><span class="orch-label">Ordre</span><span class="orch-value">' + escapeHtml(orch.ordre) + '</span></div>';
  }
  if (orch.tidsrom.fra || orch.tidsrom.til) {
    var tid = (orch.tidsrom.fra || "?") + " \u2013 " + (orch.tidsrom.til || "?");
    html += '<div class="orch-row"><span class="orch-label">Tidsrom</span><span class="orch-value">' + tid + '</span></div>';
  }
  if (orch.ressurser.length > 0) {
    html += '<div class="orch-row"><span class="orch-label">Utstyr</span><span class="orch-value">' + escapeHtml(orch.ressurser.join(", ")) + '</span></div>';
  }
  if (orch.behov.length > 0) {
    html += '<div class="orch-row orch-row-warn"><span class="orch-label">Behov</span><span class="orch-value">' + escapeHtml(orch.behov.join(", ")) + '</span></div>';
  }

  html += '</div>';
  container.innerHTML = html;
  container.classList.remove("hidden");

  // Auto-hide after 8 seconds
  setTimeout(function () {
    container.classList.add("hidden");
  }, 8000);
}

function renderDraftPanel() {
  var container = document.getElementById("draftPanel");
  if (!container) return;

  var drafts = getActiveDrafts();
  if (drafts.length === 0) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  var html = '<div class="draft-section">';
  html += '<div class="draft-header">Timeark-kladder (' + drafts.length + ')</div>';

  for (var i = 0; i < drafts.length; i++) {
    var d = drafts[i];
    var tid = (d.fra_tid || "?") + " \u2013 " + (d.til_tid || "?");
    html += '<div class="draft-item">';
    html += '<div class="draft-ordre">Ordre ' + escapeHtml(d.ordre) + '</div>';
    html += '<div class="draft-detail">Tid: ' + tid + '</div>';
    if (d.ressurser.length > 0) {
      html += '<div class="draft-detail">Utstyr: ' + escapeHtml(d.ressurser.join(", ")) + '</div>';
    }
    html += '<div class="draft-detail draft-entries">' + d.entryIndices.length + ' registrering(er)</div>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
  container.classList.remove("hidden");
}

// ============================================================
// END-OF-DAY DECISION SYSTEM (DRAFTS)
// ============================================================

function showDraftDecisionOverlay() {
  if (currentDraftDecisionIndex >= pendingDraftDecisions.length) {
    // All draft decisions made, continue to next decision type
    hideDraftDecisionOverlay();
    showNextDecision();
    return;
  }

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "draft_decision";
  uxState.decisionPhase = "drafts";
  uxState.decisionIndex = currentDraftDecisionIndex;
  saveUxState();

  var draft = pendingDraftDecisions[currentDraftDecisionIndex];
  updateDraftDescriptions();  // Refresh descriptions from entries

  // DOM rendering (vanilla JS mode only)
  if (REACT_MODE) return;

  var container = document.getElementById("draftDecisionOverlay");
  var content = document.getElementById("draftDecisionContent");

  var tid = (draft.fra_tid || "?") + " \u2013 " + (draft.til_tid || "?");
  var desc = draft.arbeidsbeskrivelse.length > 0 ? draft.arbeidsbeskrivelse.join(". ") : "(ingen beskrivelse)";

  var html = '<h3>Timeark for ordre ' + escapeHtml(draft.ordre) + '</h3>';
  html += '<div class="decision-preview">';
  html += '<div class="decision-row"><span class="decision-label">Dato</span><span>' + formatDate(draft.dato) + '</span></div>';
  html += '<div class="decision-row"><span class="decision-label">Tid</span><span>' + tid + '</span></div>';
  if (draft.ressurser && draft.ressurser.length > 0) {
    html += '<div class="decision-row"><span class="decision-label">Utstyr</span><span>' + escapeHtml(draft.ressurser.join(", ")) + '</span></div>';
  }
  if (draft.lonnskoder && draft.lonnskoder.length > 0) {
    var lkText = draft.lonnskoder.map(function (lk) { return lk.kode + " (" + lk.fra + "-" + lk.til + ")"; }).join(", ");
    html += '<div class="decision-row"><span class="decision-label">L\u00f8nnskoder</span><span>' + escapeHtml(lkText) + '</span></div>';
  }
  html += '<div class="decision-row"><span class="decision-label">Beskrivelse</span></div>';
  html += '<div class="decision-desc">' + escapeHtml(desc) + '</div>';
  html += '</div>';

  html += '<div class="decision-question">Fyll inn timef\u00f8ring for dette timearket:</div>';

  html += '<div class="decision-buttons decision-buttons-stacked">';
  html += '<button class="btn btn-primary btn-large" onclick="draftDecision(\'timeentry\')">Fyll inn timef\u00f8ring</button>';
  html += '<button class="btn btn-secondary" onclick="draftDecision(\'view\')">Vis r\u00e5data</button>';
  html += '<button class="btn btn-danger" onclick="draftDecision(\'discard\')">Forkast kladd</button>';
  html += '</div>';

  var total = pendingDraftDecisions.length + pendingSchemaDecisions.length;
  html += '<div class="decision-progress">' + (currentDraftDecisionIndex + 1) + ' av ' + total + '</div>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function hideDraftDecisionOverlay() {
  if (!REACT_MODE) {
    document.getElementById("draftDecisionOverlay").classList.add("hidden");
  }
}

function draftDecision(action) {
  var draft = pendingDraftDecisions[currentDraftDecisionIndex];

  if (action === "view") {
    showDraftViewOverlay(draft);
    return;
  }

  if (action === "timeentry") {
    // Open comprehensive time entry overlay
    openTimeEntryOverlay(draft.ordre);
    return;
  }

  if (action === "edit") {
    openDraftEdit(draft.ordre);
    return;
  }

  if (action === "discard") {
    draft.status = "discarded";
    saveCurrentDay();
    currentDraftDecisionIndex++;
    showDraftDecisionOverlay();
  }
}

// Called after time entry is confirmed
function confirmDraftFromTimeEntry() {
  var draft = pendingDraftDecisions[currentDraftDecisionIndex];
  if (!draft) return;

  draft.status = "confirmed";
  draft.confirmedAt = new Date().toISOString();
  console.log("[MOCK SEND] Timeark bekreftet for ordre " + draft.ordre);

  saveCurrentDay();
  currentDraftDecisionIndex++;
  hideTimeEntryOverlay();
  showDraftDecisionOverlay();
}

function showDraftViewOverlay(draft) {
  if (REACT_MODE) return;

  var container = document.getElementById("draftViewOverlay");
  var content = document.getElementById("draftViewContent");

  updateDraftDescriptions();

  var json = {
    oppdragsnummer: draft.ordre,
    dato: draft.dato,
    fra_tid: draft.fra_tid,
    til_tid: draft.til_tid,
    arbeidsbeskrivelse: draft.arbeidsbeskrivelse.join(". "),
    ressurser: draft.ressurser,
    lonnskoder: draft.lonnskoder || [],
    arbeidsvarsling: draft.arbeidsvarsling || null
  };

  var html = '<h3>Timeark \u2013 Ordre ' + escapeHtml(draft.ordre) + '</h3>';
  html += '<pre class="schema-json">' + escapeHtml(JSON.stringify(json, null, 2)) + '</pre>';
  html += '<button class="btn btn-secondary" onclick="closeDraftViewOverlay()">Lukk</button>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function closeDraftViewOverlay() {
  if (!REACT_MODE) {
    document.getElementById("draftViewOverlay").classList.add("hidden");
  }
}

// ============================================================
// FRIKSJONSMÅLING DECISION OVERLAY (end of day)
// ============================================================

function showFriksjonDecisionOverlay() {
  if (currentFriksjonDecisionIndex >= pendingFriksjonDecisions.length) {
    hideFriksjonDecisionOverlay();
    showNextDecision();
    return;
  }

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "friksjon_decision";
  uxState.decisionPhase = "friksjon";
  uxState.decisionIndex = currentFriksjonDecisionIndex;
  saveUxState();

  var schema = pendingFriksjonDecisions[currentFriksjonDecisionIndex];
  var def = DRIFT_SCHEMAS.friksjonsmaling;

  // DOM rendering (vanilla JS mode only)
  if (REACT_MODE) return;

  var container = document.getElementById("friksjonDecisionOverlay");
  var content = document.getElementById("friksjonDecisionContent");
  if (!container || !content) {
    // Fallback if overlay doesn't exist
    currentFriksjonDecisionIndex++;
    showNextDecision();
    return;
  }

  var html = '<h3>Friksjonsm\u00e5ling</h3>';
  html += '<div class="decision-preview">';
  html += '<div class="decision-row"><span class="decision-label">Tidspunkt</span><span>' + escapeHtml(schema.fields.tidspunkt || "?") + '</span></div>';
  html += '<div class="decision-row"><span class="decision-label">Sted</span><span>' + (schema.fields.sted ? escapeHtml(schema.fields.sted) : '<span class="schema-missing">Ikke utfylt</span>') + '</span></div>';
  html += '<div class="decision-row"><span class="decision-label">Verdi</span><span>' + (schema.fields.verdi !== null ? schema.fields.verdi : '<span class="schema-missing">Ikke utfylt</span>') + '</span></div>';
  if (schema.fields.kommentar) {
    html += '<div class="decision-row"><span class="decision-label">Kommentar</span><span>' + escapeHtml(schema.fields.kommentar) + '</span></div>';
  }
  html += '</div>';

  html += '<div class="decision-question">Hva vil du gj\u00f8re med denne friksjonsm\u00e5lingen?</div>';
  html += '<div class="decision-buttons">';
  html += '<button class="btn btn-primary" onclick="friksjonDecision(\'confirm\')">Bekreft</button>';
  html += '<button class="btn btn-secondary" onclick="friksjonDecision(\'edit\')">Endre</button>';
  html += '<button class="btn btn-danger" onclick="friksjonDecision(\'discard\')">Forkast</button>';
  html += '</div>';

  var total = pendingDraftDecisions.length + pendingSchemaDecisions.length + pendingFriksjonDecisions.length + pendingNoteDecisions.length;
  var current = pendingDraftDecisions.length + pendingSchemaDecisions.length + currentFriksjonDecisionIndex + 1;
  html += '<div class="decision-progress">' + current + ' av ' + total + '</div>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function hideFriksjonDecisionOverlay() {
  if (!REACT_MODE) {
    var container = document.getElementById("friksjonDecisionOverlay");
    if (container) container.classList.add("hidden");
  }
}

function friksjonDecision(action) {
  var schema = pendingFriksjonDecisions[currentFriksjonDecisionIndex];

  if (action === "edit") {
    openSchemaEdit(schema.id);
    return;
  }

  if (action === "confirm") {
    schema.status = "confirmed";
    schema.confirmedAt = new Date().toISOString();
    console.log("[MOCK SEND] Friksjonsm\u00e5ling bekreftet");
  }

  if (action === "discard") {
    schema.status = "discarded";
  }

  saveCurrentDay();
  currentFriksjonDecisionIndex++;
  showFriksjonDecisionOverlay();
}

// ============================================================
// NOTE DECISION OVERLAY (end of day - convert to schema)
// ============================================================

function showNoteDecisionOverlay() {
  if (currentNoteDecisionIndex >= pendingNoteDecisions.length) {
    hideNoteDecisionOverlay();
    showNextDecision();
    return;
  }

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "note_decision";
  uxState.decisionPhase = "notes";
  uxState.decisionIndex = currentNoteDecisionIndex;
  saveUxState();

  var noteData = pendingNoteDecisions[currentNoteDecisionIndex];
  var entry = noteData.entry;

  // DOM rendering (vanilla JS mode only)
  if (REACT_MODE) return;

  var container = document.getElementById("noteDecisionOverlay");
  var content = document.getElementById("noteDecisionContent");
  if (!container || !content) {
    currentNoteDecisionIndex++;
    showNextDecision();
    return;
  }

  var html = '<h3>Notat</h3>';
  html += '<div class="note-decision-preview">';
  html += '<div class="note-time">' + escapeHtml(entry.time) + '</div>';
  html += '<div class="note-text">"' + escapeHtml(entry.text) + '"</div>';
  html += '</div>';

  html += '<div class="decision-question">Hva vil du gj\u00f8re med dette notatet?</div>';
  html += '<div class="decision-buttons decision-buttons-vertical">';
  html += '<button class="btn btn-secondary" onclick="noteDecision(\'keep\')">Behold som notat</button>';
  html += '<button class="btn btn-primary" onclick="noteDecision(\'convert\')">Konverter til skjema</button>';
  html += '</div>';

  var total = pendingDraftDecisions.length + pendingSchemaDecisions.length + pendingFriksjonDecisions.length + pendingNoteDecisions.length;
  var current = pendingDraftDecisions.length + pendingSchemaDecisions.length + pendingFriksjonDecisions.length + currentNoteDecisionIndex + 1;
  html += '<div class="decision-progress">' + current + ' av ' + total + '</div>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function hideNoteDecisionOverlay() {
  if (!REACT_MODE) {
    var container = document.getElementById("noteDecisionOverlay");
    if (container) container.classList.add("hidden");
  }
}

function noteDecision(action) {
  var noteData = pendingNoteDecisions[currentNoteDecisionIndex];

  if (action === "keep") {
    noteData.entry.keptAsNote = true;
    saveCurrentDay();
    currentNoteDecisionIndex++;
    showNoteDecisionOverlay();
    return;
  }

  if (action === "convert") {
    // Show conversion target selection
    showConversionTargetOverlay(noteData);
    return;
  }
}

function showConversionTargetOverlay(noteData) {
  if (REACT_MODE) return;

  var container = document.getElementById("conversionTargetOverlay");
  var content = document.getElementById("conversionTargetContent");
  if (!container || !content) return;

  var html = '<h3>Velg skjematype</h3>';
  html += '<p class="conversion-desc">Konverter notatet til:</p>';
  html += '<div class="conversion-targets">';

  var targets = ADMIN_CONFIG.noteConversionTargets;
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    html += '<button class="btn btn-conversion" onclick="selectConversionTarget(\'' + t.key + '\')">' + escapeHtml(t.label) + '</button>';
  }

  html += '</div>';
  html += '<div class="conversion-cancel">';
  html += '<button class="btn btn-secondary" onclick="cancelConversion()">Avbryt</button>';
  html += '</div>';

  content.innerHTML = html;
  container.classList.remove("hidden");
}

function hideConversionTargetOverlay() {
  if (!REACT_MODE) {
    var container = document.getElementById("conversionTargetOverlay");
    if (container) container.classList.add("hidden");
  }
}

function cancelConversion() {
  hideConversionTargetOverlay();
  // Stay on current note decision
  showNoteDecisionOverlay();
}

function selectConversionTarget(targetKey) {
  var noteData = pendingNoteDecisions[currentNoteDecisionIndex];
  var entry = noteData.entry;
  var def = CONVERSION_SCHEMAS[targetKey];
  if (!def) return;

  hideConversionTargetOverlay();
  hideNoteDecisionOverlay();

  // Create conversion schema instance
  var conversionSchema = {
    id: "conv_" + targetKey + "_" + Date.now(),
    type: targetKey,
    origin: "conversion",
    status: "draft",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    linkedEntries: [noteData.entryIndex],
    fields: {}
  };

  // Initialize fields from definition
  var fieldKeys = Object.keys(def.fields);
  for (var i = 0; i < fieldKeys.length; i++) {
    var fk = fieldKeys[i];
    conversionSchema.fields[fk] = null;
  }

  // Pre-fill text-based fields with note content
  if (conversionSchema.fields.innhold !== undefined) {
    conversionSchema.fields.innhold = entry.text;
  }
  if (conversionSchema.fields.beskrivelse !== undefined) {
    conversionSchema.fields.beskrivelse = entry.text;
  }
  if (conversionSchema.fields.tittel !== undefined) {
    // Use first part of note as title
    conversionSchema.fields.tittel = entry.text.substring(0, 50) + (entry.text.length > 50 ? "..." : "");
  }
  if (conversionSchema.fields.dato !== undefined) {
    conversionSchema.fields.dato = dayLog.date;
  }

  if (!dayLog.schemas) dayLog.schemas = [];
  dayLog.schemas.push(conversionSchema);

  // Mark entry as converted
  entry.converted = true;
  entry.convertedTo = targetKey;

  saveCurrentDay();

  // Open schema edit for user to fill remaining fields
  openSchemaEdit(conversionSchema.id);
}

// Called when conversion schema edit is saved/closed
function afterConversionSchemaEdit() {
  currentNoteDecisionIndex++;
  showNoteDecisionOverlay();
}

// ============================================================
// DRAFT EDIT
// ============================================================

function openDraftEdit(ordre) {
  editingDraftOrdre = ordre;
  var draft = dayLog.drafts[ordre];
  if (!draft) return;

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "draft_edit";
  uxState.draftOrdre = ordre;
  saveUxState();

  // Ensure lonnskoder array exists (for drafts created before this field)
  if (!draft.lonnskoder) draft.lonnskoder = [];

  // DOM rendering (vanilla JS mode only)
  if (!REACT_MODE) {
    document.getElementById("editDraftOrdre").value = draft.ordre;
    document.getElementById("editDraftFra").value = draft.fra_tid || "";
    document.getElementById("editDraftTil").value = draft.til_tid || "";
    document.getElementById("editDraftRessurser").value = draft.ressurser.join(", ");

    renderLonnskodeList();
    clearNewLonnskodeInputs();

    document.getElementById("draftEditOverlay").classList.remove("hidden");
  }
}

function saveDraftEdit() {
  if (!editingDraftOrdre) return;
  var draft = dayLog.drafts[editingDraftOrdre];
  if (!draft) return;

  // DOM reading (vanilla JS mode only) - React passes values separately
  if (!REACT_MODE) {
    draft.fra_tid = document.getElementById("editDraftFra").value || null;
    draft.til_tid = document.getElementById("editDraftTil").value || null;

    var ressStr = document.getElementById("editDraftRessurser").value;
    if (ressStr.trim()) {
      draft.ressurser = ressStr.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    } else {
      draft.ressurser = [];
    }
  }

  saveCurrentDay();
  closeDraftEdit();

  // Re-show the decision overlay
  showDraftDecisionOverlay();
}

function closeDraftEdit() {
  editingDraftOrdre = null;
  clearUxState();
  if (!REACT_MODE) {
    document.getElementById("draftEditOverlay").classList.add("hidden");
  }
}

// ============================================================
// MAIN TIMESHEET (HOVEDTIMEARK) FUNCTIONS
// ============================================================

function getOrCreateMainDraft() {
  var hovedordre = ADMIN_CONFIG.hovedordre;

  if (!dayLog.drafts[hovedordre]) {
    dayLog.drafts[hovedordre] = {
      ordre: hovedordre,
      dato: dayLog.date,
      fra_tid: null,
      til_tid: null,
      arbeidsbeskrivelse: [],
      ressurser: [],
      lonnskoder: [],
      maskintimer: [],
      arbeidsvarsling: null,
      entryIndices: [],
      status: "draft",
      isMain: true  // Flag to identify main draft
    };
  }

  return dayLog.drafts[hovedordre];
}

function grovutfyllMainDraft(mainDraft) {
  // Grovutfyll: only deterministic values (fra/til from day start/end)
  // Lønnskoder are NOT pre-filled — user adds them explicitly.

  // Set from/to based on day start/end (guard null startTime)
  mainDraft.fra_tid = dayLog.startTime || formatTime(new Date());
  mainDraft.til_tid = dayLog.endTime;
}

function getLockedHoursFromTillegg() {
  // Sum hours from confirmed drafts that are NOT the main draft
  var hovedordre = ADMIN_CONFIG.hovedordre;
  var totalHours = 0;
  var details = [];

  if (!dayLog || !dayLog.drafts) return { totalHours: 0, details: [] };

  var keys = Object.keys(dayLog.drafts);
  for (var i = 0; i < keys.length; i++) {
    var draft = dayLog.drafts[keys[i]];
    if (draft.ordre === hovedordre) continue;  // Skip main draft
    if (draft.status !== "confirmed") continue;  // Only confirmed drafts

    // Sum hours from lønnskoder
    if (draft.lonnskoder && draft.lonnskoder.length > 0) {
      for (var j = 0; j < draft.lonnskoder.length; j++) {
        var lk = draft.lonnskoder[j];
        var hours = calculateHoursBetween(lk.fra, lk.til);
        if (hours > 0) {
          totalHours += hours;
          details.push({
            ordre: draft.ordre,
            kode: lk.kode,
            fra: lk.fra,
            til: lk.til,
            hours: hours
          });
        }
      }
    }
  }

  return { totalHours: totalHours, details: details };
}

function calculateHoursBetween(fra, til) {
  if (!fra || !til) return 0;
  var fraParts = fra.split(":");
  var tilParts = til.split(":");
  if (fraParts.length < 2 || tilParts.length < 2) return 0;

  var fraMinutes = parseInt(fraParts[0], 10) * 60 + parseInt(fraParts[1], 10);
  var tilMinutes = parseInt(tilParts[0], 10) * 60 + parseInt(tilParts[1], 10);

  var diff = tilMinutes - fraMinutes;
  if (diff < 0) diff += 24 * 60;  // Handle overnight

  return diff / 60;
}

function subtractHoursFromTime(timeStr, hours) {
  if (!timeStr) return timeStr;
  var parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;

  var totalMinutes = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  var subtractMinutes = Math.round(hours * 60);
  var newMinutes = totalMinutes - subtractMinutes;

  if (newMinutes < 0) newMinutes = 0;

  var h = Math.floor(newMinutes / 60);
  var m = newMinutes % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

// KRITISK: Oppdater draft.fra_tid og draft.til_tid basert på lønnskoder
// Dette sikrer at oversikten viser faktiske tider, ikke grovutfyllte
function updateDraftTimesFromLonnskoder(draft) {
  if (!draft || !draft.lonnskoder || draft.lonnskoder.length === 0) return;

  var earliestFra = null;
  var latestTil = null;

  for (var i = 0; i < draft.lonnskoder.length; i++) {
    var lk = draft.lonnskoder[i];

    // Finn tidligste fra-tid
    if (lk.fra) {
      if (earliestFra === null || compareTime(lk.fra, earliestFra) < 0) {
        earliestFra = lk.fra;
      }
    }

    // Finn seneste til-tid
    if (lk.til) {
      if (latestTil === null || compareTime(lk.til, latestTil) > 0) {
        latestTil = lk.til;
      }
    }
  }

  // Oppdater draft med faktiske tider
  if (earliestFra !== null) draft.fra_tid = earliestFra;
  if (latestTil !== null) draft.til_tid = latestTil;
}

// Sammenlign to tidspunkter (HH:MM format)
// Returnerer: negativ hvis a < b, 0 hvis lik, positiv hvis a > b
function compareTime(a, b) {
  if (!a || !b) return 0;
  var aParts = a.split(":");
  var bParts = b.split(":");
  if (aParts.length < 2 || bParts.length < 2) return 0;

  var aMinutes = parseInt(aParts[0], 10) * 60 + parseInt(aParts[1], 10);
  var bMinutes = parseInt(bParts[0], 10) * 60 + parseInt(bParts[1], 10);

  return aMinutes - bMinutes;
}

function openMainTimeEntryOverlay() {
  var hovedordre = ADMIN_CONFIG.hovedordre;
  timeEntryOrdre = hovedordre;

  var draft = dayLog.drafts[hovedordre];
  if (!draft) return;

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "main_time_entry";
  uxState.decisionPhase = "main_time";
  saveUxState();

  // Ensure arrays exist
  if (!draft.lonnskoder) draft.lonnskoder = [];
  if (!draft.maskintimer) draft.maskintimer = [];

  // DOM rendering (vanilla JS mode only)
  if (!REACT_MODE) {
    renderMainTimeEntryContent();
    document.getElementById("timeEntryOverlay").classList.remove("hidden");
  }
}

function renderMainTimeEntryContent() {
  var content = document.getElementById("timeEntryContent");
  if (!content || !timeEntryOrdre) return;

  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft) return;

  var lockedInfo = getLockedHoursFromTillegg();

  var html = '<h3>Hovedtimef\u00f8ring</h3>';

  // Info about day
  html += '<div class="timeentry-info">';
  html += '<div class="timeentry-row"><span class="timeentry-label">Dato:</span> ' + formatDate(draft.dato) + '</div>';
  html += '<div class="timeentry-row"><span class="timeentry-label">Arbeidstid:</span> ' + (dayLog.startTime || "?") + ' \u2013 ' + (dayLog.endTime || "?") + '</div>';
  html += '</div>';

  // Show locked hours from tillegg (if any)
  if (lockedInfo.totalHours > 0) {
    html += '<div class="timeentry-locked-info">';
    html += '<strong>' + lockedInfo.totalHours.toFixed(1) + ' timer</strong> er allerede f\u00f8rt p\u00e5 tilleggsoppdrag og er l\u00e5st.';
    html += '</div>';
  }

  // Lønnskoder section
  html += '<div class="timeentry-section">';
  html += '<h4>L\u00f8nnskoder</h4>';
  html += '<div id="timeEntryLonnskodeList"></div>';
  html += '<button class="btn btn-small btn-add-line" onclick="teAddLonnskode()">+ Legg til l\u00f8nnskode</button>';
  html += '</div>';

  // Maskintimer section (always show for main timesheet)
  html += '<div class="timeentry-section timeentry-machine">';
  html += '<h4>Maskintimer</h4>';
  html += '<p class="timeentry-machine-hint">Legg til maskintimer hvis aktuelt.</p>';
  html += '<div id="timeEntryMaskintimeList"></div>';
  html += '<button class="btn btn-small btn-add-line" onclick="teAddMaskintime()">+ Legg til maskintime</button>';
  html += '</div>';

  // Action buttons
  html += '<div class="timeentry-actions">';
  html += '<button class="btn btn-primary btn-large" onclick="confirmMainTimeEntry()">Bekreft hovedtimeark</button>';
  html += '<button class="btn btn-secondary" onclick="discardMainTimeEntry()">Forkast (all tid p\u00e5 tillegg)</button>';
  html += '</div>';

  content.innerHTML = html;

  // Render lists
  renderTimeEntryLonnskodeList();
  renderTimeEntryMaskintimeList();
}

function confirmMainTimeEntry() {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft) return;

  // Validate: must have at least one lønnskode
  if (!draft.lonnskoder || draft.lonnskoder.length === 0) {
    if (!REACT_MODE) alert("Du m\u00e5 legge til minst \u00e9n l\u00f8nnskode");
    return;
  }

  // KRITISK: Oppdater fra_tid/til_tid basert på faktiske lønnskoder
  updateDraftTimesFromLonnskoder(draft);

  // Mark as confirmed
  draft.status = "confirmed";
  draft.confirmedAt = new Date().toISOString();

  // Set flag: main time handled
  dayLog.mainTimeHandled = true;

  saveCurrentDay();
  hideTimeEntryOverlay();

  // Continue to next decision (drafts follow main time)
  showNextDecision();
}

/**
 * Discard main time entry with EXPLICIT reason
 *
 * IMPORTANT: This is for legitimate scenarios only:
 * - "no_work_done": User did not work today
 * - "logged_elsewhere": Time was logged in another system
 *
 * This is NOT a default option - requires explicit user selection.
 *
 * @param {string} reason - "no_work_done" | "logged_elsewhere"
 */
function discardMainTimeEntry(reason) {
  // GUARD: Must have valid reason
  if (reason !== "no_work_done" && reason !== "logged_elsewhere") {
    console.error("discardMainTimeEntry: Invalid reason:", reason);
    return;
  }

  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft) return;

  // Mark draft as discarded
  draft.status = "discarded";

  // Store explicit discard with reason (for audit trail)
  dayLog.mainTimeDiscarded = true;
  dayLog.mainTimeDiscardReason = reason;

  // Set flag: main time handled (via explicit discard)
  dayLog.mainTimeHandled = true;

  saveCurrentDay();
  hideTimeEntryOverlay();

  // Continue to next decision (drafts follow main time)
  showNextDecision();
}

// ============================================================
// TIME ENTRY OVERLAY (comprehensive timesheet entry at end of day)
// ============================================================

var timeEntryOrdre = null;  // Currently editing ordre in time entry overlay

function openTimeEntryOverlay(ordre) {
  timeEntryOrdre = ordre;
  var draft = dayLog.drafts[ordre];
  if (!draft) return;

  // Persist UI state for refresh resilience
  uxState.activeOverlay = "time_entry";
  uxState.draftOrdre = ordre;
  saveUxState();

  // Ensure arrays exist
  if (!draft.lonnskoder) draft.lonnskoder = [];
  if (!draft.maskintimer) draft.maskintimer = [];

  // DOM rendering (vanilla JS mode only)
  if (!REACT_MODE) {
    renderTimeEntryContent();
    document.getElementById("timeEntryOverlay").classList.remove("hidden");
  }
}

function hideTimeEntryOverlay() {
  timeEntryOrdre = null;
  clearUxState();
  if (!REACT_MODE) {
    document.getElementById("timeEntryOverlay").classList.add("hidden");
  }
}

function renderTimeEntryContent() {
  var content = document.getElementById("timeEntryContent");
  if (!content || !timeEntryOrdre) return;

  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft) return;

  var html = '<h3>Timef\u00f8ring \u2013 Ordre ' + escapeHtml(draft.ordre) + '</h3>';

  // Ordre info (read-only)
  html += '<div class="timeentry-info">';
  html += '<div class="timeentry-row"><span class="timeentry-label">Dato:</span> ' + formatDate(draft.dato) + '</div>';
  if (draft.arbeidsbeskrivelse.length > 0) {
    html += '<div class="timeentry-row"><span class="timeentry-label">Beskrivelse:</span> ' + escapeHtml(draft.arbeidsbeskrivelse.join(". ")) + '</div>';
  }
  html += '</div>';

  // Lønnskoder section
  html += '<div class="timeentry-section">';
  html += '<h4>L\u00f8nnskoder</h4>';
  html += '<div id="timeEntryLonnskodeList"></div>';
  html += '<button class="btn btn-small btn-add-line" onclick="teAddLonnskode()">+ Legg til l\u00f8nnskode</button>';
  html += '</div>';

  // Maskintimer section (only show if machine-related entries detected)
  if (hasMachineRelatedEntries(draft)) {
    html += '<div class="timeentry-section timeentry-machine">';
    html += '<h4>Maskintimer</h4>';
    html += '<p class="timeentry-machine-hint">Det er registrert maskinbruk p\u00e5 denne ordren.</p>';
    html += '<div id="timeEntryMaskintimeList"></div>';
    html += '<button class="btn btn-small btn-add-line" onclick="teAddMaskintime()">+ Legg til maskintime</button>';
    html += '</div>';
  }

  // Action buttons
  html += '<div class="timeentry-actions">';
  html += '<button class="btn btn-primary btn-large" onclick="confirmTimeEntry()">Bekreft timeark</button>';
  html += '<button class="btn btn-secondary" onclick="cancelTimeEntry()">Avbryt</button>';
  html += '</div>';

  content.innerHTML = html;

  // Render lists
  renderTimeEntryLonnskodeList();
  renderTimeEntryMaskintimeList();
}

function hasMachineRelatedEntries(draft) {
  if (!draft || !draft.entryIndices || !dayLog || !dayLog.entries) return false;

  var machineWords = ["maskin", "hjullaster", "gravemaskin", "br\u00f8yter", "maskinkj\u00f8ring", "dumper", "traktor"];

  for (var i = 0; i < draft.entryIndices.length; i++) {
    var entry = dayLog.entries[draft.entryIndices[i]];
    if (!entry) continue;

    // Check for kjoring type
    if (entry.type === "kjoring") return true;

    // Check text for machine words
    var lower = entry.text.toLowerCase();
    for (var j = 0; j < machineWords.length; j++) {
      if (lower.indexOf(machineWords[j]) !== -1) return true;
    }
  }

  // Also check ressurser
  if (draft.ressurser) {
    for (var k = 0; k < draft.ressurser.length; k++) {
      var ress = draft.ressurser[k].toLowerCase();
      for (var m = 0; m < machineWords.length; m++) {
        if (ress.indexOf(machineWords[m]) !== -1) return true;
      }
    }
  }

  return false;
}

function renderTimeEntryLonnskodeList() {
  var container = document.getElementById("timeEntryLonnskodeList");
  if (!container || !timeEntryOrdre) return;

  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft || !draft.lonnskoder) {
    container.innerHTML = '<div class="lonnskode-empty">Ingen l\u00f8nnskoder lagt til</div>';
    return;
  }

  if (draft.lonnskoder.length === 0) {
    container.innerHTML = '<div class="lonnskode-empty">Ingen l\u00f8nnskoder lagt til</div>';
    return;
  }

  var lonnskodeOptions = ADMIN_CONFIG.lonnskoder;
  var html = '';
  for (var i = 0; i < draft.lonnskoder.length; i++) {
    var lk = draft.lonnskoder[i];
    html += '<div class="lonnskode-item-edit">';

    // Select for kode
    html += '<select class="te-lk-kode" data-index="' + i + '" onchange="teUpdateLonnskode(' + i + ')">';
    for (var j = 0; j < lonnskodeOptions.length; j++) {
      var opt = lonnskodeOptions[j];
      var selected = (lk.kode === opt.kode) ? ' selected' : '';
      html += '<option value="' + opt.kode + '"' + selected + '>' + escapeHtml(opt.kode) + '</option>';
    }
    html += '</select>';

    // Input for fra tid
    html += '<input type="time" class="te-lk-fra" data-index="' + i + '" value="' + escapeHtml(lk.fra || '') + '" onchange="teUpdateLonnskode(' + i + ')" />';

    // Input for til tid
    html += '<input type="time" class="te-lk-til" data-index="' + i + '" value="' + escapeHtml(lk.til || '') + '" onchange="teUpdateLonnskode(' + i + ')" />';

    // Remove button
    html += '<button class="btn btn-tiny btn-danger" onclick="teRemoveLonnskode(' + i + ')">Fjern</button>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function renderTimeEntryMaskintimeList() {
  var container = document.getElementById("timeEntryMaskintimeList");
  if (!container || !timeEntryOrdre) return;

  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft || !draft.maskintimer || draft.maskintimer.length === 0) {
    if (container) container.innerHTML = '<div class="maskintime-empty">Ingen maskintimer lagt til</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < draft.maskintimer.length; i++) {
    var mt = draft.maskintimer[i];
    html += '<div class="maskintime-item-edit">';

    // Input for maskin name
    html += '<input type="text" class="te-mt-maskin" data-index="' + i + '" value="' + escapeHtml(mt.maskin || '') + '" placeholder="Maskintype" onchange="teUpdateMaskintime(' + i + ')" />';

    // Input for timer
    html += '<input type="number" class="te-mt-timer" data-index="' + i + '" value="' + (mt.timer || '') + '" step="0.5" placeholder="Timer" onchange="teUpdateMaskintime(' + i + ')" />';

    // Remove button
    html += '<button class="btn btn-tiny btn-danger" onclick="teRemoveMaskintime(' + i + ')">Fjern</button>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function teAddLonnskode() {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft) return;

  if (!draft.lonnskoder) draft.lonnskoder = [];

  // Add empty line with default kode
  var defaultKode = ADMIN_CONFIG.lonnskoder.length > 0 ? ADMIN_CONFIG.lonnskoder[0].kode : "ORD";
  draft.lonnskoder.push({ kode: defaultKode, fra: "", til: "" });

  renderTimeEntryLonnskodeList();
}

function teRemoveLonnskode(index) {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft || !draft.lonnskoder) return;

  draft.lonnskoder.splice(index, 1);
  renderTimeEntryLonnskodeList();
}

function teUpdateLonnskode(index) {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft || !draft.lonnskoder || !draft.lonnskoder[index]) return;

  var kodeSelect = document.querySelector('.te-lk-kode[data-index="' + index + '"]');
  var fraInput = document.querySelector('.te-lk-fra[data-index="' + index + '"]');
  var tilInput = document.querySelector('.te-lk-til[data-index="' + index + '"]');

  if (kodeSelect) draft.lonnskoder[index].kode = kodeSelect.value;
  if (fraInput) draft.lonnskoder[index].fra = fraInput.value;
  if (tilInput) draft.lonnskoder[index].til = tilInput.value;
}

function teAddMaskintime() {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft) return;

  if (!draft.maskintimer) draft.maskintimer = [];

  // Add empty line
  draft.maskintimer.push({ maskin: "", timer: 0 });

  renderTimeEntryMaskintimeList();
}

function teRemoveMaskintime(index) {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft || !draft.maskintimer) return;

  draft.maskintimer.splice(index, 1);
  renderTimeEntryMaskintimeList();
}

function teUpdateMaskintime(index) {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft || !draft.maskintimer || !draft.maskintimer[index]) return;

  var maskinInput = document.querySelector('.te-mt-maskin[data-index="' + index + '"]');
  var timerInput = document.querySelector('.te-mt-timer[data-index="' + index + '"]');

  if (maskinInput) draft.maskintimer[index].maskin = maskinInput.value;
  if (timerInput) draft.maskintimer[index].timer = parseFloat(timerInput.value) || 0;
}

function confirmTimeEntry() {
  if (!timeEntryOrdre) return;
  var draft = dayLog.drafts[timeEntryOrdre];
  if (!draft) return;

  // Validate: must have at least one lønnskode
  if (!draft.lonnskoder || draft.lonnskoder.length === 0) {
    if (!REACT_MODE) alert("Du m\u00e5 legge til minst \u00e9n l\u00f8nnskode");
    return;
  }

  // KRITISK: Oppdater fra_tid/til_tid basert på faktiske lønnskoder
  updateDraftTimesFromLonnskoder(draft);

  saveCurrentDay();
  confirmDraftFromTimeEntry();
}

function cancelTimeEntry() {
  hideTimeEntryOverlay();
  showDraftDecisionOverlay();
}

// ============================================================
// LØNNSKODE FUNCTIONS
// ============================================================

function renderLonnskodeList() {
  var container = document.getElementById("lonnskodeList");
  if (!container || !editingDraftOrdre) return;

  var draft = dayLog.drafts[editingDraftOrdre];
  if (!draft || !draft.lonnskoder) {
    container.innerHTML = "";
    return;
  }

  if (draft.lonnskoder.length === 0) {
    container.innerHTML = '<div class="lonnskode-empty">Ingen l\u00f8nnskoder lagt til</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < draft.lonnskoder.length; i++) {
    var lk = draft.lonnskoder[i];
    html += '<div class="lonnskode-item">';
    html += '<span class="lonnskode-kode">' + escapeHtml(lk.kode) + '</span>';
    html += '<span class="lonnskode-tid">' + escapeHtml(lk.fra || "?") + ' \u2013 ' + escapeHtml(lk.til || "?") + '</span>';
    html += '<button class="btn btn-tiny btn-danger" onclick="removeLonnskode(' + i + ')">\u00d7</button>';
    html += '</div>';
  }
  container.innerHTML = html;
}

function addLonnskode() {
  if (REACT_MODE) return;
  if (!editingDraftOrdre) return;
  var draft = dayLog.drafts[editingDraftOrdre];
  if (!draft) return;

  var kode = document.getElementById("newLonnskodeKode").value;
  var fra = document.getElementById("newLonnskodeFra").value.trim();
  var til = document.getElementById("newLonnskodeTil").value.trim();

  if (!fra || !til) {
    alert("Fyll ut b\u00e5de fra- og til-tid");
    return;
  }

  if (!draft.lonnskoder) draft.lonnskoder = [];
  draft.lonnskoder.push({ kode: kode, fra: fra, til: til });

  clearNewLonnskodeInputs();
  renderLonnskodeList();
}

function removeLonnskode(index) {
  if (REACT_MODE) return;
  if (!editingDraftOrdre) return;
  var draft = dayLog.drafts[editingDraftOrdre];
  if (!draft || !draft.lonnskoder) return;

  draft.lonnskoder.splice(index, 1);
  renderLonnskodeList();
}

function clearNewLonnskodeInputs() {
  if (REACT_MODE) return;
  document.getElementById("newLonnskodeKode").value = "ORD";
  document.getElementById("newLonnskodeFra").value = "";
  document.getElementById("newLonnskodeTil").value = "";
}

function proceedToFinished() {
  dayLog.status = "FINISHED";
  dayLog.phase = "active";  // Reset phase
  appState = "FINISHED";
  clearUxState();  // Clear UI state when decisions complete
  saveCurrentDay();
  if (!REACT_MODE) {
    render();
  }
}

// ============================================================
// STRUCTURED ENTRY — VERIFY AT MOMENT OF INPUT
// parseEntry() = read-only extraction. No side effects.
// confirmStructuredEntry() = creates verified entry + confirmed draft.
// ============================================================

/**
 * parseEntry — Read-only extraction from text.
 * Returns orchestration result without saving anything.
 * UI uses this to show mini-review before confirm.
 */
function parseEntry(text) {
  if (!text || !text.trim()) return null;
  var orch = orchestrateEntry(text.trim());
  if (!hasOrchestrationData(orch)) return null;
  // Only offer structured review if we found an ordre
  if (!orch.ordre) return null;
  return {
    ordre: orch.ordre,
    fra: orch.tidsrom.fra,
    til: orch.tidsrom.til,
    ressurser: orch.ressurser,
    rawText: orch.rawText
  };
}

/**
 * confirmStructuredEntry — Creates a verified entry + confirmed draft.
 * Called from UI after user approves mini-review.
 * The entry is marked verified — it will NEVER appear in Håndrens.
 *
 * @param {string} text     — Original entry text
 * @param {string} type     — Entry type (usually "ordre")
 * @param {object} parsed   — Result from parseEntry()
 */
function confirmStructuredEntry(text, type, parsed) {
  if (appState !== "ACTIVE") return;
  if (dayLog && dayLog.phase === "ending") return;
  if (!parsed || !parsed.ordre) return;

  if (dayLog.phase === "pre" && !REACT_MODE) {
    // Vanilla JS: auto-advance to active when a structured entry is confirmed
    // REACT_MODE: phase stays "pre" — user must explicitly press "Gå til drift"
    dayLog.phase = "active";
  }

  // Auto-set start time if still pending
  if (dayLog.startTime === null) {
    dayLog.startTime = formatTime(new Date());
    dayLog.startTimeSource = "auto";
  }

  // 1. Create verified entry
  var entryIndex = dayLog.entries.length;
  dayLog.entries.push({
    time: formatTime(new Date()),
    type: type || "ordre",
    text: text,
    verified: true,
    lockedByUser: true
  });

  // 2. Create/update draft as CONFIRMED directly (no "draft" state)
  ensureDrafts();
  var draft = dayLog.drafts[parsed.ordre];
  if (!draft) {
    dayLog.drafts[parsed.ordre] = {
      ordre: parsed.ordre,
      dato: dayLog.date,
      fra_tid: parsed.fra || null,
      til_tid: parsed.til || null,
      arbeidsbeskrivelse: [text],
      ressurser: parsed.ressurser || [],
      lonnskoder: [],
      maskintimer: [],
      arbeidsvarsling: null,
      entryIndices: [entryIndex],
      status: "confirmed",
      confirmedAt: new Date().toISOString()
    };
    // Add lønnskode if time range present
    if (parsed.fra && parsed.til) {
      dayLog.drafts[parsed.ordre].lonnskoder.push({
        kode: "ORD",
        fra: parsed.fra,
        til: parsed.til
      });
    }
  } else {
    // Update existing draft
    if (parsed.til) draft.til_tid = parsed.til;
    if (parsed.fra && !draft.fra_tid) draft.fra_tid = parsed.fra;
    if (draft.arbeidsbeskrivelse.indexOf(text) === -1) {
      draft.arbeidsbeskrivelse.push(text);
    }
    if (draft.entryIndices.indexOf(entryIndex) === -1) {
      draft.entryIndices.push(entryIndex);
    }
    for (var i = 0; i < (parsed.ressurser || []).length; i++) {
      if (draft.ressurser.indexOf(parsed.ressurser[i]) === -1) {
        draft.ressurser.push(parsed.ressurser[i]);
      }
    }
    // Upgrade to confirmed if still draft
    if (draft.status === "draft") {
      draft.status = "confirmed";
      draft.confirmedAt = new Date().toISOString();
    }
  }

  // 3. Check for running schema triggers (same as submitEntry)
  var runningSchemaKey = detectRunningSchema(text);
  if (runningSchemaKey) {
    var newSchema = createSchemaInstance(runningSchemaKey, "running");
    if (newSchema) {
      if (newSchema.fields.beskrivelse !== undefined) {
        newSchema.fields.beskrivelse = text;
      }
      newSchema.linkedEntries.push(entryIndex);
      dayLog.schemas.push(newSchema);
    }
  }

  saveCurrentDay();
}

// ============================================================
// HÅNDRENS — FLAT VERIFICATION (React mode)
// Replaces decision tunnel. No sequence, no modals, no index.
// Returns flat list of items needing resolution.
// resolveItem() is the single entry point for all actions.
// ============================================================

var SCHEMA_TYPE_LABELS = {
  ruh: "RUH",
  vaktlogg: "Vaktlogg",
  hendelse: "Hendelse",
  kjoretoyssjekk: "Kjøretøysjekk",
  skademelding: "Skademelding",
  friksjonsmaling: "Friksjonsmåling",
  uonsket_hendelse: "Uønsket hendelse"
};

function getUnresolvedItems() {
  if (!dayLog) return [];
  var items = [];

  // 1. Schemas pending decision (non-friksjon, non-pre_day)
  if (dayLog.schemas) {
    for (var i = 0; i < dayLog.schemas.length; i++) {
      var s = dayLog.schemas[i];
      if (s.origin === "pre_day") continue; // Pre-day schemas are recommended, never blocking
      if (s.type === "friksjonsmaling") continue;
      if (s.status === "draft" || s.status === "deferred" || s.status === "force_skipped") {
        items.push({
          id: "schema_" + s.id,
          kind: "schema",
          label: SCHEMA_TYPE_LABELS[s.type] || s.type,
          data: { schemaId: s.id, type: s.type, fields: s.fields, linkedEntries: s.linkedEntries || [] }
        });
      }
    }
  }

  // 2. Friksjon schemas
  if (dayLog.schemas) {
    for (var i = 0; i < dayLog.schemas.length; i++) {
      var s = dayLog.schemas[i];
      if (s.type === "friksjonsmaling" && s.status === "draft") {
        items.push({
          id: "friksjon_" + s.id,
          kind: "friksjon",
          label: "Friksjonsmåling",
          data: { schemaId: s.id, fields: s.fields }
        });
      }
    }
  }

  // 3. Main time (if not handled)
  if (!dayLog.mainTimeHandled) {
    var mainDraft = dayLog.drafts ? dayLog.drafts[ADMIN_CONFIG.hovedordre] : null;
    if (mainDraft && mainDraft.status === "draft") {
      items.push({
        id: "main_time",
        kind: "main_time",
        label: "Hovedtimeføring",
        data: {
          ordre: mainDraft.ordre,
          startTime: dayLog.startTime,
          endTime: dayLog.endTime,
          lonnskoder: mainDraft.lonnskoder || []
        }
      });
    }
  }

  // 4. Non-main drafts with status "draft"
  if (dayLog.drafts) {
    var keys = Object.keys(dayLog.drafts);
    for (var i = 0; i < keys.length; i++) {
      var d = dayLog.drafts[keys[i]];
      if (d.ordre === ADMIN_CONFIG.hovedordre) continue;
      if (d.status === "draft") {
        items.push({
          id: "draft_" + d.ordre,
          kind: "draft",
          label: "Timeark – " + d.ordre,
          data: { ordre: d.ordre, beskrivelse: d.arbeidsbeskrivelse.join(". ") }
        });
      }
    }
  }

  return items;
}

function getUnresolvedCount() {
  return getUnresolvedItems().length;
}

/**
 * resolveItem — Unified handler for Håndrens actions.
 * Called from React with (id, action, data).
 *
 * @param {string} id     — Item id from getUnresolvedItems()
 * @param {string} action — "confirm" | "discard"
 * @param {object} data   — Optional extra data (e.g., { reason } for main_time discard)
 */
function resolveItem(id, action, data) {
  if (!dayLog) return;

  if (id === "main_time") {
    resolveMainTime(action, data);
  } else if (id.indexOf("schema_") === 0) {
    var schemaId = id.substring(7);
    resolveSchemaItem(schemaId, action);
  } else if (id.indexOf("friksjon_") === 0) {
    var fSchemaId = id.substring(9);
    resolveFriksjonItem(fSchemaId, action);
  } else if (id.indexOf("draft_") === 0) {
    var ordre = id.substring(6);
    resolveDraftItem(ordre, action);
  }

  // Recalculate readyToLock after every resolution
  readyToLock = (getUnresolvedCount() === 0);
  saveCurrentDay();
}

function resolveSchemaItem(schemaId, action) {
  var schema = findSchemaById(schemaId);
  if (!schema) return;

  if (action === "confirm") {
    // RUH: arsak and tiltak must be filled before confirmation.
    // Motor is last defense — UI should also validate, but motor never allows empty RUH.
    if (schema.type === "ruh") {
      var ruhMissing = [];
      if (!schema.fields.arsak || schema.fields.arsak === "") ruhMissing.push("årsak");
      if (!schema.fields.tiltak || schema.fields.tiltak === "") ruhMissing.push("tiltak");
      if (ruhMissing.length > 0) {
        schemaError = "RUH krever " + ruhMissing.join(" og ");
        if (schemaErrorTimer) clearTimeout(schemaErrorTimer);
        schemaErrorTimer = setTimeout(function() {
          schemaError = null;
          schemaErrorTimer = null;
          emitStateChange("schemaError");
        }, 4000);
        emitStateChange("schemaError");
        return;
      }
    }
    schema.status = "confirmed";
    schema.confirmedAt = new Date().toISOString();
    // Propagate entry flags for linked entries
    if (schema.linkedEntries && schema.linkedEntries.length > 0) {
      for (var i = 0; i < schema.linkedEntries.length; i++) {
        var entry = dayLog.entries[schema.linkedEntries[i]];
        if (!entry) continue;
        if (schema.type === "vaktlogg") entry.vaktloggConfirmed = true;
        if (schema.type === "ruh") entry.ruhDecision = "yes";
      }
    }
  } else if (action === "discard") {
    schema.status = "discarded";
    if (schema.linkedEntries && schema.linkedEntries.length > 0) {
      for (var i = 0; i < schema.linkedEntries.length; i++) {
        var entry = dayLog.entries[schema.linkedEntries[i]];
        if (!entry) continue;
        if (schema.type === "vaktlogg") entry.vaktloggDiscarded = true;
        if (schema.type === "ruh") entry.ruhDecision = "no";
      }
    }
  }
}

function resolveFriksjonItem(schemaId, action) {
  var schema = findSchemaById(schemaId);
  if (!schema) return;

  if (action === "confirm") {
    schema.status = "confirmed";
    schema.confirmedAt = new Date().toISOString();
  } else if (action === "discard") {
    schema.status = "discarded";
  }
}

function resolveMainTime(action, data) {
  var draft = dayLog.drafts ? dayLog.drafts[ADMIN_CONFIG.hovedordre] : null;
  if (!draft) return;

  if (action === "confirm") {
    if (!draft.lonnskoder || draft.lonnskoder.length === 0) {
      console.warn("resolveItem main_time: no lønnskoder — cannot confirm");
      return;
    }
    updateDraftTimesFromLonnskoder(draft);
    draft.status = "confirmed";
    draft.confirmedAt = new Date().toISOString();
    dayLog.mainTimeHandled = true;
  } else if (action === "discard") {
    var reason = data && data.reason;
    if (reason !== "no_work_done" && reason !== "logged_elsewhere") {
      console.error("resolveItem main_time discard: invalid reason", reason);
      return;
    }
    draft.status = "discarded";
    dayLog.mainTimeDiscarded = true;
    dayLog.mainTimeDiscardReason = reason;
    dayLog.mainTimeHandled = true;
  }
}

function resolveDraftItem(ordre, action) {
  var draft = dayLog.drafts ? dayLog.drafts[ordre] : null;
  if (!draft) return;

  if (action === "confirm") {
    draft.status = "confirmed";
    draft.confirmedAt = new Date().toISOString();
  } else if (action === "discard") {
    draft.status = "discarded";
  }
}

// ============================================================
// EXPORT — EDGE OUTBOX + JSON FORWARD
// Immutable packets generated at lockDay(), queued locally,
// sent via fetch to customer endpoint. Fire-and-forget.
// Does NOT affect motor determinism — outbox is a side-channel.
// ============================================================

var STORAGE_KEY_OUTBOX = "punchout_outbox";
var STORAGE_KEY_DEVICE_ID = "punchout_device_id";
var syncIntervalId = null;

function getOrCreateDeviceId() {
  try {
    var id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (id) return id;
    id = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : "dev_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(STORAGE_KEY_DEVICE_ID, id);
    return id;
  } catch (e) {
    return "dev_" + Date.now();
  }
}

// Pure function — no side effects, no localStorage writes
function buildExportPacket(log) {
  if (!ADMIN_CONFIG.userId) {
    console.warn("Missing userId — export aborted");
    return null;
  }
  var exportId = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "exp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

  // Sanitize entries: only time, type, text
  var entries = (log.entries || []).map(function (e) {
    return { time: e.time, type: e.type, text: e.text };
  });

  // Only confirmed/discarded schemas, strip internal fields
  var schemas = (log.schemas || []).filter(function (s) {
    return s.status === "confirmed" || s.status === "discarded";
  }).map(function (s) {
    return {
      id: s.id,
      type: s.type,
      status: s.status,
      fields: s.fields,
      createdAt: s.createdAt,
      confirmedAt: s.confirmedAt || null
    };
  });

  // Time entries from confirmed drafts
  var timeEntries = [];
  var machineHours = [];
  if (log.drafts) {
    var ordreKeys = Object.keys(log.drafts);
    for (var i = 0; i < ordreKeys.length; i++) {
      var d = log.drafts[ordreKeys[i]];
      if (d.status === "confirmed") {
        timeEntries.push({
          ordre: d.ordre,
          dato: d.dato,
          fra_tid: d.fra_tid || null,
          til_tid: d.til_tid || null,
          arbeidsbeskrivelse: d.arbeidsbeskrivelse || [],
          lonnskoder: d.lonnskoder || [],
          maskintimer: d.maskintimer || []
        });
        // Aggregate machine hours flat
        if (d.maskintimer) {
          for (var j = 0; j < d.maskintimer.length; j++) {
            machineHours.push({
              ordre: d.ordre,
              maskintype: d.maskintimer[j].maskintype,
              timer: d.maskintimer[j].timer
            });
          }
        }
      }
    }
  }

  return {
    exportVersion: "1.0",
    exportId: exportId,
    deviceId: getOrCreateDeviceId(),
    userId: ADMIN_CONFIG.userId,
    dayId: log.date,
    createdAt: new Date().toISOString(),
    payload: {
      startTime: log.startTime,
      endTime: log.endTime,
      entries: entries,
      schemas: schemas,
      timeEntries: timeEntries,
      machineHours: machineHours
    }
  };
}

// --- Outbox persistence ---

function loadOutbox() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY_OUTBOX);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load outbox:", e);
    return [];
  }
}

function saveOutbox(outbox) {
  try {
    localStorage.setItem(STORAGE_KEY_OUTBOX, JSON.stringify(outbox));
  } catch (e) {
    console.error("Failed to save outbox:", e);
  }
}

function enqueueExport(packet) {
  if (!packet) return;
  if (!ADMIN_CONFIG.exportEndpoint) {
    console.warn("Export disabled — no endpoint configured");
    return;
  }
  var outbox = loadOutbox();
  if (outbox.length > 30) {
    console.warn("Outbox backlog growing: " + outbox.length + " entries");
  }
  // Dedup: reject if exportId already exists
  for (var i = 0; i < outbox.length; i++) {
    if (outbox[i].exportId === packet.exportId) return;
  }
  outbox.push({
    exportId: packet.exportId,
    status: "pending",
    retries: 0,
    lastAttempt: null,
    sendingSince: null,
    nextAttempt: null,
    error: null,
    packet: packet
  });
  saveOutbox(outbox);
  emitStateChange("outboxStatus");
}

function getOutboxStatus() {
  var outbox = loadOutbox();
  var pending = 0, sent = 0, failed = 0;
  for (var i = 0; i < outbox.length; i++) {
    var s = outbox[i].status;
    if (s === "pending" || s === "sending") pending++;
    else if (s === "sent") sent++;
    else if (s === "failed") failed++;
  }
  return { pending: pending, sent: sent, failed: failed };
}

/**
 * getExportStatus — Per-day export status.
 * Looks up the specific exportId stored in dayLog to determine
 * whether THIS day's export has been sent, is pending, or failed.
 * Never conflates with other days' export status.
 */
function getExportStatus() {
  if (!ADMIN_CONFIG.exportEndpoint) return "disabled";
  if (!dayLog || !dayLog.exportId) return "no_data";
  var outbox = loadOutbox();
  for (var i = 0; i < outbox.length; i++) {
    if (outbox[i].exportId === dayLog.exportId) {
      var s = outbox[i].status;
      if (s === "sent") return "sent";
      if (s === "failed") return "failed";
      if (s === "pending" || s === "sending") return "sending";
    }
  }
  // exportId exists but not found in outbox — already pruned after send
  return "sent";
}

// --- Stuck/cleanup ---

function resetStuckExports() {
  var outbox = loadOutbox();
  var now = Date.now();
  var changed = false;
  for (var i = 0; i < outbox.length; i++) {
    if (outbox[i].status === "sending") {
      var since = outbox[i].sendingSince ? new Date(outbox[i].sendingSince).getTime() : 0;
      if (now - since > 120000) { // 2 minutes stuck = reset
        outbox[i].status = "pending";
        outbox[i].sendingSince = null;
        changed = true;
      }
    }
  }
  if (changed) saveOutbox(outbox);
}

function cleanOldSentExports() {
  var outbox = loadOutbox();
  var cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
  var filtered = outbox.filter(function (item) {
    if (item.status !== "sent") return true;
    var sentTime = item.lastAttempt ? new Date(item.lastAttempt).getTime() : 0;
    return sentTime > cutoff;
  });
  if (filtered.length !== outbox.length) saveOutbox(filtered);
}

// --- HMAC signature (optional) ---

function computeHmacSignature(secret, body) {
  var encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  ).then(function (key) {
    return crypto.subtle.sign("HMAC", key, encoder.encode(body));
  }).then(function (sig) {
    return Array.from(new Uint8Array(sig)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }).catch(function (e) {
    console.error("HMAC computation failed:", e);
    return null;
  });
}

// --- Sync engine ---

function syncExports() {
  var endpoint = ADMIN_CONFIG.exportEndpoint;
  if (!endpoint) return;

  var outbox = loadOutbox();
  var now = new Date();
  var nowMs = now.getTime();

  // Find oldest eligible entry
  var target = null;
  for (var i = 0; i < outbox.length; i++) {
    var item = outbox[i];
    if (item.status === "pending") {
      target = item;
      break;
    }
    if (item.status === "failed" && item.retries < 10) {
      var nextAttempt = item.nextAttempt ? new Date(item.nextAttempt).getTime() : 0;
      if (nowMs >= nextAttempt) {
        target = item;
        break;
      }
    }
  }
  if (!target) return;

  // Mark as sending
  target.status = "sending";
  target.sendingSince = now.toISOString();
  target.lastAttempt = now.toISOString();
  saveOutbox(outbox);
  emitStateChange("outboxStatus");

  var body = JSON.stringify(target.packet);
  var targetExportId = target.exportId;
  var headers = {
    "Content-Type": "application/json",
    "X-Punchout-Version": target.packet.exportVersion || "1.0",
    "X-Punchout-Device": target.packet.deviceId || ""
  };

  var doFetch = function (hdrs) {
    fetch(endpoint, {
      method: "POST",
      headers: hdrs,
      body: body
    }).then(function (response) {
      // Re-read outbox (may have changed during async fetch)
      var ob = loadOutbox();
      var entry = null;
      for (var j = 0; j < ob.length; j++) {
        if (ob[j].exportId === targetExportId) { entry = ob[j]; break; }
      }
      if (!entry) return;

      if (response.ok || response.status === 409) {
        // Success or duplicate — mark sent
        entry.status = "sent";
        entry.sendingSince = null;
        entry.error = null;
      } else if (response.status >= 400 && response.status < 500) {
        // Client error (not 409) — do not retry
        entry.status = "failed";
        entry.sendingSince = null;
        entry.retries = 10; // Exhausted
        entry.error = response.status + " " + response.statusText;
      } else {
        // 5xx — retry with exponential backoff
        entry.status = "failed";
        entry.sendingSince = null;
        entry.retries++;
        entry.error = response.status + " " + response.statusText;
        var delay = Math.min(Math.pow(2, entry.retries) * 30000, 3600000);
        entry.nextAttempt = new Date(Date.now() + delay).toISOString();
      }
      saveOutbox(ob);
      emitStateChange("outboxStatus");
    }).catch(function (err) {
      // Network error — retry with backoff
      var ob = loadOutbox();
      var entry = null;
      for (var j = 0; j < ob.length; j++) {
        if (ob[j].exportId === targetExportId) { entry = ob[j]; break; }
      }
      if (!entry) return;
      entry.status = "failed";
      entry.sendingSince = null;
      entry.retries++;
      entry.error = err.message || "Network error";
      var delay = Math.min(Math.pow(2, entry.retries) * 30000, 3600000);
      entry.nextAttempt = new Date(Date.now() + delay).toISOString();
      saveOutbox(ob);
      emitStateChange("outboxStatus");
    });
  };

  // If HMAC secret configured, compute signature then send
  if (ADMIN_CONFIG.exportHmacSecret) {
    computeHmacSignature(ADMIN_CONFIG.exportHmacSecret, body).then(function (sig) {
      if (sig) headers["X-Punchout-Signature"] = sig;
      doFetch(headers);
    });
  } else {
    doFetch(headers);
  }
}

// --- Export init (called from init()) ---

function initExportSync() {
  resetStuckExports();
  cleanOldSentExports();
  syncExports();
  syncIntervalId = setInterval(syncExports, 60000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      syncExports();
    }
  });
}

// ============================================================
// DAGSRAPPORT — HUMAN-READABLE REPORT (READ-ONLY)
// Pure function. No side effects. No persistence. No state.
// Generates plain text from dayLog on demand.
// ============================================================

function buildHumanReadableReport(log) {
  if (!log) return "";
  var SEP = "----------------------------------------";
  var lines = [];

  lines.push("PUNCHOUT DAGSRAPPORT");
  lines.push("====================");
  lines.push("");
  lines.push("Dato:   " + (log.date || "?"));
  lines.push("Ansatt: " + (ADMIN_CONFIG.userId || "Ikke satt"));
  lines.push("Enhet:  " + getOrCreateDeviceId());
  lines.push("");

  // Start / Slutt
  lines.push("START / SLUTT");
  lines.push("Start: " + (log.startTime || "?"));
  lines.push("Slutt: " + (log.endTime || "?"));
  lines.push("");

  // Entries
  lines.push(SEP);
  lines.push("REGISTRERINGER");
  lines.push(SEP);
  lines.push("");

  var entries = log.entries || [];
  if (entries.length === 0) {
    lines.push("(ingen registreringer)");
    lines.push("");
  } else {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var typeLabel = (e.type || "notat").toUpperCase();
      lines.push((e.time || "??:??") + "  " + typeLabel);
      lines.push(e.text || "(tom)");

      // Entry flags
      if (e.ruhDecision === "yes") lines.push("RUH: Bekreftet");
      if (e.ruhDecision === "no") lines.push("RUH: Avslått");
      if (e.vaktloggConfirmed) lines.push("Vaktlogg: Bekreftet");
      if (e.vaktloggDiscarded) lines.push("Vaktlogg: Forkastet");
      if (e.converted) lines.push("Konvertert til skjema");
      if (e.keptAsNote) lines.push("Beholdt som notat");

      lines.push("");
    }
  }

  // Schemas
  var schemas = (log.schemas || []).filter(function (s) {
    return s.status === "confirmed" || s.status === "discarded";
  });
  if (schemas.length > 0) {
    lines.push(SEP);
    lines.push("SKJEMA");
    lines.push(SEP);
    lines.push("");

    var schemaLabels = {
      ruh: "RUH (Rapport Uønsket Hendelse)",
      vaktlogg: "Vaktlogg-bekreftelse",
      hendelse: "Hendelse",
      friksjonsmaling: "Friksjonsmåling",
      sja_preday: "SJA (før jobb)",
      kjoretoyssjekk: "Kjøretøysjekk"
    };

    for (var j = 0; j < schemas.length; j++) {
      var s = schemas[j];
      lines.push(schemaLabels[s.type] || s.type);
      lines.push("Status: " + (s.status === "confirmed" ? "Bekreftet" : "Forkastet"));

      // Fields
      if (s.fields) {
        var fieldKeys = Object.keys(s.fields);
        for (var k = 0; k < fieldKeys.length; k++) {
          var val = s.fields[fieldKeys[k]];
          if (val !== null && val !== undefined && val !== "") {
            lines.push(fieldKeys[k] + ": " + val);
          }
        }
      }
      lines.push("");
    }
  }

  // Time entries / drafts
  var drafts = log.drafts || {};
  var ordreKeys = Object.keys(drafts);
  var confirmedDrafts = [];
  for (var d = 0; d < ordreKeys.length; d++) {
    if (drafts[ordreKeys[d]].status === "confirmed") {
      confirmedDrafts.push(drafts[ordreKeys[d]]);
    }
  }

  if (confirmedDrafts.length > 0) {
    lines.push(SEP);
    lines.push("TIMER");
    lines.push(SEP);
    lines.push("");

    for (var t = 0; t < confirmedDrafts.length; t++) {
      var draft = confirmedDrafts[t];
      lines.push(draft.ordre || "?");
      lines.push((draft.fra_tid || "?") + " – " + (draft.til_tid || "?"));

      if (draft.lonnskoder && draft.lonnskoder.length > 0) {
        lines.push("");
        lines.push("Lønnskoder:");
        for (var l = 0; l < draft.lonnskoder.length; l++) {
          var lk = draft.lonnskoder[l];
          lines.push("  " + lk.kode + " " + (lk.fra || "?") + " – " + (lk.til || "?"));
        }
      }

      if (draft.maskintimer && draft.maskintimer.length > 0) {
        lines.push("");
        lines.push("Maskintimer:");
        for (var m = 0; m < draft.maskintimer.length; m++) {
          var mt = draft.maskintimer[m];
          lines.push("  " + mt.maskintype + ": " + mt.timer + " t");
        }
      }

      lines.push("");
    }
  }

  // Footer
  lines.push(SEP);
  lines.push("GENERERT: " + new Date().toISOString());

  // Include export ID if an outbox entry exists for this day
  var outbox = loadOutbox();
  for (var o = 0; o < outbox.length; o++) {
    if (outbox[o].packet && outbox[o].packet.dayId === log.date) {
      lines.push("EXPORT-ID: " + outbox[o].exportId);
      break;
    }
  }

  return lines.join("\n");
}

// ============================================================
// EXTERNAL SYSTEMS (DELEGATED)
// IMPORTANT: Punchout ONLY opens external systems, NEVER writes to them
// FORBIDDEN: Auto-resume dialog after window.open
// FORBIDDEN: Focus listeners, visibility API, polling
// ============================================================

var EXTERNAL_SYSTEMS = {
  elrapp: {
    baseUrl: "https://elrapp.example.com",
    openMode: "newtab",
    instructions: "Finn riktig ordre i oversiktslisten"
  },
  linx: {
    baseUrl: "https://linx.example.com",
    openMode: "newtab",
    instructions: "Logg inn og registrer kjøretøy"
  }
};

function openExternalSystem(system, params) {
  var config = EXTERNAL_SYSTEMS[system];
  if (!config) {
    console.warn("Unknown external system:", system);
    return;
  }

  var url = config.baseUrl;
  if (params && params.ordre) {
    url += "?ordre=" + encodeURIComponent(params.ordre);
  }

  // Log that we opened (NOT that action was completed)
  if (!dayLog.externalTasks) dayLog.externalTasks = [];
  dayLog.externalTasks.push({
    system: system,
    params: params || {},
    openedAt: new Date().toISOString(),
    confirmedByUser: false
  });
  saveCurrentDay();

  // Open external system
  window.open(url, "_blank");

  // Show instruction overlay (user must explicitly confirm when done)
  uxState.activeOverlay = "external_instruction";
  uxState.externalSystem = system;
  uxState.externalInstructions = config.instructions;
  saveUxState();
}

function confirmExternalTask(system) {
  if (!dayLog.externalTasks) return;

  // Find the most recent unconfirmed task for this system
  for (var i = dayLog.externalTasks.length - 1; i >= 0; i--) {
    var task = dayLog.externalTasks[i];
    if (task.system === system && !task.confirmedByUser) {
      task.confirmedByUser = true;
      task.confirmedAt = new Date().toISOString();
      break;
    }
  }

  saveCurrentDay();
  clearUxState();
  if (!REACT_MODE) {
    render();
  }
}

function closeExternalInstructionOverlay() {
  // User can close without confirming (task remains unconfirmed)
  clearUxState();
  if (!REACT_MODE) {
    render();
  }
}

// ============================================================
// MOCK SCHEMA DEFINITIONS + VOICE-TO-SCHEMA MAPPING
// ============================================================

var SCHEMAS = {
  timesheet: {
    id: "timesheet_entry_v0",
    label: "Timel\u00f8nn",
    fields: {
      dato: { label: "Dato", type: "date", required: true },
      start_tid: { label: "Starttid", type: "time", required: true },
      slutt_tid: { label: "Sluttid", type: "time", required: true },
      pause_minutter: { label: "Pause (min)", type: "number", required: false },
      arbeidstype: { label: "Arbeidstype", type: "enum", required: true, options: ["ordin\u00e6rt", "overtid"] },
      kommentar: { label: "Kommentar", type: "string", required: false }
    }
  },
  sja: {
    id: "sja_v0",
    label: "SJA",
    fields: {
      oppgave: { label: "Oppgave", type: "string", required: true },
      risiko: { label: "Risiko", type: "string", required: true },
      konsekvens: { label: "Konsekvens", type: "string", required: true },
      tiltak: { label: "Tiltak", type: "string", required: true },
      arbeidsvarsling: { label: "Arbeidsvarsling", type: "enum", required: true, options: ["ingen", "enkel", "manuell", "full"] },
      godkjent: { label: "Godkjent", type: "boolean", required: true }
    }
  },
  additional_work: {
    id: "additional_work_timesheet_v0",
    label: "Tilleggsarbeid",
    fields: {
      oppdragsnummer: { label: "Oppdragsnr", type: "string", required: true },
      dato: { label: "Dato", type: "date", required: true },
      fra_tid: { label: "Fra tid", type: "time", required: true },
      til_tid: { label: "Til tid", type: "time", required: true },
      arbeidsbeskrivelse: { label: "Arbeidsbeskrivelse", type: "string", required: true },
      ressurser: { label: "Ressurser", type: "array", required: false },
      arbeidsvarsling: { label: "Arbeidsvarsling", type: "enum", required: true, options: ["ingen", "enkel", "manuell", "full"] }
    }
  }
};

var selectedSchema = "timesheet";

// --- Text extraction helpers (deterministic, keyword/regex only) ---

function extractTimePattern(text) {
  // Match "08:30", "08.30", "0830", "8:30"
  var m = text.match(/\b(\d{1,2})[:\.](\d{2})\b/);
  if (m) return padTwo(m[1]) + ":" + m[2];
  // Match "0830" as time
  var m2 = text.match(/\b(\d{2})(\d{2})\b/);
  if (m2 && parseInt(m2[1]) < 24 && parseInt(m2[2]) < 60) return m2[1] + ":" + m2[2];
  return null;
}

function extractAllTimes(text) {
  var times = [];
  var re = /\b(\d{1,2})[:\.](\d{2})\b/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    times.push(padTwo(m[1]) + ":" + m[2]);
  }
  return times;
}

function padTwo(s) {
  return s.length === 1 ? "0" + s : s;
}

function extractOppdragsnummer(text) {
  // Match patterns like "1234-5", "12345-67", "oppdrag 1234-5"
  var m = text.match(/\b(\d{4,}-\d+)\b/);
  return m ? m[1] : null;
}

function extractArbeidsvarsling(text) {
  var lower = text.toLowerCase();
  if (lower.indexOf("full varsling") !== -1 || lower.indexOf("full arbeidsvarsling") !== -1) return "full";
  if (lower.indexOf("manuell varsling") !== -1 || lower.indexOf("manuell arbeidsvarsling") !== -1) return "manuell";
  if (lower.indexOf("enkel varsling") !== -1 || lower.indexOf("enkel arbeidsvarsling") !== -1) return "enkel";
  if (lower.indexOf("ingen varsling") !== -1 || lower.indexOf("ingen arbeidsvarsling") !== -1) return "ingen";
  // Single word fallback
  if (lower.indexOf("full") !== -1) return "full";
  if (lower.indexOf("manuell") !== -1) return "manuell";
  if (lower.indexOf("enkel") !== -1) return "enkel";
  return null;
}

function extractRessurser(text) {
  var lower = text.toLowerCase();
  var known = ["lagsbil", "br\u00f8ytebil", "hjullaster", "gravemaskin", "lastebil",
    "str\u00f8bil", "feiemaskin", "kompressor", "aggregat", "trailer",
    "pickup", "varebil", "mannskap"];
  var found = [];
  for (var i = 0; i < known.length; i++) {
    if (lower.indexOf(known[i]) !== -1) found.push(known[i]);
  }
  return found.length > 0 ? found : null;
}

function extractRisiko(text) {
  var lower = text.toLowerCase();
  var keywords = ["glatt", "h\u00f8yde", "trafikk", "str\u00f8m", "graving", "fall",
    "tung", "klem", "varmt", "kaldt", "m\u00f8rkt", "d\u00e5rlig sikt"];
  for (var i = 0; i < keywords.length; i++) {
    if (lower.indexOf(keywords[i]) !== -1) return keywords[i];
  }
  return null;
}

function extractOvertid(allText) {
  var lower = allText.toLowerCase();
  if (lower.indexOf("overtid") !== -1) return "overtid";
  return "ordin\u00e6rt";
}

// --- Schema mapping: dayLog -> filled schema ---

function mapDayToSchema(log, schemaKey) {
  var schema = SCHEMAS[schemaKey];
  if (!schema || !log) return null;

  var allText = "";
  for (var i = 0; i < log.entries.length; i++) {
    allText += " " + log.entries[i].text;
  }
  allText = allText.trim();

  var result = {};
  var missing = [];

  if (schemaKey === "timesheet") {
    result.dato = log.date || null;
    result.start_tid = log.startTime || null;
    result.slutt_tid = log.endTime || null;
    // Sum pause minutes from pause entries
    var pauseMin = 0;
    var pauseCount = 0;
    for (var i = 0; i < log.entries.length; i++) {
      if (log.entries[i].type === "pause") {
        pauseCount++;
        // Try to extract minutes from text like "30 min", "en halvtime"
        var minMatch = log.entries[i].text.match(/(\d+)\s*min/i);
        if (minMatch) {
          pauseMin += parseInt(minMatch[1]);
        } else if (log.entries[i].text.toLowerCase().indexOf("halvtime") !== -1) {
          pauseMin += 30;
        } else if (log.entries[i].text.toLowerCase().indexOf("time") !== -1) {
          pauseMin += 60;
        }
      }
    }
    result.pause_minutter = pauseMin > 0 ? pauseMin : (pauseCount > 0 ? null : 0);
    result.arbeidstype = extractOvertid(allText);
    // Kommentar: concat all notat entries
    var comments = [];
    for (var i = 0; i < log.entries.length; i++) {
      if (log.entries[i].type === "notat") comments.push(log.entries[i].text);
    }
    result.kommentar = comments.length > 0 ? comments.join(". ") : null;

    if (!result.dato) missing.push("dato");
    if (!result.start_tid) missing.push("start_tid");
    if (!result.slutt_tid) missing.push("slutt_tid");
    if (result.pause_minutter === null) missing.push("pause_minutter (pauser funnet men varighet ukjent)");
  }

  if (schemaKey === "sja") {
    // Oppgave: first notat entry
    var firstNotat = null;
    for (var i = 0; i < log.entries.length; i++) {
      if (log.entries[i].type === "notat") { firstNotat = log.entries[i].text; break; }
    }
    result.oppgave = firstNotat;
    result.risiko = extractRisiko(allText);
    result.konsekvens = null; // Cannot reliably extract
    result.tiltak = null;     // Cannot reliably extract
    result.arbeidsvarsling = extractArbeidsvarsling(allText);
    result.godkjent = false;

    if (!result.oppgave) missing.push("oppgave");
    if (!result.risiko) missing.push("risiko");
    missing.push("konsekvens (krever manuell vurdering)");
    missing.push("tiltak (krever manuell vurdering)");
    if (!result.arbeidsvarsling) missing.push("arbeidsvarsling");
    missing.push("godkjent (m\u00e5 signeres manuelt)");
  }

  if (schemaKey === "additional_work") {
    result.oppdragsnummer = extractOppdragsnummer(allText);
    result.dato = log.date || null;
    result.fra_tid = log.startTime || null;
    result.til_tid = log.endTime || null;
    // Arbeidsbeskrivelse: concat all notat entries
    var desc = [];
    for (var i = 0; i < log.entries.length; i++) {
      if (log.entries[i].type === "notat") desc.push(log.entries[i].text);
    }
    result.arbeidsbeskrivelse = desc.length > 0 ? desc.join(". ") : null;
    result.ressurser = extractRessurser(allText);
    result.arbeidsvarsling = extractArbeidsvarsling(allText);

    if (!result.oppdragsnummer) missing.push("oppdragsnummer");
    if (!result.dato) missing.push("dato");
    if (!result.fra_tid) missing.push("fra_tid");
    if (!result.til_tid) missing.push("til_tid");
    if (!result.arbeidsbeskrivelse) missing.push("arbeidsbeskrivelse");
    if (!result.arbeidsvarsling) missing.push("arbeidsvarsling");
  }

  return { schema: schema.id, label: schema.label, data: result, missing: missing };
}

// --- Schema rendering ---

function renderSchemaPreview(containerId, log) {
  var container = document.getElementById(containerId);
  if (!container || !log) return;

  var mapped = mapDayToSchema(log, selectedSchema);
  if (!mapped) { container.innerHTML = ""; return; }

  var schema = SCHEMAS[selectedSchema];
  var fields = schema.fields;
  var data = mapped.data;

  var html = '<div class="schema-block">';
  html += '<div class="schema-header">' + escapeHtml(mapped.label) + ' <span class="schema-id">(' + mapped.schema + ')</span></div>';

  var fieldKeys = Object.keys(fields);
  for (var i = 0; i < fieldKeys.length; i++) {
    var key = fieldKeys[i];
    var def = fields[key];
    var val = data[key];
    var isMissing = val === null || val === undefined;
    var isEmptyArray = Array.isArray(val) && val.length === 0;

    var displayVal;
    if (isMissing) {
      displayVal = '<span class="schema-missing">Manuelt gjenst\u00e5r</span>';
    } else if (isEmptyArray) {
      displayVal = '<span class="schema-missing">Ingen funnet</span>';
    } else if (Array.isArray(val)) {
      displayVal = '<span class="schema-value">' + escapeHtml(val.join(", ")) + '</span>';
    } else if (typeof val === "boolean") {
      displayVal = '<span class="schema-value">' + (val ? "Ja" : "Nei") + '</span>';
    } else {
      displayVal = '<span class="schema-value">' + escapeHtml(String(val)) + '</span>';
    }

    var reqMark = def.required ? ' <span class="schema-req">*</span>' : '';
    var rowClass = "schema-field" + (isMissing && def.required ? " schema-field-missing" : "");

    html += '<div class="' + rowClass + '">';
    html += '<span class="schema-label">' + escapeHtml(def.label) + reqMark + '</span>';
    html += displayVal;
    html += '</div>';
  }

  if (mapped.missing.length > 0) {
    html += '<div class="schema-missing-summary">';
    html += '<strong>Manuelt gjenst\u00e5r (' + mapped.missing.length + '):</strong><ul>';
    for (var i = 0; i < mapped.missing.length; i++) {
      html += '<li>' + escapeHtml(mapped.missing[i]) + '</li>';
    }
    html += '</ul></div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function onSchemaChange() {
  var sel = document.getElementById("schemaSelect");
  if (sel) selectedSchema = sel.value;
  if (appState === "FINISHED") {
    renderSchemaPreview("schemaPreview", dayLog);
  }
}

// ============================================================
// END MOCK SCHEMA
// ============================================================

// --- Keyboard support for edit overlay (vanilla JS mode only) ---
if (!REACT_MODE) {
  document.addEventListener("keydown", function (e) {
    if (editingIndex >= 0) {
      if (e.key === "Enter") saveEdit();
      if (e.key === "Escape") cancelEdit();
    }
  });
}

// --- Start ---
init();
