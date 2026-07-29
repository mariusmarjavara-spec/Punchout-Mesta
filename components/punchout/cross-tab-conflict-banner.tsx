"use client";

import { AlertCircle } from "lucide-react";

/**
 * Hotfix Sprint, Hotfix 1. Shown the moment another tab/window writes to
 * the same day-log storage (see hooks/use-cross-tab-conflict.ts for the
 * detection mechanism and root-cause detail). Deliberately does not block
 * anything and does not attempt to merge — reloading already resolves to
 * the latest state via motor.js's existing loadFromStorage(), the same
 * way single-tab usage always has. This is "varsling" (the fix's first
 * priority), not a new save/merge system.
 */
export function CrossTabConflictBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="sticky top-0 z-50 border-b-2 border-destructive bg-destructive/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-destructive">
            Denne dagen er også åpen et annet sted
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            En annen fane eller enhet skrev nettopp til den samme dagsloggen. Det du gjør her
            kan bli overskrevet, eller kan overskrive det som skjedde der. Last inn siden på
            nytt for å se nyeste versjon før du fortsetter.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => window.location.reload()}
              type="button"
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-all active:scale-95"
            >
              Last inn på nytt
            </button>
            <button
              onClick={onDismiss}
              type="button"
              className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-all active:scale-95"
            >
              Jeg fortsetter her likevel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
