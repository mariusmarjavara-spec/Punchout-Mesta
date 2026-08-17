/**
 * CSV FILE TARGET — the first proof that the Relay -> Adapter boundary works.
 * ==========================================================================
 *
 * WHAT THIS IS. A delivery target that takes a Relay record, runs it through
 * the EXISTING, already-tested CsvAdapter translation (lib/adapters/
 * csv-adapter.mjs), and writes the result to a real directory the founder can
 * open. It is deliberately a thin shell around translation logic that is
 * already covered by lib/regression/adapter-contract.mjs and the RC1-02
 * Norwegian-Excel cases in pilot-ux-cases.mjs.
 *
 * WHY NOT JUST USE CsvAdapter DIRECTLY. Its `send()` is a documented mock
 * (`SIMULERT UPLOAD`, no I/O) — correct for a golden reference adapter, useless
 * for a founder who needs to open a file. The adapter contract splits
 * translation (`transform`) from downstream communication (`send`), so a real
 * file sink is a different TARGET reusing the same TRANSLATION, not a fork of
 * the adapter. That is exactly the seam the boundary exists to provide, and it
 * is why the CSV demonstration does not get to define the architecture.
 *
 * NORWEGIAN-EXCEL CONVENTIONS are inherited wholesale from CsvAdapter, not
 * reimplemented: UTF-8 with BOM (so Excel does not fall back to the system
 * ANSI codepage and mangle æ/ø/å), semicolon delimiter (comma is Norway's
 * DECIMAL separator, so Norwegian-locale Excel expects semicolon as the LIST
 * separator), and quoting triggered by quote/semicolon/newline. Those choices
 * were found by an end-to-end test that inspected the actual bytes, and they
 * already have regression coverage. Re-deriving them here would be how they
 * quietly drift apart.
 *
 * IDEMPOTENCY (§45). Output is keyed on exportId, and a re-run is:
 *   - byte-identical content already present  -> `unchanged`, nothing written;
 *   - no output present                       -> written;
 *   - DIFFERENT content already present       -> refused as `conflict`.
 * The third case is the important one. A Relay payload is immutable, so
 * differing output can only mean the translation logic itself changed. Silently
 * overwriting would rewrite history to match new code; refusing surfaces it.
 * There is therefore exactly one logical CSV output per logical export, and a
 * retry after a network failure can never produce a duplicate business record.
 */
import fs from "node:fs";
import path from "node:path";
import { CsvAdapter } from "../../adapters/csv-adapter.mjs";
import { relayRecordToEnvelope } from "../envelope-mapper.mjs";

const DATA_DIR = process.env.PUNCHOUT_DATA_DIR || path.join(process.cwd(), ".data");
const CSV_OUTPUT_ROOT = path.join(DATA_DIR, "adapter-output", "csv");

export const TARGET_NAME = "csv-file";
export const TARGET_VERSION = "1.0";

export function csvOutputRoot() {
  return CSV_OUTPUT_ROOT;
}

/** Same safety posture as the Relay store: ids build paths, so ids are constrained. */
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
function assertSafe(value, label) {
  if (typeof value !== "string" || !SAFE_ID_PATTERN.test(value) || value === "." || value === "..") {
    throw new Error(`unsafe ${label} for csv output path: "${value}"`);
  }
}

function outputDir(organizationId, exportId) {
  assertSafe(organizationId, "organizationId");
  assertSafe(exportId, "exportId");
  const resolved = path.resolve(CSV_OUTPUT_ROOT, organizationId, exportId);
  const root = path.resolve(CSV_OUTPUT_ROOT);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error(`csv output path for "${organizationId}/${exportId}" resolves outside the output root`);
  }
  return resolved;
}

function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * A day-level summary sheet. The three CsvAdapter files are row-oriented and
 * say nothing about WHOSE day this was — for founder inspection, "which
 * workday am I looking at" has to be answerable from the file itself, without
 * cross-referencing the Relay. Identity, not interpretation: no metric here.
 */
function buildSummaryCsv(record, envelope) {
  const rows = [
    ["exportId", envelope.exportId],
    ["organizationId", envelope.organizationId],
    ["userId", envelope.userId],
    ["userIdVerified", String(record.userIdVerified === true)],
    ["deviceId", envelope.deviceId],
    ["dayId", envelope.dayId],
    ["startTime", envelope.shift.startTime ?? ""],
    ["endTime", envelope.shift.endTime ?? ""],
    ["lockedAt", record.lockedAt ?? ""],
    ["receivedAt", record.receivedAt],
    ["runtimeVersion", record.runtimeVersion == null ? "" : String(record.runtimeVersion)],
    ["exportVersion", record.exportVersion ?? ""],
    ["signatureValid", String(record.signatureValid === true)],
    ["entries", String(envelope.entries.length)],
    ["schemas", String(envelope.schemas.length)],
    ["timeEntries", String(envelope.timeEntries.length)],
    ["machineHours", String(envelope.machineHours.length)],
  ];
  // Reuse CsvAdapter's escaping rules by routing through the same shape it
  // uses: a header row plus keyed rows.
  const escaped = rows.map(([felt, verdi]) => ({ felt, verdi }));
  return csvFromRows(["felt", "verdi"], escaped);
}

/**
 * Confirmed/discarded HMS schema rows. CsvAdapter deliberately does NOT
 * declare the "schemas" capability (it models a receiver that wants only
 * operational rows), but a founder inspecting a field test specifically needs
 * to see that the SJA and the vehicle check arrived. This is an additional
 * file for the FILE target, not a change to CsvAdapter's declared capabilities.
 */
