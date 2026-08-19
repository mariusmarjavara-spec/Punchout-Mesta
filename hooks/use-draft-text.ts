"use client";

import { useEffect, useRef, useState } from "react";
// @ts-ignore
import { readDraft, writeDraft } from "@/lib/pilot-ux/draft-storage.mjs";

/**
 * Hotfix Sprint, Hotfix 3 — root cause (verified against
 * components/punchout/operations-phase.tsx before writing this):
 * `inputText` (the manual log-entry text box) is a plain React `useState`,
 * never written to localStorage. A refresh, accidental tab close, or
 * crash silently discards anything typed but not yet submitted, with no
 * warning anywhere in the codebase (no `beforeunload` handler exists).
 *
 * Fix scope, deliberately minimal ("ikke lag et nytt lagringssystem"):
 * one more localStorage key, written debounced (same 250ms pattern
 * already used in start-day-phase.tsx's SchemaEditOverlay for the same
 * reason — avoid a write per keystroke), read once on mount to restore
 * a draft. This is autosave/draft-lagring, not a warning dialog —
 * chosen over `beforeunload` because a confirmation dialog is easy for
 * exactly the least digitally confident users (already identified in
 * prior reports as the ones this scenario hits hardest) to dismiss
 * without understanding, while a silently-restored draft requires no
 * interaction or understanding at all to work.
 *
 * Does not touch motor.js — this is a second, independent localStorage
 * key in the React layer only, entirely separate from the DayLog motor.js
 * itself persists.
 *
 * @param {string} storageKey
 */
export function useDraftText(storageKey: string): [string, (value: string) => void, () => void] {
  const [value, setValueState] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore a saved draft once, on mount.
  useEffect(() => {
    const saved = readDraft(window.localStorage, storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores a persisted draft so a refresh cannot silently discard typed text
    if (saved) setValueState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setValue(next: string) {
    setValueState(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => writeDraft(window.localStorage, storageKey, next), 250);
  }

  function clear() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setValueState("");
    writeDraft(window.localStorage, storageKey, "");
  }

  return [value, setValue, clear];
}
