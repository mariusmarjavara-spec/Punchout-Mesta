"use client";

import { useState, useRef, useEffect } from "react";
import { useMotorState, useMotor, Entry, type ParsedEntry } from "@/hooks/use-motor-state";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useDraftText } from "@/hooks/use-draft-text";
// @ts-ignore
import { shouldAllowSubmit } from "@/lib/pilot-ux/submit-guard.mjs";
import { VoiceButton } from "./voice-button";
import { cn } from "@/lib/utils";
// @ts-ignore
import { describeLockReason } from "@/lib/pilot-ux/lock-reason.mjs";
// @ts-ignore
import { deriveSyncStatus } from "@/lib/pilot-ux/sync-status.mjs";
// @ts-ignore
import { logUxEvent } from "@/lib/telemetry/ux-events.mjs";
import {
  Clock,
  FileText,
  Coffee,
  Gauge,
  AlertCircle,
  Radio,
  Wrench,
  ChevronDown,
  Check,
  X,
  CloudOff,
  RefreshCw,
} from "lucide-react";

/**
 * OperationsPhase - Active work phase
 *
 * IMPORTANT: This component is a PURE PROJECTION of motor state.
 * - Reads entries from dayLog.entries (motor state)
 * - Calls motor.submitEntry() for new entries
 * - Calls motor.endDay() to end the day
 * - NO local business state
 */

const LOG_TYPE_INFO: Record<string, { icon: typeof FileText; label: string; color: string }> = {
  notat: { icon: FileText, label: "Notat", color: "bg-secondary" },
  vaktlogg: { icon: Radio, label: "Vaktlogg", color: "bg-accent" },
  friksjon: { icon: Gauge, label: "Friksjon", color: "bg-chart-4" },
  pause: { icon: Coffee, label: "Pause", color: "bg-muted" },
  ordre: { icon: Wrench, label: "Ordre", color: "bg-primary" },
  hendelse: { icon: AlertCircle, label: "Hendelse", color: "bg-destructive" },
};

