"use client";

import { useEffect, useState } from "react";
// @ts-ignore
import { isCrossTabConflictEvent } from "@/lib/pilot-ux/cross-tab-conflict.mjs";

/**
 * Hotfix Sprint, Hotfix 1 — cross-tab/device conflict detection.
 *
 * Root cause (verified against public/motor.js before writing this):
 * saveCurrentDay() (motor.js:904-921) writes the ENTIRE {appState, dayLog}
 * object to localStorage on every mutation, with no version field, no
 * conflict check, and no cross-tab sync of any kind (no `storage` listener,
 * no BroadcastChannel exist anywhere in motor.js). dayLog.version
 * (motor.js:938-939) is a one-time schema-migration default, set once and
 * never incremented — it is not a revision counter and cannot be reused
 * for this. Two tabs/devices open on the same day: whichever writes last
 * silently overwrites the other's entire in-memory delta, with zero
 * warning to either tab.
 *
 * Fix scope, deliberately minimal (motor.js is frozen, no CRDT/merge):
 * the browser's native `storage` event already fires in every OTHER tab
 * whenever localStorage changes in one tab (never in the tab that made
 * the write) — this is a plain browser API, requires zero changes to
 * motor.js's write path. Listening to it gives real, reliable conflict
 * DETECTION (another context just wrote to the same day-log storage key)
 * for free. This hook only detects and reports; it never blocks a write
 * or attempts to merge — reloading (which the banner offers as its one
 * action) already picks up the latest state via loadFromStorage(), the
 * same way single-tab usage always has.
 *
 * The storage key ("yournal_current_day", lib/pilot-ux/cross-tab-conflict.mjs)
 * is hardcoded there because motor.js does not expose it on window.Motor —
 * mirrors motor.js:6 exactly. If motor.js is ever unfrozen and this key
 * renamed, that file must be updated too; there is no way to import it
 * while motor.js stays frozen.
 */
export function useCrossTabConflict(): { conflictDetected: boolean; dismiss: () => void } {
  const [conflictDetected, setConflictDetected] = useState(false);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      // A `storage` event for this key only ever fires for a write made by
      // ANOTHER tab/window — the browser never dispatches it back to the
      // tab that made the write itself.
      if (isCrossTabConflictEvent(event.key)) setConflictDetected(true);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { conflictDetected, dismiss: () => setConflictDetected(false) };
}
