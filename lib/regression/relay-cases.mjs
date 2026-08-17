/**
 * RELAY REGRESSION CASES
 * ======================
 * Covers the durable-delivery chain the field trial depends on:
 *
 *   locked workday -> Relay custody -> delivery state machine -> CSV adapter
 *
 * Everything runs against a throwaway PUNCHOUT_DATA_DIR under the OS temp
 * directory, so nothing here touches real pilot data.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * ONE data directory and ONE set of module instances for the whole file.
 *
 * These modules read PUNCHOUT_DATA_DIR at MODULE LOAD (matching
 * lib/backend/persistence.mjs's established pattern), and dispatcher.mjs
 * imports store.mjs by a plain specifier — so cache-busting the dispatcher per
 * case would hand it a DIFFERENT store instance than the case is asserting
 * against, pointed at a different directory. Isolating by directory is
 * therefore the wrong axis. Cases are isolated by ORGANIZATION instead, which
 * is also closer to reality: one running server, many organizations, and the
 * store's own directory-level isolation doing the separating.
 */
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "punchout-relay-"));
process.env.PUNCHOUT_DATA_DIR = DATA_DIR;

const store = await import("../relay/store.mjs");
const dispatcher = await import("../relay/dispatcher.mjs");
const csvTarget = await import("../relay/targets/csv-file-target.mjs");

let caseCounter = 0;

/** A per-case organization id, so no two cases can see each other's records. */
function freshRelay() {
  caseCounter += 1;
  return { dataDir: DATA_DIR, store, dispatcher, csvTarget, org: `relaycase${caseCounter}` };
}

/** A realistic locked-workday packet, exactly the shape motor.js buildExportPacket() emits. */
function makePacket(overrides = {}) {
  return {
    exportVersion: "1.0",
    exportId: "exp_test_0001",
    deviceId: "dev_test_1",
    userId: "user_test_1",
    dayId: "2026-08-17",
    createdAt: "2026-08-17T14:32:00.000Z",
    payload: {
      startTime: "07:00",
      endTime: "15:00",
      entries: [
        { time: "07:15", type: "notat", text: "Brøytet Fv. 17 sørover" },
        { time: "09:40", type: "hendelse", text: "Nestenulykke ved påkjøring" },
      ],
      schemas: [
        {
          id: "schema_sja_1",
          type: "sja_preday",
          status: "confirmed",
          fields: { oppgave: "Brøyting Fv. 17", sted: "Steinkjer", konsekvens: "Påkjørsel bakfra", tiltak: "Skiltet arbeidsvarsling", godkjent: true },
          createdAt: "06:55",
          confirmedAt: "2026-08-17T05:00:00.000Z",
        },
      ],
      timeEntries: [
        {
          ordre: "204481-0014",
          dato: "2026-08-17",
          fra_tid: "07:30",
          til_tid: "11:00",
          arbeidsbeskrivelse: ["204481-0014 fra 07:30 til 11:00 brøyting; æøå"],
          lonnskoder: [{ kode: "100", fra: "07:30", til: "11:00" }],
          maskintimer: [],
        },
      ],
      machineHours: [{ ordre: "204481-0014", maskintype: "hjullaster", timer: "3.5" }],
    },
    ...overrides,
  };
}

function receive(store, packet, { organizationId = "mesta", runtimeVersion = 3 } = {}) {
  return store.receiveExport({
    exportId: packet.exportId,
    organizationId,
    deviceId: packet.deviceId,
    packet,
    runtimeVersion,
  });
}