export function OperationsPhase() {
  const dayLog = useMotorState('dayLog');
  const isListening = useMotorState('isListening');
  const voiceState = useMotorState('voiceState');
  const voiceError = useMotorState('voiceError');
  const voiceSupported = useMotorState('voiceSupported');
  const editingIndex = useMotorState('editingIndex');
  const outboxStatus = useMotorState('outboxStatus');
  const motor = useMotor();
  const isOnline = useOnlineStatus();
  // Execution Sprint 3, Oppgave 3: outboxStatus was already live in MotorSnapshot but never
  // rendered anywhere during active work — the report found this made sync entirely invisible.
  const syncStatus = deriveSyncStatus(outboxStatus, isOnline);

  // UI-only state (not business logic)
  // Hotfix Sprint, Hotfix 3: draft-autosaved (debounced, separate localStorage key from the
  // DayLog motor.js persists) so a refresh/crash/accidental tab close doesn't silently discard
  // typed-but-unsubmitted text — see hooks/use-draft-text.ts for the full root-cause writeup.
  const [inputText, setInputText, clearInputDraft] = useDraftText("punchout_draft_input");
  const [selectedType, setSelectedType] = useState<string>("notat");
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  // Hotfix Sprint, Hotfix 4: same in-flight guard pattern already used by handleEndDay/
  // handleContinue/handleLock (isEnding/isContinuing/isLocking) — handleSubmitEntry had none,
  // so two rapid taps on "Logg" before React re-renders (clearing inputText) could both call
  // motor.submitEntry() with the same text, creating a duplicate entry. Reused, not reinvented.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingEndDay, setConfirmingEndDay] = useState(false);
  const [editText, setEditText] = useState("");
  const [pendingReview, setPendingReview] = useState<{ text: string; type: string; parsed: ParsedEntry } | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [customTime, setCustomTime] = useState("");
  // Execution Sprint 3, Oppgave 2: which locked entry's "why locked + correct" panel is open.
  // UI-only view state, not a motor concept — the correction itself is a plain new entry
  // submitted through motor.submitEntry(), never a mutation of the locked one.
  const [correctingIndex, setCorrectingIndex] = useState<number | null>(null);
  // Execution Sprint 3, Oppgave 4: tale (Web Speech API) requires network — motor.js only
  // discovers this reactively via recognition.onerror's "network" case, after the mic already
  // opened. This pre-flight check avoids that round-trip when we already know we're offline.
  const [voiceBlockedByOffline, setVoiceBlockedByOffline] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the offline voice block when connectivity returns; isOnline is external state
    if (isOnline) setVoiceBlockedByOffline(false);
  }, [isOnline]);

  // Get entries from motor (READ-ONLY)
  const entries = dayLog?.entries || [];

  // Format time helper
  const formatTime = (time: string) => time || "?";

  // Handle submit: parse first, show mini-review if structured
  const handleSubmitEntry = () => {
    if (!shouldAllowSubmit(isSubmitting, inputText)) return;
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 500);
    const text = inputText.trim();

    // Try structured parse
    const parsed = motor?.parseEntry(text);
    if (parsed) {
      // Structured data detected — show mini-review
      setPendingReview({ text, type: selectedType, parsed });
      return;
    }

    // No structure — raw submit
    motor?.submitEntry(text, selectedType);
    clearInputDraft();
  };

  // Confirm structured entry from mini-review
  // UX & Stability Hardening Review: motor.confirmStructuredEntry() unconditionally pushes a
  // new dayLog entry on every call (public/motor.js:4563+, verified) — same non-idempotent
  // shape as the plain submitEntry() path Hotfix 4 already guarded. This handler had no
  // isSubmitting guard, so two rapid taps on "Bekreft" before React removes the mini-review
  // card could log the same ordre-line twice. Reuses the exact isSubmitting state/timing
  // already declared above for handleSubmitEntry — no new pattern introduced.
  const handleConfirmReview = () => {
    if (!pendingReview || !shouldAllowSubmit(isSubmitting, pendingReview.text)) return;
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 500);
    motor?.confirmStructuredEntry(pendingReview.text, pendingReview.type, pendingReview.parsed);
    setPendingReview(null);
    clearInputDraft();
  };

  // Cancel mini-review (keep text in input)
  const handleCancelReview = () => {
    setPendingReview(null);
    logUxEvent("ManualCancel", { context: "structured_entry_review" });
  };

  // Skip review and submit as raw entry — same double-submit gap and fix as handleConfirmReview.
  const handleSubmitRaw = () => {
    if (!pendingReview || !shouldAllowSubmit(isSubmitting, pendingReview.text)) return;
    setIsSubmitting(true);
    setTimeout(() => setIsSubmitting(false), 500);
    motor?.submitEntry(pendingReview.text, pendingReview.type);
    setPendingReview(null);
    clearInputDraft();
  };

  // Handle end day via motor
  const handleEndDay = () => {
    if (isEnding) return;
    setIsEnding(true);
    motor?.endDay();
    setTimeout(() => setIsEnding(false), 500);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Dagslogg
              </p>
              <p className="text-xs text-muted-foreground">
                {dayLog?.startTime ? `Startet ${formatTime(dayLog.startTime)}` : "Starttid ikke satt"}
              </p>
            </div>
          </div>
          {syncStatus !== "synced" && (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                syncStatus === "sync_failed"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {syncStatus === "sync_failed" ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : syncStatus === "offline_pending" ? (
                <CloudOff className="h-3.5 w-3.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncStatus === "sync_failed" ? "Synkfeil" : syncStatus === "offline_pending" ? "Lagret lokalt" : "Synkroniserer…"}
            </div>
          )}
        </div>

        {/*
          Operation Punchout Field Trial — Prism: the low-digital-confidence
          persona was the ONLY profile to cross its friction/degradation ceiling,
          and it did so in the error-states scenario (0.36 >= 0.35). The failure
          mode for that worker is not abandoning the app — they cannot — it is
          quietly giving up on documenting properly because they believe it has
          stopped working. The status chip above already reports state
          accurately; what was missing was telling them their work is SAFE. One
          line, shown only when relevant, claiming only what the local outbox
          actually guarantees.
        */}
        {(syncStatus === "offline_pending" || syncStatus === "sync_failed") && (
          <p className="mt-1 text-xs text-muted-foreground">
            {syncStatus === "offline_pending"
              ? "Alt du registrerer lagres på telefonen og sendes automatisk når du får dekning."
              : "Sendingen feilet, men arbeidet ditt er lagret på telefonen. Punchout prøver igjen automatisk."}
          </p>
        )}
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col">
        {/* Start time prompt — shown until user confirms */}
        {dayLog?.startTimeSource === "pending" && (
          <div className="mx-4 mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground mb-2">Når startet du?</p>
            {!showTimePicker ? (
              <div className="flex gap-2">
                <button
                  onClick={() => motor?.confirmStartTime()}
                  type="button"
                  className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98]"
                >
                  Nå
                </button>
                <button
                  onClick={() => setShowTimePicker(true)}
                  type="button"
                  className="rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-all active:scale-[0.98]"
                >
                  Annen tid...
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  autoFocus
                  className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => {
                    motor?.confirmStartTime(customTime || undefined);
                    setShowTimePicker(false);
                  }}
                  type="button"
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98]"
                >
                  OK
                </button>
                <button
                  onClick={() => setShowTimePicker(false)}
                  type="button"
                  className="rounded-lg bg-secondary px-3 py-2.5 text-sm text-muted-foreground transition-all active:scale-[0.98]"
                >
                  Avbryt
                </button>
              </div>
            )}
          </div>
        )}

        {/* Voice button area */}
        <div className="flex flex-col items-center gap-4 py-8">
          <VoiceButton
            isListening={voiceState === "listening"}
            onClick={() => {
              if (voiceState !== "listening" && !isOnline) {
                setVoiceBlockedByOffline(true);
                logUxEvent("VoiceBlockedOffline", { screen: "operations" });
                return;
              }
              setVoiceBlockedByOffline(false);
              motor?.toggleVoice();
            }}
            label={
              voiceState === "listening" ? "Lytter..." :
              voiceState === "processing" ? "Behandler..." :
              "Loggfør"
            }
            size="lg"
            disabled={!voiceSupported || voiceState === "processing"}
            className="bg-green-600 hover:bg-green-700"
          />
          {voiceBlockedByOffline ? (
            <p className="text-sm text-destructive">Tale krever nettforbindelse. Skriv i stedet.</p>
          ) : voiceState === "error" && voiceError ? (
            <p className="text-sm text-destructive">{voiceError}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Trykk for å logge hendelse, notat, eller ordre
            </p>
          )}
        </div>

        {/* Text input fallback */}
        <div className="px-4 mb-6">
          <div className="flex gap-2">
            {/* Type selector */}
            <div className="relative">
              <button
                onClick={() => setShowTypeSelector(!showTypeSelector)}
                type="button"
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm"
              >
                {LOG_TYPE_INFO[selectedType]?.label || selectedType}
                <ChevronDown className="h-4 w-4" />
              </button>
              {showTypeSelector && (
                <div className="absolute top-full left-0 mt-1 w-40 rounded-lg border border-border bg-card shadow-lg z-10">
                  {Object.entries(LOG_TYPE_INFO).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedType(key);
                        setShowTypeSelector(false);
                      }}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <info.icon className="h-4 w-4" />
                      {info.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Text input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitEntry()}
              placeholder="Skriv loggføring..."
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {/* Submit button */}
            <button
              onClick={handleSubmitEntry}
              disabled={!inputText.trim() || isSubmitting}
              type="button"
              className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Logg
            </button>
          </div>
        </div>

        {/* Mini-review card (structured entry verification) */}
        {pendingReview && (
          <div className="px-4 mb-4">
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Bekreft ordrelinje</span>
              </div>
              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ordre</span>
                  <span className="font-mono font-medium">{pendingReview.parsed.ordre}</span>
                </div>
                {pendingReview.parsed.fra && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tid</span>
                    <span className="font-medium">
                      {pendingReview.parsed.fra}{pendingReview.parsed.til ? ` – ${pendingReview.parsed.til}` : ""}
                    </span>
                  </div>
                )}
                {pendingReview.parsed.ressurser.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ressurser</span>
                    <span className="font-medium">{pendingReview.parsed.ressurser.join(", ")}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmReview}
                  disabled={isSubmitting}
                  type="button"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Bekreft
                </button>
                <button
                  onClick={handleSubmitRaw}
                  disabled={isSubmitting}
                  type="button"
                  className="rounded-lg bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  Bare logg
                </button>
                <button
                  onClick={handleCancelReview}
                  type="button"
                  className="rounded-lg bg-secondary px-3 py-2.5 text-sm text-muted-foreground transition-all active:scale-[0.98]"
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Log entries from motor */}
        <div className="flex-1 px-4 pb-24">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 text-muted-foreground">
                Ingen loggføringer ennå
              </p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Bruk mikrofonen eller skriv for å starte
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...entries].reverse().map((entry, reverseIdx) => {
                const realIndex = entries.length - 1 - reverseIdx;
                const typeInfo = LOG_TYPE_INFO[entry.type] || LOG_TYPE_INFO.notat;
                const Icon = typeInfo.icon;

                // An entry is "locked" (decided) if it has a confirmation/decision flag
                const isLocked = entry.type === "vaktlogg"
                  ? (entry.vaktloggConfirmed || entry.vaktloggDiscarded)
                  : entry.type === "hendelse"
                    ? !!entry.ruhDecision
                    : (entry.converted || entry.keptAsNote);

                const isEditing = editingIndex === realIndex;

                const lockReason = isLocked ? describeLockReason(entry) : null;
                const isCorrecting = isLocked && correctingIndex === realIndex;

                return (
                  <div
                    key={reverseIdx}
                    onClick={() => {
                      if (isEditing) return;
                      if (isLocked) {
                        setCorrectingIndex(correctingIndex === realIndex ? null : realIndex);
                        return;
                      }
                      setEditText(entry.text);
                      motor?.openEdit(realIndex);
                    }}
                    className={cn(
                      "rounded-xl border p-4 transition-all cursor-pointer active:scale-[0.99]",
                      isLocked
                        ? "border-border bg-muted/30 opacity-70"
                        : "border-border bg-card",
                      isEditing && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        typeInfo.color
                      )}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            "text-xs font-medium",
                            isLocked ? "text-muted-foreground/60" : "text-muted-foreground"
                          )}>
                            {typeInfo.label}
                            {isLocked && lockReason && (
                              <span className="ml-1.5 text-xs text-muted-foreground/50">
                                {lockReason.short}
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.time}
                          </span>
                        </div>
                        {isEditing ? (
                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              autoFocus
                              rows={2}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                type="button"
                                onClick={() => motor?.saveEdit(realIndex, editText)}
                                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                              >
                                <Check className="h-3 w-3" />
                                Lagre
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  motor?.cancelEdit();
                                  logUxEvent("ManualCancel", { context: "entry_edit" });
                                }}
                                className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground"
                              >
                                <X className="h-3 w-3" />
                                Avbryt
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className={cn(
                            "mt-1 text-sm break-words",
                            isLocked ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {entry.text}
                          </p>
                        )}
                        {isCorrecting && lockReason && (
                          <div
                            className="mt-2 rounded-lg bg-muted/60 p-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-xs text-muted-foreground">{lockReason.full}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Du kan ikke endre denne oppføringen, men du kan logge en rettelse som en ny oppføring.
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setInputText(`Rettelse til kl ${entry.time}: `);
                                setSelectedType("notat");
                                setCorrectingIndex(null);
                                logUxEvent("CorrectionAttempted", { originalEntryType: entry.type });
                              }}
                              className="mt-2 flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                            >
                              Logg rettelse
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 px-4 pt-4 backdrop-blur-sm [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
        {confirmingEndDay ? (
          <div className="space-y-2">
            <p className="text-center text-sm font-medium text-foreground">
              Avslutt og gå til håndrens?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleEndDay}
                disabled={isEnding}
                type="button"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-4 font-medium text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isEnding ? "Avslutter..." : "Ja, gå videre"}
              </button>
              <button
                onClick={() => setConfirmingEndDay(false)}
                type="button"
                className="flex flex-1 items-center justify-center rounded-xl bg-secondary py-4 font-medium text-secondary-foreground transition-all active:scale-[0.98]"
              >
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingEndDay(true)}
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary py-4 font-medium text-secondary-foreground transition-all active:scale-[0.98]"
          >
            Avslutt dag
          </button>
        )}
      </div>
    </div>
  );
}
