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

// Independent-review finding PO-03 (2026-08-14): README documents
// PUNCHOUT_DATA_DIR as required in production, but nothing enforced that —
// an unset var silently fell back to `.data` under the working directory,
// which is not durable storage on most hosts (Fly's own ephemeral
// container filesystem included). A misconfigured production deploy could
// run, look healthy, and lose every write on the next restart with no
// error anywhere. Fail fast instead: refuse to even construct the state
// file path when NODE_ENV=production and the var is genuinely unset. The
// `.data` fallback remains for local dev/test, where PUNCHOUT_DATA_DIR is
// legitimately never set.
// Post-pilot baseline finding: the guard below is correct about STARTING, but
// it also fired during `next build`. Next.js sets NODE_ENV=production for the
// build itself, and its page-data collection step imports every Route Handler
// module — so this threw for /api/runtime/*, /api/devices/* and
// /api/operations-center, and `npm run build` failed with "Failed to collect
// page data". That broke the Dockerfile's own builder stage (which sets
// PUNCHOUT_DATA_DIR only in the runner stage) and CI's "Production build" step
// (which never sets it at all), i.e. the repository could not produce a
// deployable artifact by any documented path. Verified by reproducing the
// failure and confirming the build succeeds with the variable set.
//
// A build is not a start: nothing is served and no state is read or written.
// NEXT_PHASE === "phase-production-build" is Next's own signal for exactly
// this window (set in next/dist/build/index.js), so scoping the guard past it
// unbreaks the build while leaving the real property intact — a server that
// actually boots with NODE_ENV=production and no data directory still fails
// fast, which lib/regression/backend-persistence.mjs's
// production_without_data_dir_fails_fast case continues to prove.
const IS_NEXT_BUILD = process.env.NEXT_PHASE === "phase-production-build";

if (process.env.NODE_ENV === "production" && !process.env.PUNCHOUT_DATA_DIR && !IS_NEXT_BUILD) {
  throw new Error(
    "PUNCHOUT_DATA_DIR is required when NODE_ENV=production — refusing to start with an ephemeral, " +
      "non-durable working-directory fallback for backend state. Set PUNCHOUT_DATA_DIR to a real, " +
      "persistent volume path (see fly.toml's own PUNCHOUT_DATA_DIR=\"/data\" for the production value).",
  );
}

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
