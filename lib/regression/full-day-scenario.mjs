/**
 * Phase 10 Del 1/2/3: the canonical, organization-agnostic full-day
 * regression scenario. Start day -> work entry -> machine -> incident ->
 * håndrens -> lock -> export -> adapter. Driven entirely by introspecting
 * the compiled Runtime (first active order, first machine type, first
 * incident keyword) — no per-organization branching in this file. If a
 * new organization fails this, the scenario stays as-is and the
 * organization's package (or, if truly warranted, the engine) is what
 * gets fixed — never the test.
 *
 * Known, undisguised limitation (Phase 10 Del 9 finding): ADMIN_CONFIG.
 * requiredSchemas (motor.js) — which gates whether continueFromPreDay()
 * blocks on an unconfirmed pre-day schema — is populated by JS when()
 * functions, not data, and Phase 9's Runtime injection never touched it.
 * No organization's Runtime can currently mark a schema mandatory-to-
 * start. This scenario does not exercise that path (nothing blocks
 * continueFromPreDay() for any test organization here) — it is a real
 * gap, not something being quietly avoided; see the Phase 10 report.
 */
import fs from "node:fs";
import vm from "node:vm";
import { loadOrganizationPackage } from "../organization-package/loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";
import { runDryRun } from "../adapters/dry-run-framework.mjs";
import { getAdapter } from "../adapters/registry.mjs";
import { generateCandidates } from "../ranking-engine/candidates.mjs";
import { rankCandidates } from "../ranking-engine/score.mjs";
import { CorrectionMemoryStore } from "../correction-memory/store.mjs";

const MOTOR_SRC = fs.readFileSync("./public/motor.js", "utf8");

