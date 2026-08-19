/**
 * Retention means age, not entry count.
 *
 * Founder decision 2026-08-19: when a data type has a retention of N days, age
 * is the hard upper bound. A minimum entry count may apply inside the window;
 * it may not override it.
 *
 * The behaviour this replaces looked reasonable and was not. `keepMinimum: 200`
 * kept the most recent 200 entries regardless of age, and a log shorter than
 * 200 returned early without pruning at all — so `{keepDays: 90, keepMinimum:
 * 200}` meant "90 days" in a busy deployment and "forever" in a quiet one. Every
 * low-volume pilot was in the second case, holding deviceId-linked records
 * indefinitely while the configuration said ninety days.
 *
 * The low-volume case is the one that matters here, because it is the one the
 * old early-return made unreachable.
 */

import { pruneLogInPlace } from "../backend/state.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

/** @param {number} daysAgo */
function at(daysAgo) {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

/** Entries in chronological order, oldest first, as the real logs are appended. */
function logOf(...daysAgoList) {
  return daysAgoList.map((d, i) => ({ receivedAt: at(d), id: "e" + i }));
}

export function runRetentionTimeBoundChecks() {
  const results = [];
  const check = (id, ok, detail) =>
    results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const RETENTION = { keepDays: 90, keepMinimum: 200 };

  // ── The case the old early-return made unreachable ────────────────────────
  {
    const log = logOf(400, 300, 200, 120); // four entries, all far past 90 days
    pruneLogInPlace(log, "receivedAt", RETENTION);
    check(
      "retention_prunes_old_entries_below_keep_minimum",
      log.length === 0,
      { remaining: log.length, detail: "a short log was never pruned at all" },
    );
  }

  // ── Age wins over the count floor ─────────────────────────────────────────
  {
    const log = logOf(400, 300, 10, 2); // two ancient, two recent
    pruneLogInPlace(log, "receivedAt", RETENTION);
    check(
      "retention_keeps_only_entries_inside_the_window",
      log.length === 2 && log.every((e) => Date.now() - new Date(e.receivedAt).getTime() < 90 * DAY_MS),
      { remaining: log.map((e) => e.receivedAt) },
    );
  }

  // ── It must not delete things it has no reason to ─────────────────────────
  {
    const log = logOf(89, 45, 1);
    pruneLogInPlace(log, "receivedAt", RETENTION);
    check("retention_keeps_everything_inside_the_window", log.length === 3, { remaining: log.length });
  }

  {
    const log = logOf(1, 0);
    pruneLogInPlace(log, "receivedAt", RETENTION);
    check("retention_leaves_a_fresh_log_untouched", log.length === 2, { remaining: log.length });
  }

  // ── Boundary ──────────────────────────────────────────────────────────────
  {
    const log = logOf(91, 89);
    pruneLogInPlace(log, "receivedAt", RETENTION);
    check(
      "retention_boundary_is_the_configured_day_count",
      log.length === 1,
      { remaining: log.map((e) => e.receivedAt) },
    );
  }

  // ── Unparseable timestamps ────────────────────────────────────────────────
  // Retention is the wrong place to give something the benefit of the doubt:
  // an entry that cannot be shown to be inside the window is not inside it.
  {
    const log = [{ receivedAt: "not-a-date", id: "x" }, { receivedAt: at(1), id: "y" }];
    pruneLogInPlace(log, "receivedAt", RETENTION);
    check(
      "retention_drops_entries_with_an_unreadable_timestamp",
      log.length === 1 && log[0].id === "y",
      { remaining: log.map((e) => e.id) },
    );
  }

  // ── In-place contract ─────────────────────────────────────────────────────
  // Both logs are `export const`, so callers hold the array reference. Pruning
  // has to mutate rather than replace, or every holder keeps the old contents.
  {
    const log = logOf(400, 1);
    const sameReference = log;
    pruneLogInPlace(log, "receivedAt", RETENTION);
    check(
      "retention_mutates_the_array_callers_already_hold",
      sameReference === log && sameReference.length === 1,
      { length: sameReference.length },
    );
  }

  return results;
}
