"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";

interface StaleDayBannerProps {
  date: string;
  motor: NonNullable<typeof window.Motor>;
}

/**
 * StaleDayBanner - Shown when the app opens with data from a previous day.
 *
 * Non-blocking, but no silent dismiss: the user must pick one of the 3 real actions
 * (continue/end/discard) — Execution Sprint 3, Oppgave 6. The report found the previous "X"
 * dismiss resolved nothing (no motor call), just hid the banner until the next reload, when
 * it would reappear — an unresolved state the user could easily mistake for a resolved one.
 * Motor detects stale day via isStaleDay(), React projects it here.
 */
export function StaleDayBanner({ date, motor }: StaleDayBannerProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const formattedDate = (() => {
    try {
      return new Date(date).toLocaleDateString("no-NO", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return date;
    }
  })();

  if (showDiscardConfirm) {
    return (
      <div className="sticky top-0 z-50 border-b-2 border-destructive bg-destructive/10 px-4 py-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-destructive">
              Forkast dagen {formattedDate}?
            </p>
            {/*
              Operation Punchout Field Trial — Prism finding TR-01 (commitment
              without trust, fired for 5 of 6 field personas at this exact step;
              notably NOT for the founder profile, whose high baseline trust
              clears the threshold — i.e. the founder would never have felt
              this).
              This text used to read "All data fra denne dagen vil gå tapt.
              Dette kan ikke angres." That was FACTUALLY WRONG:
              discardStaleDay() calls pushToHistory() BEFORE clearing the day,
              precisely so that a discard never destroys a confirmed SJA or
              RUH. The app was frightening workers away from the correct action
              with a false claim about their own data. Corrected to what the
              code actually does.
            */}
            <p className="text-sm text-muted-foreground mt-1">
              Dagen fjernes fra skjermen og arkiveres i historikken. Skjema du allerede har bekreftet
              (for eksempel SJA eller RUH) blir tatt vare på — men dagen kan ikke gjenopptas eller sendes inn.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => motor.discardStaleDay()}
                type="button"
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-all active:scale-95"
              >
                Ja, forkast
              </button>
              <button
                onClick={() => setShowDiscardConfirm(false)}
                type="button"
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-all active:scale-95"
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-50 border-b border-accent bg-accent/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          {/*
            "ulagret data" was also inaccurate and trust-eroding in the same
            way: the day IS saved on the phone (that is why it survived until
            now) — it simply was never finished. Saying "unsaved" tells the
            least-confident worker their work is at risk when it is not.
          */}
          <p className="font-medium text-foreground">
            Du har en dag som ikke ble avsluttet — {formattedDate}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Alt du registrerte er lagret på telefonen.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => motor.continueStaleDay()}
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-all active:scale-95"
            >
              Fortsett dagen
            </button>
            <button
              onClick={() => motor.endStaleDay()}
              type="button"
              className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-all active:scale-95"
            >
              Avslutt dagen
            </button>
            <button
              onClick={() => setShowDiscardConfirm(true)}
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:text-destructive active:scale-95"
            >
              Forkast
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
