/**
 * CsvAdapter — a format-neutral golden adapter (not a mapping to any
 * named product). Declares capabilities ["entries", "timeEntries",
 * "machineHours"] but deliberately NOT "schemas" (registry.mjs) — a
 * receiver that only wants operational rows, not free-form HMS-schema
 * fields. Exists to prove the ExportEnvelope->Adapter pipeline
 * generalizes beyond Landax's single fictional mapping, with real
 * (not JSON.stringify) transform logic: row generation and CSV escaping.
 *
 * send() performs NO real network call — mock only, same posture as
 * landax-adapter.mjs.
 *
 * @implements {import('./adapter.mjs').Adapter}
 */

import { requireFields, checkSchemaVersion } from "./validation-helpers.mjs";

const MOCK_ENDPOINT = "https://mock.csv-export.example/api/v1/upload";
const SUPPORTED_SCHEMA_VERSIONS = ["1.0"];

/**
 * RC1-02 fix. Two independent norwegian-Excel compatibility problems found
 * by an end-to-end acceptance test that actually inspected the exported
 * bytes, not just the API response:
 *
 * 1. Delimiter: comma is Norway's DECIMAL separator, so a Norwegian-
 *    locale Excel expects semicolon as the LIST separator for automatic
 *    column-splitting on double-click open. A comma-delimited file opened
 *    that way lands as one column, not the intended structure — the file
 *    was correct CSV, just the wrong dialect for this customer base.
 * 2. Encoding: no BOM (byte-order mark) meant Excel could fall back to
 *    the system ANSI codepage instead of UTF-8 on double-click open,
 *    misrendering æ/ø/å. Prepending U+FEFF makes UTF-8 unambiguous to
 *    Excel without affecting any other CSV/text reader (BOM is
 *    transparent to RFC 4180 parsers and virtually every modern tool).
 */
const CSV_DELIMITER = ";";
const UTF8_BOM = "﻿";

/** @param {*} value */
function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  const needsQuoting = s.includes('"') || s.includes(CSV_DELIMITER) || s.includes("\n");
  return needsQuoting ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * @param {string[]} headers
 * @param {Record<string, *>[]} rows
 * @returns {string}
 */
function toCsv(headers, rows) {
  const lines = [headers.join(CSV_DELIMITER)];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(CSV_DELIMITER));
  return UTF8_BOM + lines.join("\n");
}

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').ValidationResult}
 */
function validate(envelope) {
  const errors = [...requireFields(envelope, ["exportId", "dayId"]), ...checkSchemaVersion(envelope, SUPPORTED_SCHEMA_VERSIONS)];
  return { valid: errors.length === 0, errors };
}

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {{exportId: string, files: Record<string,string>}}
 */
function transform(envelope) {
  const entriesCsv = toCsv(
    ["time", "type", "text"],
    envelope.entries.map((e) => ({ time: e.time, type: e.type, text: e.text }))
  );
  const timeEntriesCsv = toCsv(
    ["ordre", "dato", "fraTid", "tilTid", "arbeidsbeskrivelse"],
    envelope.timeEntries.map((t) => ({
      ordre: t.ordre,
      dato: t.dato,
      fraTid: t.fraTid,
      tilTid: t.tilTid,
      arbeidsbeskrivelse: (t.arbeidsbeskrivelse || []).join(" | "),
    }))
  );
  const machineHoursCsv = toCsv(["ordre", "maskintype", "timer"], envelope.machineHours);

  return {
    exportId: envelope.exportId,
    files: {
      "entries.csv": entriesCsv,
      "time_entries.csv": timeEntriesCsv,
      "machine_hours.csv": machineHoursCsv,
    },
  };
}

/**
 * @param {{exportId: string, files: Record<string,string>}} payload
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {Promise<Object>}
 */
async function send(payload, envelope) {
  console.log(`[CsvAdapter] SIMULERT UPLOAD -> ${MOCK_ENDPOINT}`);
  console.log(`[CsvAdapter] payload.exportId=${payload.exportId} files=${Object.keys(payload.files).join(", ")}`);
  return {
    status: 201,
    body: { receiptId: "csv_" + envelope.exportId, filesReceived: Object.keys(payload.files).length },
  };
}

/**
 * @param {{status:number, body:{receiptId:string, filesReceived:number}}} rawResponse
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').AdapterResult}
 */
function handleResponse(rawResponse, envelope) {
  const ok = rawResponse.status >= 200 && rawResponse.status < 300;
  return {
    ok,
    stage: "handleResponse",
    adapterName: "csv",
    exportId: envelope.exportId,
    response: ok ? rawResponse.body : undefined,
    error: ok ? undefined : `CSV receiver responded with status ${rawResponse.status}`,
  };
}

/**
 * Number of data rows in a CSV string produced by toCsv() (header
 * excluded). Exported for contract testing's "no data loss" check —
 * lib/regression/adapter-contract.mjs has no other way to know how many
 * records survived transform() without understanding this adapter's own
 * output format.
 * @param {string} csv
 * @returns {number}
 */
export function countCsvRows(csv) {
  return Math.max(0, csv.split("\n").length - 1);
}

export const CsvAdapter = { name: "csv", validate, transform, send, handleResponse };