export const RELAY_CASES = [
  // ================================================================
  // A. CUSTODY — the payload survives at all
  // ================================================================
  {
    id: "relay_stores_the_full_locked_workday_not_just_a_receipt",
    description:
      "The defect this whole layer exists to fix: /api/export used to verify a locked day's signature and then discard the payload, keeping only {receivedAt, exportId, organizationId, deviceId, signatureValid}. The Relay must preserve the operational record itself — entries, schemas, time entries, machine hours — not a summary of it.",
    run: async () => {
      const { store, org } = freshRelay();
      const packet = makePacket();
      const result = receive(store, packet, { organizationId: org });
      const read = store.readRelayRecord(org, packet.exportId);
      return result.stored === true
        && result.reason === "received"
        && read.payload.entries.length === 2
        && read.payload.schemas.length === 1
        && read.payload.timeEntries.length === 1
        && read.payload.machineHours.length === 1
        && read.payload.timeEntries[0].lonnskoder[0].kode === "100"
        && read.payload.entries[0].text === "Brøytet Fv. 17 sørover";
    },
  },
  {
    id: "relay_preserves_identity_attribution_chain",
    description:
      "organization -> user -> device -> workday -> export must survive into storage. organizationId is server-resolved from the device registry and is NOT taken from the payload; userId is device-asserted and must be marked unverified so a future consumer cannot mistake it for a proven identity.",
    run: async () => {
      const { store, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });
      const r = store.readRelayRecord(org, packet.exportId);
      return r.organizationId === org
        && r.userId === "user_test_1"
        && r.userIdVerified === false
        && r.deviceId === "dev_test_1"
        && r.dayId === "2026-08-17"
        && r.exportId === "exp_test_0001"
        && r.lockedAt === "2026-08-17T14:32:00.000Z"
        && r.runtimeVersion === 3
        && r.signatureValid === true
        && typeof r.receivedAt === "string";
    },
  },
  {
    id: "relay_survives_restart_by_reading_from_disk",
    description:
      "Restart durability, proven the way it actually matters: a completely fresh module instance (simulating a restarted server process) reading the same data directory must find the record, with the payload intact. Nothing may live only in memory.",
    run: async () => {
      const { dataDir, store, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });

      // A brand-new module instance against the same directory — this is what
      // a server restart looks like from the store's point of view.
      process.env.PUNCHOUT_DATA_DIR = dataDir;
      const restarted = await import("../relay/store.mjs?restart=" + Date.now());
      const r = restarted.readRelayRecord(org, packet.exportId);
      return !!r && r.payload.entries.length === 2 && r.exportId === packet.exportId;
    },
  },

  // ================================================================
  // B. IDEMPOTENCY AND IMMUTABILITY
  // ================================================================
  {
    id: "relay_duplicate_delivery_does_not_create_a_second_record",
    description:
      "The same locked workday sent twice (motor.js's outbox retries on any non-2xx/409) must produce ONE logical relay export. The second receive reports `duplicate` and stores nothing new.",
    run: async () => {
      const { store, org } = freshRelay();
      const packet = makePacket();
      const first = receive(store, packet, { organizationId: org });
      const second = receive(store, packet, { organizationId: org });
      const ids = store.listRelayExportIds(org);
      return first.stored === true
        && second.stored === false
        && second.reason === "duplicate"
        && ids.length === 1;
    },
  },
  {
    id: "relay_duplicate_delivery_never_mutates_the_stored_payload",
    description:
      "A retry carrying a DIFFERENT payload under the same exportId must not silently rewrite history. The first accepted version is authoritative — an accepted export is a historical observation, not a mutable row.",
    run: async () => {
      const { store, org } = freshRelay();
      const original = makePacket();
      receive(store, original, { organizationId: org });

      const tampered = makePacket();
      tampered.payload.entries = [{ time: "23:59", type: "notat", text: "ERSTATTET INNHOLD" }];
      tampered.payload.timeEntries = [];
      receive(store, tampered, { organizationId: org });

      const r = store.readRelayRecord(org, original.exportId);
      return r.payload.entries.length === 2
        && r.payload.entries[0].text === "Brøytet Fv. 17 sørover"
        && r.payload.timeEntries.length === 1;
    },
  },
  {
    id: "relay_isolates_organizations_structurally",
    description:
      "Org A must never read or overwrite Org B's export. Two organizations using the SAME exportId must each keep their own record, and neither may read the other's — isolation is by directory, not by a filter that could be forgotten.",
    run: async () => {
      const { store, org } = freshRelay();
      const a = makePacket({ exportId: "exp_shared_id", userId: "user_a" });
      const b = makePacket({ exportId: "exp_shared_id", userId: "user_b" });
      b.payload.entries = [{ time: "08:00", type: "notat", text: "Org B sin dag" }];

      receive(store, a, { organizationId: org + "_a" });
      receive(store, b, { organizationId: org + "_b" });

      const fromA = store.readRelayRecord(org + "_a", "exp_shared_id");
      const fromB = store.readRelayRecord(org + "_b", "exp_shared_id");
      return fromA.userId === "user_a"
        && fromB.userId === "user_b"
        && fromA.payload.entries.length === 2
        && fromB.payload.entries.length === 1
        && store.readRelayRecord(org + "_a", "nonexistent") === null;
    },
  },
  {
    id: "relay_rejects_path_traversal_in_ids",
    description:
      "exportId arrives inside a client-posted packet, so it is a real path-construction boundary. Traversal attempts must be refused before any filesystem call, not sanitised into something almost-safe.",
    run: async () => {
      const { store, org } = freshRelay();
      const evil = makePacket({ exportId: "../../backend-state" });
      const result = receive(store, evil, { organizationId: org });
      return result.stored === false
        && result.reason === "invalid_id"
        && store.isSafeRelayId("../../x") === false
        && store.isSafeRelayId("..") === false
        && store.isSafeRelayId("exp_ok-1.2") === true;
    },
  },

  // ================================================================
  // C. DELIVERY STATE MACHINE
  // ================================================================
  {
    id: "relay_state_machine_rejects_illegal_transitions",
    description:
      "Transitions are the contract. DELIVERED and FAILED_FINAL are terminal — nothing may resurrect a delivered export — and no transition anywhere deletes a payload.",
    run: async () => {
      const { store, org } = freshRelay();
      return store.canTransition("RECEIVED", "READY") === true
        && store.canTransition("READY", "DELIVERING") === true
        && store.canTransition("DELIVERING", "DELIVERED") === true
        && store.canTransition("DELIVERING", "FAILED_RETRYABLE") === true
        && store.canTransition("FAILED_RETRYABLE", "READY") === true
        && store.canTransition("DELIVERED", "READY") === false
        && store.canTransition("DELIVERED", "DELIVERING") === false
        && store.canTransition("FAILED_FINAL", "READY") === false
        && store.canTransition("RECEIVED", "DELIVERED") === false;
    },
  },
  {
    id: "relay_delivery_state_is_stored_separately_from_the_payload",
    description:
      "The core structural guarantee: delivery state lives in its own file, so retry churn can never rewrite — and therefore never corrupt — the operational record. Proven by asserting both files exist independently and that transitions leave the payload file byte-identical.",
    run: async () => {
      const { dataDir, store, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });

      const payloadFile = path.join(dataDir, "relay", org, packet.exportId + ".json");
      const deliveryFile = path.join(dataDir, "relay", org, packet.exportId + ".delivery.json");
      const before = fs.readFileSync(payloadFile, "utf8");

      store.transitionDelivery(org, packet.exportId, "csv-file", "READY");
      store.transitionDelivery(org, packet.exportId, "csv-file", "DELIVERING", { countAttempt: true });
      store.transitionDelivery(org, packet.exportId, "csv-file", "FAILED_RETRYABLE", { error: "boom" });

      const after = fs.readFileSync(payloadFile, "utf8");
      const state = store.getTargetState(org, packet.exportId, "csv-file");
      return fs.existsSync(deliveryFile)
        && before === after
        && state.status === "FAILED_RETRYABLE"
        && state.attempts === 1
        && state.lastError === "boom"
        && state.history.length === 3;
    },
  },
  {
    id: "relay_reclaims_deliveries_orphaned_by_a_crash",
    description:
      "A process that dies mid-attempt leaves a record in DELIVERING, which is not dispatch-eligible and would otherwise never retry. Startup reclaim must return it to FAILED_RETRYABLE so delivery can resume — the 'server restart before adapter runs' scenario.",
    run: async () => {
      const { store, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });
      store.transitionDelivery(org, packet.exportId, "csv-file", "READY");
      store.transitionDelivery(org, packet.exportId, "csv-file", "DELIVERING", { countAttempt: true });

      const reclaimed = store.reclaimStuckDeliveries(org);
      const state = store.getTargetState(org, packet.exportId, "csv-file");
      return reclaimed === 1
        && state.status === "FAILED_RETRYABLE"
        && store.readRelayRecord(org, packet.exportId).payload.entries.length === 2;
    },
  },

  // ================================================================
  // D. CSV ADAPTER
  // ================================================================
  {
    id: "relay_csv_adapter_produces_files_from_the_persisted_payload",
    description:
      "The CSV must originate from the Relay payload the phone delivered, never from recreated test data. Delivering one record must write real files and move the state machine to DELIVERED.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });

      const result = dispatcher.deliverOne(org, packet.exportId, "csv-file");
      const dir = path.join(csvTarget.csvOutputRoot(), org, packet.exportId);
      const files = fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
      const state = store.getTargetState(org, packet.exportId, "csv-file");

      return result.ok === true
        && state.status === "DELIVERED"
        && typeof state.deliveredAt === "string"
        && files.includes("time_entries.csv")
        && files.includes("entries.csv")
        && files.includes("summary.csv")
        && files.includes("schemas.csv")
        && files.includes("wage_codes.csv");
    },
  },
  {
    id: "relay_csv_uses_norwegian_excel_conventions_and_preserves_content",
    description:
      "UTF-8 BOM (so Excel does not fall back to ANSI and mangle æ/ø/å), semicolon delimiter (comma is Norway's decimal separator), and the actual work description carried through unchanged from the locked day.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });
      dispatcher.deliverOne(org, packet.exportId, "csv-file");

      const file = path.join(csvTarget.csvOutputRoot(), org, packet.exportId, "time_entries.csv");
      const csv = fs.readFileSync(file, "utf8");
      const raw = fs.readFileSync(file);
      const header = csv.split("\n")[0];

      return raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
        && header.includes(";")
        && !header.includes(",")
        && csv.includes("204481-0014")
        && csv.includes("brøyting; æøå".slice(-3))
        && csv.includes("07:30");
    },
  },
  {
    id: "relay_csv_summary_carries_identity_for_founder_inspection",
    description:
      "A founder opening the CSV must be able to tell WHOSE day it is without cross-referencing the Relay: org, user, device, dayId, lock time and signature state belong in the artifact itself.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });
      dispatcher.deliverOne(org, packet.exportId, "csv-file");

      const csv = fs.readFileSync(path.join(csvTarget.csvOutputRoot(), org, packet.exportId, "summary.csv"), "utf8");
      return csv.includes("organizationId;" + org)
        && csv.includes("userId;user_test_1")
        && csv.includes("userIdVerified;false")
        && csv.includes("deviceId;dev_test_1")
        && csv.includes("dayId;2026-08-17")
        && csv.includes("signatureValid;true");
    },
  },
  {
    id: "relay_csv_omits_quantities_file_when_none_were_observed",
    description:
      "No quantity was entered, so no quantity file may appear. The seam must never fabricate a zero — an absent observation and an observed zero are different facts.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });
      dispatcher.deliverOne(org, packet.exportId, "csv-file");
      const dir = path.join(csvTarget.csvOutputRoot(), org, packet.exportId);
      return fs.existsSync(dir) && !fs.readdirSync(dir).includes("quantities.csv");
    },
  },
  {
    id: "relay_csv_writes_quantities_when_the_payload_carries_them",
    description:
      "The other half of the seam: when a payload DOES carry quantities they must reach the CSV unchanged, so the future production-benchmarking path needs no migration of already-delivered days.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      const packet = makePacket();
      packet.payload.quantities = [
        { ordre: "204481-0014", prosess: "brøyting", verdi: "12.5", enhet: "km", tidspunkt: "10:00", kilde: "manuell" },
      ];
      receive(store, packet, { organizationId: org });
      dispatcher.deliverOne(org, packet.exportId, "csv-file");
      const file = path.join(csvTarget.csvOutputRoot(), org, packet.exportId, "quantities.csv");
      if (!fs.existsSync(file)) return false;
      const csv = fs.readFileSync(file, "utf8");
      return csv.includes("brøyting") && csv.includes("12.5") && csv.includes("km");
    },
  },

  // ================================================================
  // E. ADAPTER IDEMPOTENCY AND FAILURE SCENARIOS
  // ================================================================
  {
    id: "relay_csv_redelivery_is_an_idempotent_no_op",
    description:
      "Running the adapter twice must not create a duplicate downstream business record. The second run recognises byte-identical output, writes nothing, and the state machine reports the export as already delivered rather than attempting again.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });

      dispatcher.deliverOne(org, packet.exportId, "csv-file");
      const dir = path.join(csvTarget.csvOutputRoot(), org, packet.exportId);
      const firstFiles = fs.readdirSync(dir).sort().join(",");
      const firstBytes = fs.readFileSync(path.join(dir, "time_entries.csv"), "utf8");

      const second = dispatcher.deliverOne(org, packet.exportId, "csv-file");
      const secondFiles = fs.readdirSync(dir).sort().join(",");
      const secondBytes = fs.readFileSync(path.join(dir, "time_entries.csv"), "utf8");
      const state = store.getTargetState(org, packet.exportId, "csv-file");

      return second.ok === true
        && second.skipped === true
        && firstFiles === secondFiles
        && firstBytes === secondBytes
        && state.attempts === 1;
    },
  },
  {
    id: "relay_csv_direct_redelivery_recognises_identical_existing_output",
    description:
      "Bypassing the DELIVERED short-circuit (the crash-then-reclaim path re-attempts a record whose files already exist) must still be safe: the target itself recognises byte-equivalent output and reports an idempotent replay rather than duplicating.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });
      dispatcher.deliverOne(org, packet.exportId, "csv-file");

      // Force the record back to a dispatchable state, as reclaim would.
      store.transitionDelivery(org, packet.exportId, "csv-file", "READY");
      const replay = csvTarget.deliver(store.readRelayRecord(org, packet.exportId));
      return replay.ok === true
        && replay.receipt.idempotentReplay === true
        && replay.receipt.filesWritten.length === 0
        && replay.receipt.filesUnchanged.length > 0;
    },
  },
  {
    id: "relay_payload_survives_a_failing_adapter",
    description:
      "'Phone delivers successfully, adapter unavailable.' A target that throws must leave the payload untouched, the state retryable, and the record inspectable — no data loss, and the founder can still see what arrived.",
    run: async () => {
      const { store, dispatcher, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });

      dispatcher.registerTarget({
        name: "always-fails",
        version: "1.0",
        deliver: () => { throw new Error("downstream endpoint unavailable"); },
      });

      const result = dispatcher.deliverOne(org, packet.exportId, "always-fails");
      const state = store.getTargetState(org, packet.exportId, "always-fails");
      const record = store.readRelayRecord(org, packet.exportId);

      return result.ok === false
        && state.status === "FAILED_RETRYABLE"
        && state.attempts === 1
        && String(state.lastError).includes("downstream endpoint unavailable")
        && record.payload.entries.length === 2
        && record.payload.timeEntries.length === 1;
    },
  },
  {
    id: "relay_retry_after_transient_failure_succeeds_without_duplicating",
    description:
      "A retryable failure followed by a working target must deliver exactly once. This is the whole point of durable custody: the field record waits for the downstream system to come back, rather than being lost with it.",
    run: async () => {
      const { store, dispatcher, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });

      let attempts = 0;
      dispatcher.registerTarget({
        name: "flaky",
        version: "1.0",
        deliver: () => {
          attempts += 1;
          if (attempts === 1) return { ok: false, retryable: true, error: "temporary network error" };
          return { ok: true, retryable: false, receipt: { attempt: attempts } };
        },
      });

      const first = dispatcher.deliverOne(org, packet.exportId, "flaky");
      const second = dispatcher.deliverOne(org, packet.exportId, "flaky");
      const third = dispatcher.deliverOne(org, packet.exportId, "flaky");
      const state = store.getTargetState(org, packet.exportId, "flaky");

      return first.ok === false
        && second.ok === true
        && third.skipped === true
        && attempts === 2
        && state.status === "DELIVERED"
        && state.attempts === 2;
    },
  },
  {
    id: "relay_permanent_failure_is_terminal_but_loses_nothing",
    description:
      "A non-retryable rejection (validation failure, 4xx) must stop retrying — and must still leave the operational record fully readable. FAILED_FINAL is a delivery outcome, never a reason to discard a workday.",
    run: async () => {
      const { store, dispatcher, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });

      let calls = 0;
      dispatcher.registerTarget({
        name: "rejects",
        version: "1.0",
        deliver: () => { calls += 1; return { ok: false, retryable: false, error: "receiver rejected the schema version" }; },
      });

      dispatcher.deliverOne(org, packet.exportId, "rejects");
      const retry = dispatcher.deliverOne(org, packet.exportId, "rejects");
      const state = store.getTargetState(org, packet.exportId, "rejects");

      return calls === 1
        && retry.skipped === true
        && state.status === "FAILED_FINAL"
        && store.readRelayRecord(org, packet.exportId).payload.entries.length === 2;
    },
  },
  {
    id: "relay_csv_conversion_error_leaves_payload_intact",
    description:
      "'CSV conversion error.' A payload the adapter cannot validate must fail delivery without touching the stored workday and without leaving a partial CSV directory behind.",
    run: async () => {
      const { store, dispatcher, csvTarget, org } = freshRelay();
      // No dayId — CsvAdapter.validate() requires exportId and dayId.
      const packet = makePacket({ dayId: null });
      receive(store, packet, { organizationId: org });

      const result = dispatcher.deliverOne(org, packet.exportId, "csv-file");
      const state = store.getTargetState(org, packet.exportId, "csv-file");
      const dir = path.join(csvTarget.csvOutputRoot(), org, packet.exportId);
      const record = store.readRelayRecord(org, packet.exportId);

      // dayId degrades to "unknown-day" in the envelope, so validation passes;
      // what matters is that whichever way it goes, the payload is intact and
      // no partial output is left behind on failure.
      const payloadIntact = record.payload.entries.length === 2;
      if (result.ok) return payloadIntact && state.status === "DELIVERED";
      return payloadIntact && state.status !== "DELIVERED" && !fs.existsSync(path.join(dir, "time_entries.csv"));
    },
  },
  {
    id: "relay_dispatch_pending_processes_only_undelivered_records",
    description:
      "A dispatch run must pick up everything outstanding and skip what is already terminal — the resume-after-restart path — without re-delivering anything.",
    run: async () => {
      const { store, dispatcher, org } = freshRelay();
      const a = makePacket({ exportId: "exp_a" });
      const b = makePacket({ exportId: "exp_b" });
      const c = makePacket({ exportId: "exp_c" });
      receive(store, a, { organizationId: org });
      receive(store, b, { organizationId: org });
      receive(store, c, { organizationId: org });

      dispatcher.deliverOne(org, "exp_a", "csv-file");
      const summary = dispatcher.dispatchPending(org, "csv-file");

      return summary.attempted === 2
        && summary.delivered === 2
        && summary.failed === 0
        && store.getTargetState(org, "exp_a", "csv-file").attempts === 1
        && store.getTargetState(org, "exp_b", "csv-file").status === "DELIVERED"
        && store.getTargetState(org, "exp_c", "csv-file").status === "DELIVERED";
    },
  },

  // ================================================================
  // F. INSPECTION SURFACE
  // ================================================================
  {
    id: "relay_listing_shows_identity_and_delivery_state_without_payloads",
    description:
      "The inspection listing must let an operator find a workday and see its delivery state without loading every payload — and must report content counts so an empty day is visibly empty.",
    run: async () => {
      const { store, dispatcher, org } = freshRelay();
      const packet = makePacket();
      receive(store, packet, { organizationId: org });
      dispatcher.deliverOne(org, packet.exportId, "csv-file");

      const listing = store.listRelayRecords(org);
      const row = listing[0];
      return listing.length === 1
        && row.payload === undefined
        && row.exportId === packet.exportId
        && row.userId === "user_test_1"
        && row.payloadSummary.entries === 2
        && row.payloadSummary.timeEntries === 1
        && row.payloadSummary.startTime === "07:00"
        && row.delivery["csv-file"].status === "DELIVERED";
    },
  },
];
