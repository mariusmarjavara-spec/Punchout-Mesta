/**
 * Punchout data invariants — the authoritative invariant → regression mapping.
 *
 * docs/DATA_INVARIANTS.md states the ten contracts in prose. This file states
 * which regression cases actually protect each one, as data rather than prose,
 * so it can be checked instead of believed.
 *
 * Two failures are caught here, and both are the kind that ages a document into
 * fiction:
 *
 *   1. An invariant with no covering case — a promise nothing tests.
 *   2. A named case that no longer exists — coverage lost to a rename or a
 *      deletion, which is silent in every other reading of the suite.
 *
 * The mapping deliberately names EXISTING cases rather than adding parallel
 * ones. The behaviour was already covered; what was missing was the ability to
 * say which contract a given red test breaks.
 */

/**
 * @typedef {Object} InvariantDefinition
 * @property {string} id           Stable identifier, referenced from docs and commits.
 * @property {string} statement    What must remain true, in one sentence.
 * @property {string[]} coveredBy  Regression case ids that protect it.
 */

/** @type {InvariantDefinition[]} */
export const DATA_INVARIANTS = [
  {
    id: "INV-DATA-01",
    statement:
      "If Punchout reports an action as completed, its state is persisted or the user receives an explicit storage failure.",
    coveredBy: [
      "char_totally_unwritable_storage_surfaces_a_save_error",
      "char_corrupt_current_day_blocks_with_a_storage_error_instead_of_crashing",
    ],
  },
  {
    id: "INV-DATA-02",
    statement:
      "Refreshing or reopening restores the last successfully persisted active workday, including overlay state.",
    coveredBy: [
      "char_schema_edit_overlay_state_is_persisted_for_refresh",
      "char_refresh_after_lock_stays_locked_and_does_not_re_export",
    ],
  },
  {
    id: "INV-DATA-03",
    statement: "A locked workday cannot be altered through normal workflow commands.",
    coveredBy: [
      "char_lock_archives_the_day_to_history_and_clears_overlay_state",
      "char_refresh_after_lock_stays_locked_and_does_not_re_export",
    ],
  },
  {
    id: "INV-DATA-04",
    statement:
      "Starting a new day never destroys the previous day before it is retained in history or export custody.",
    coveredBy: [
      "char_discard_stale_day_archives_before_wiping",
      "char_starting_a_new_day_over_a_stale_one_replaces_it_without_archiving",
      "char_reclaim_never_discards_unsent_exports",
    ],
  },
  {
    id: "INV-DATA-05",
    statement:
      "Corrupted storage fails visibly, avoids destructive overwrite, and offers a recovery action.",
    coveredBy: [
      "char_corrupt_current_day_blocks_with_a_storage_error_instead_of_crashing",
      "char_try_ignore_error_removes_the_corrupt_blob_so_it_cannot_re_block",
      "char_corrupt_history_degrades_silently_and_never_blocks_the_day",
    ],
  },
  {
    id: "INV-DATA-06",
    statement:
      "Unresolved items are handled before lock, enforced by lockDay() independently of the UI.",
    coveredBy: [
      "char_lock_is_blocked_until_every_item_is_resolved_and_main_time_handled",
      "char_a_force_skipped_required_schema_appears_in_handrens",
      "char_force_skipped_pre_day_schema_blocks_lock_until_resolved",
      "char_confirming_a_schema_with_missing_required_fields_is_refused_in_handrens_too",
    ],
  },
  {
    id: "INV-DATA-07",
    statement: "Repeated lock attempts do not duplicate history, exports or side effects.",
    coveredBy: [
      "char_end_day_is_idempotent_and_only_recomputes_ready_to_lock",
      "char_refresh_after_lock_stays_locked_and_does_not_re_export",
    ],
  },
  {
    id: "INV-DATA-08",
    statement: "Retrying the same export does not produce duplicate logical records downstream.",
    coveredBy: [
      "relay_csv_redelivery_is_an_idempotent_no_op",
      "char_refresh_after_lock_stays_locked_and_does_not_re_export",
    ],
  },
  {
    id: "INV-DATA-09",
    statement: "Fields marked as the user's responsibility are never silently auto-filled.",
    coveredBy: [
      "char_confirm_start_time_is_write_once_for_user_source",
      "char_confirm_start_time_rejects_malformed_input_and_uses_now",
    ],
  },
  {
    id: "INV-DATA-10",
    statement:
      "No background callback, voice result or reload crosses a lifecycle boundary without the state remaining recoverable and explainable.",
    coveredBy: [
      "char_stale_day_is_detected_purely_from_the_stored_date",
      "char_continue_stale_day_keeps_the_old_date_and_all_its_content",
      "char_end_stale_day_runs_the_normal_end_of_day_flow",
    ],
  },
];

/**
 * Checks that every invariant is covered and every named case still exists.
 *
 * @param {Iterable<string>} knownCaseIds every case id the suite actually ran
 * @returns {{ passed: boolean, failures: string[], covered: number }}
 */
export function checkInvariantCoverage(knownCaseIds) {
  const known = new Set(knownCaseIds);
  const failures = [];

  for (const invariant of DATA_INVARIANTS) {
    if (invariant.coveredBy.length === 0) {
      failures.push(`${invariant.id} has no covering regression case`);
      continue;
    }
    for (const caseId of invariant.coveredBy) {
      if (!known.has(caseId)) {
        // A rename or deletion silently removes protection everywhere else.
        // Here it is loud.
        failures.push(
          `${invariant.id} names case "${caseId}", which no longer exists — coverage was lost, not moved`,
        );
      }
    }
  }

  const ids = DATA_INVARIANTS.map((i) => i.id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  for (const dup of new Set(duplicates)) {
    failures.push(`duplicate invariant id: ${dup}`);
  }

  return { passed: failures.length === 0, failures, covered: DATA_INVARIANTS.length };
}