function buildSchemasCsv(envelope) {
  const rows = envelope.schemas.map((s) => ({
    id: s.id,
    type: s.type,
    status: s.status,
    createdAt: s.createdAt ?? "",
    confirmedAt: s.confirmedAt ?? "",
    // Field values are free-form per schema type; flattened to key=value pairs
    // rather than exploded into columns, because the column set is not known
    // ahead of time and must not differ between two days of the same export.
    felter: Object.entries(s.fields || {})
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${v}`)
      .join(" | "),
  }));
  return csvFromRows(["id", "type", "status", "createdAt", "confirmedAt", "felter"], rows);
}

/** Wage-code lines, one row each — the payroll-relevant detail inside timeEntries. */
function buildWageCodesCsv(envelope) {
  const rows = [];
  for (const t of envelope.timeEntries) {
    for (const lk of t.lonnskoder || []) {
      rows.push({ ordre: t.ordre, dato: t.dato, kode: lk.kode, fra: lk.fra, til: lk.til });
    }
  }
  return csvFromRows(["ordre", "dato", "kode", "fra", "til"], rows);
}

/** Quantities, when the payload carried any. Absent file when none — never a fabricated zero. */
function buildQuantitiesCsv(envelope) {
  const quantities = envelope.metadata?.quantities;
  if (!Array.isArray(quantities) || quantities.length === 0) return null;
  const rows = quantities.map((q) => ({
    ordre: q.ordre ?? "",
    prosess: q.prosess ?? q.process ?? "",
    verdi: q.verdi ?? q.value ?? "",
    enhet: q.enhet ?? q.unit ?? "",
    tidspunkt: q.tidspunkt ?? q.at ?? "",
    kilde: q.kilde ?? q.source ?? "",
  }));
  return csvFromRows(["ordre", "prosess", "verdi", "enhet", "tidspunkt", "kilde"], rows);
}

// Mirrors CsvAdapter's own toCsv()/csvEscape() exactly — same delimiter, same
// BOM, same escape triggers. Kept as one small local helper rather than
// exported from the adapter so this target can add files the adapter does not
// declare, without widening the adapter's public surface.
const CSV_DELIMITER = ";";
const UTF8_BOM = "﻿";
function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  const needsQuoting = s.includes('"') || s.includes(CSV_DELIMITER) || s.includes("\n") || s.includes("\r");
  return needsQuoting ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvFromRows(headers, rows) {
  const lines = [headers.join(CSV_DELIMITER)];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(CSV_DELIMITER));
  return UTF8_BOM + lines.join("\n");
}

/**
 * Deliver one Relay record as CSV files on disk.
 *
 * @param {import('../store.mjs').RelayRecord} record
 * @param {{appVersion?: string}} [opts]
 * @returns {{ok: boolean, retryable: boolean, receipt?: object, error?: string}}
 */
export function deliver(record, opts = {}) {
  let envelope;
  try {
    envelope = relayRecordToEnvelope(record, opts);
  } catch (e) {
    // A payload that cannot even be shaped into an envelope will never succeed
    // on retry — this is FAILED_FINAL territory, not a transient error.
    return { ok: false, retryable: false, error: `envelope mapping failed: ${e?.message || e}` };
  }

  const validation = CsvAdapter.validate(envelope);
  if (!validation.valid) {
    return { ok: false, retryable: false, error: `csv adapter validation failed: ${validation.errors.join("; ")}` };
  }

  /** @type {Record<string,string>} */
  let files;
  try {
    const transformed = CsvAdapter.transform(envelope);
    files = { ...transformed.files };
    files["summary.csv"] = buildSummaryCsv(record, envelope);
    files["schemas.csv"] = buildSchemasCsv(envelope);
    files["wage_codes.csv"] = buildWageCodesCsv(envelope);
    const quantities = buildQuantitiesCsv(envelope);
    if (quantities) files["quantities.csv"] = quantities;
  } catch (e) {
    // A translation error must leave the Relay payload untouched — it does,
    // because nothing here has written anything yet.
    return { ok: false, retryable: false, error: `csv transform failed: ${e?.message || e}` };
  }

  let dir;
  try {
    dir = outputDir(record.organizationId, record.exportId);
  } catch (e) {
    return { ok: false, retryable: false, error: e?.message || String(e) };
  }

  const written = [];
  const unchanged = [];
  try {
    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(dir, name);
      if (fs.existsSync(filePath)) {
        const existing = fs.readFileSync(filePath, "utf8");
        if (existing === content) {
          unchanged.push(name);
          continue;
        }
        return {
          ok: false,
          retryable: false,
          error:
            `refusing to overwrite ${name} for export ${record.exportId}: existing output differs from newly ` +
            `generated output. The Relay payload is immutable, so this means the CSV translation changed. ` +
            `Resolve deliberately — do not silently rewrite delivered history.`,
        };
      }
      writeAtomic(filePath, content);
      written.push(name);
    }
  } catch (e) {
    // I/O failures (disk full, permissions, transient FS) ARE retryable, and
    // critically: the Relay payload is a different file and remains intact.
    return { ok: false, retryable: true, error: `csv write failed: ${e?.message || e}` };
  }

  return {
    ok: true,
    retryable: false,
    receipt: {
      target: TARGET_NAME,
      targetVersion: TARGET_VERSION,
      outputDir: dir,
      filesWritten: written,
      filesUnchanged: unchanged,
      // "unchanged" with nothing written is the idempotent re-run case: the
      // logical output already existed and was byte-identical.
      idempotentReplay: written.length === 0 && unchanged.length > 0,
    },
  };
}

export const CsvFileTarget = { name: TARGET_NAME, version: TARGET_VERSION, deliver };
