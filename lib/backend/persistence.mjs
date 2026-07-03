/**
 * Phase A Del 2 — minimal, robust persistence. No database: atomic
 * single-file JSON storage, same "no unnecessary machinery" posture as
 * every prior mock/store in this codebase. Write-to-temp-then-rename is
 * atomic on the same volume on both POSIX and Windows (NTFS), so a
 * crash mid-write can never leave a half-written state file — the
 * rename either lands or it doesn't, there's no partial state.
 *
 * This module knows nothing about Runtime/export/telemetry shapes — it
 * is a plain load/save-a-JSON-blob primitive. lib/backend/state.mjs
 * owns what goes inside the blob.
 */
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.PUNCHOUT_DATA_DIR || path.join(process.cwd(), ".data");
const STATE_FILE = path.join(DATA_DIR, "backend-state.json");

/**
 * Execution Sprint 1 Oppgave 2: tracks the outcome of the last write, so
 * /api/health can report real persistence status instead of just
 * assuming success — persistState() already catches and logs write
 * failures (e.g. disk full), but until now nothing surfaced that
 * anywhere queryable.
 * @type {{lastWriteAt: string|null, lastWriteOk: boolean|null, lastError: string|null}}
 */
const writeStatus = { lastWriteAt: null, lastWriteOk: null, lastError: null };

export function getPersistenceHealth() {
  return { ...writeStatus };
}

/** @returns {any|null} parsed contents, or null if the file doesn't exist or is unreadable */
export function loadPersistedState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("[persistence] failed to load " + STATE_FILE + ", starting from empty state:", e?.message || e);
    return null;
  }
}

/** @param {any} snapshot plain-JSON-serializable state */
export function persistState(snapshot) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpFile = STATE_FILE + ".tmp";
    fs.writeFileSync(tmpFile, JSON.stringify(snapshot));
    fs.renameSync(tmpFile, STATE_FILE); // atomic on the same volume
    writeStatus.lastWriteAt = new Date().toISOString();
    writeStatus.lastWriteOk = true;
    writeStatus.lastError = null;
  } catch (e) {
    writeStatus.lastWriteAt = new Date().toISOString();
    writeStatus.lastWriteOk = false;
    writeStatus.lastError = e?.message || String(e);
    console.error("[persistence] failed to persist state:", e?.message || e);
  }
}

export function stateFilePath() {
  return STATE_FILE;
}