/** @param {import('../runtime/types.mjs').OrganizationRuntime|null} runtime */
export function bootMotor(runtime) {
  const kv = {};
  const localStorage = {
    getItem: (k) => (k in kv ? kv[k] : null),
    setItem: (k, v) => { kv[k] = String(v); },
    removeItem: (k) => { delete kv[k]; },
  };
  const listeners = {};
  class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts && opts.detail; } }
  const windowStub = {
    PUNCHOUT_CONFIG: runtime
      ? { lonnskoder: runtime.runtimeConfig.lonnskoder, kjoretoy: runtime.runtimeConfig.kjoretoy, sjaDefaults: {}, externalLinks: runtime.runtimeConfig.externalLinks, hovedordre: runtime.runtimeConfig.hoofdordre }
      : { lonnskoder: [], kjoretoy: [], sjaDefaults: {}, externalLinks: [], hovedordre: "HOVED" },
    PUNCHOUT_RUNTIME: runtime,
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
  return { Motor: sandbox.window.Motor, localStorage, kv };
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** Resolves every unresolved håndrens item generically, using each schema's OWN declared required fields — never a hardcoded field name. */
function resolveAllUnresolved(Motor, maxRounds = 20) {
  for (let round = 0; round < maxRounds; round++) {
    const items = Motor.getUnresolvedItems();
    if (items.length === 0) return true;
    for (const item of items) {
      if (item.kind === "main_time") {
        Motor.resolveItem(item.id, "discard", { reason: "logged_elsewhere" });
        continue;
      }
      if (item.kind === "schema") {
        const schemaId = item.id.replace(/^schema_/, "").replace(/^friksjon_/, "");
        const schema = Motor.getSnapshot().dayLog.schemas.find((s) => s.id === schemaId);
        if (schema) {
          const def = Motor.getSchemaFieldDefinitions(schema.type, schema.origin);
          if (def) {
            for (const [key, fdef] of Object.entries(def.fields)) {
              if (!fdef.required) continue;
              const val = fdef.type === "boolean" ? true : fdef.type === "enum" ? fdef.options?.[0] : "test-verdi";
              Motor.setSchemaField(schema.id, key, val);
            }
          }
        }
      }
      Motor.resolveItem(item.id, "confirm");
    }
  }
  return Motor.getUnresolvedItems().length === 0;
}

/**
 * Del 3: exercises the Ranking Engine + Correction Memory using the
 * organization's own corrections.json fixture — never a hardcoded
 * scenario. Returns null (skipped, not failed) if the package has no
 * fixture.
 */
function verifyRankingFixture(runtime, fixture) {
  if (!fixture) return null;
  // contextScore from the Runtime's own "active order" signal (same
  // convention every prior phase's dry run used) — a real, declared
  // fact, not a test-only assumption.
  const candidates = generateCandidates(fixture.originalValue, fixture.knownValues).map((c) => ({
    ...c,
    contextScore: runtime.orders.find((o) => o.id === c.value)?.active ? 10 : 0,
  }));
  const ctx = {
    category: fixture.category,
    originalValue: fixture.originalValue,
    userId: "test_user",
    organizationId: runtime.organizationId,
    todaysConfirmedValues: fixture.todaysConfirmedValue ? [fixture.todaysConfirmedValue, fixture.todaysConfirmedValue] : [],
  };
  const store = new CorrectionMemoryStore(runtime.rankingWeights?.correctionBonusThresholds);
  const before = rankCandidates(candidates, store, runtime.preferredCandidates, ctx, runtime.rankingWeights);
  for (let i = 0; i < fixture.correctionRepeats; i++) {
    store.recordCorrection({ category: fixture.category, originalValue: fixture.originalValue, correctedValue: fixture.correctedValue, userId: "test_user", organizationId: runtime.organizationId });
  }
  const after = rankCandidates(candidates, store, runtime.preferredCandidates, ctx, runtime.rankingWeights);
  return {
    ok: before[0]?.value === fixture.expectedTopBeforeCorrection && after[0]?.value === fixture.expectedTopAfterCorrection,
    before: before[0]?.value,
    after: after[0]?.value,
    expected: { before: fixture.expectedTopBeforeCorrection, after: fixture.expectedTopAfterCorrection },
  };
}

/**
 * @param {string} orgDir
 * @param {string} [adapterName] - Adapter Registry key to export through; defaults to the reference adapter ("landax") so every existing caller/CI step is unchanged.
 * @returns {Promise<{ok: boolean, stage: string, organizationId: string, detail: Record<string, unknown>}>}
 */
export async function runFullDayScenario(orgDir, adapterName = "landax") {
  let stage = "load";
  try {
    const { input, correctionFixtures } = loadOrganizationPackage(orgDir);
    stage = "compile";
    const compiled = compileRuntime(input, { runtimeVersion: 1 });
    if (!compiled.valid) return { ok: false, stage, organizationId: input.organizationContext.organizationId, detail: { errors: compiled.errors } };
    const runtime = compiled.runtime;

    stage = "ranking";
    const rankingCheck = verifyRankingFixture(runtime, correctionFixtures[0]);
    if (rankingCheck && !rankingCheck.ok) return { ok: false, stage, organizationId: runtime.organizationId, detail: { rankingCheck } };

    stage = "boot";
    const { Motor } = bootMotor(runtime);

    stage = "startDay";
    Motor.startDay();
    Motor.continueFromPreDay();

    stage = "workEntry";
    const machineType = runtime.knowledgeGraph.machineTypes[0];
    const order = runtime.orders.find((o) => o.active) || runtime.orders[0];
    Motor.submitEntry(`Jobbet på ${order ? order.id : "ordre"} med ${machineType ? machineType.label : "utstyr"}.`, "notat");
    await tick();

    stage = "incidentEntry";
    const incidentWord = runtime.extractionVocabularies?.incidentKeywords?.[0] || "hendelse";
    Motor.submitEntry(`Det oppstod en ${incidentWord} i dag.`, "hendelse");
    await tick();

    const completionStatus = Motor.getCompletionStatus();

    stage = "endDay";
    Motor.endDay();

    stage = "handrens";
    const allResolved = resolveAllUnresolved(Motor);

    stage = "lockDay";
    Motor.lockDay();
    const snapshot = Motor.getSnapshot();
    const locked = snapshot.appState === "LOCKED";

    stage = "export";
    const dayLogForExport = { ...snapshot.dayLog, status: "LOCKED" };
    const exportContext = { organizationId: runtime.organizationId, userId: "test_user", deviceId: "test_device", appVersion: "0.9.0" };

    stage = "adapter";
    const dryRun = await runDryRun(dayLogForExport, exportContext, getAdapter(adapterName));
    const envelope = dryRun.envelope;
    const adapterResult = dryRun.adapterResult;

    // Operation Punchout Soft Launch finding (docs/end-to-end-acceptance-test.md
    // F2, fixed in motor.js's updateDraftFromOrchestration/saveEdit): the work
    // entry submitted at the "workEntry" stage above is exactly the text a real
    // exported time entry's arbeidsbeskrivelse must carry. No test in this suite
    // ever asserted on that field's content before, which is how a defect that
    // silently exported arbeidsbeskrivelse: [] for every organization went
    // undetected. Asserting it here, in the one scenario every organization
    // already runs through, closes that gap for good instead of only for the
    // one org it happened to be found against.
    stage = "descriptionIntegrity";
    const workOrderEntry = envelope.timeEntries.find((t) => t.ordre === (order ? order.id : null));
    const descriptionPreserved = !!(workOrderEntry && workOrderEntry.arbeidsbeskrivelse && workOrderEntry.arbeidsbeskrivelse.length > 0);
    if (!descriptionPreserved) {
      return { ok: false, stage, organizationId: runtime.organizationId, detail: { workOrderEntry, reason: "confirmed draft exported with empty arbeidsbeskrivelse despite a linked, submitted work entry" } };
    }

    return {
      ok: allResolved && locked && adapterResult.ok && descriptionPreserved,
      stage: "complete",
      organizationId: runtime.organizationId,
      detail: {
        rankingCheck,
        completionActionsBeforeHandrens: completionStatus.missingActions.length,
        allResolved,
        locked,
        finalAppState: snapshot.appState,
        exportedSchemaCount: envelope.schemas.length,
        descriptionPreserved,
        adapterName,
        adapterOk: adapterResult.ok,
      },
    };
  } catch (e) {
    return { ok: false, stage, organizationId: orgDir, detail: { error: String((e && e.message) || e) } };
  }
}
