"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { VoiceButton } from "./voice-button";
// @ts-ignore — pure domain modules, no types package
import {
  acceptPrefill,
  acceptSuggestions,
  answerNothingToAdd,
  answerStep,
  currentStep,
  goBack,
  isReadyForReview,
  reviewSummary,
  reviseStep,
  startGuidedForm,
  toFieldProvenance,
  toSchemaFields,
} from "@/lib/guided-forms/engine.mjs";

/**
 * GUIDED FORM — one question at a time, on a phone.
 *
 * This component renders a projection. It holds no progression logic: the step
 * index, the answers and the follow-up queue all live in domain state that
 * Motor persists into dayLog, which is what lets a worker background the app
 * mid-SJA and come back to the same prompt.
 *
 * The consequence worth stating: `stepState` below is the ONLY state this
 * component owns beyond a text buffer, and every transition goes through the
 * pure engine and straight back to Motor. Animation is a CSS class keyed on
 * the step id — never a source of truth, and never something navigation waits
 * for. Field speed outranks decoration.
 */

interface GuidedFormProps {
  motor: any;
  flowId: "sja" | "ruh";
  schemaId: string | null;
  isListening: boolean;
  voiceError: string | null;
  onToggleVoice: () => void;
  /** Transcript arriving from motor; identical treatment to typed text. */
  voiceTranscript: string | null;
  onClose: () => void;
  onConfirmed: () => void;
}

export function GuidedForm({
  motor,
  flowId,
  schemaId,
  isListening,
  voiceError,
  onToggleVoice,
  voiceTranscript,
  onClose,
  onConfirmed,
}: GuidedFormProps) {
  const [stepState, setStepState] = useState<any>(null);
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);

  // Resume, or start. Persisted progress always wins over a fresh start —
  // that is the whole point of keeping it in dayLog.
  useEffect(() => {
    const saved = motor?.getGuidedFormState?.(flowId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores persisted domain progress; motor is not readable during SSR
    setStepState(
      saved ?? startGuidedForm(flowId, motor?.buildGuidedFormContext?.() ?? {}, { schemaId }),
    );
  }, [motor, flowId, schemaId]);

  const step = useMemo(() => (stepState ? currentStep(stepState) : null), [stepState]);
  const ready = useMemo(() => (stepState ? isReadyForReview(stepState) : false), [stepState]);
  const summary = useMemo(
    () => (stepState && (reviewing || ready) ? reviewSummary(stepState) : null),
    [stepState, reviewing, ready],
  );

  /** Every transition lands here, so persistence is not something to remember. */
  function commit(next: any) {
    setStepState(next);
    setDraft("");
    setPicked([]);
    motor?.setGuidedFormState?.(flowId, next);
  }

  // A transcript is text. Same pipeline, same semantics — section 14.
  useEffect(() => {
    if (voiceTranscript && step && !step.prefill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors an incoming transcript into the same buffer typing uses
      setDraft((current) => (current ? current + " " + voiceTranscript : voiceTranscript));
    }
  }, [voiceTranscript, step]);

  if (!stepState) return null;

  // ── Review ────────────────────────────────────────────────────────────────
  if (summary && (reviewing || (!step && ready))) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-5 p-5">
        <h2 className="text-2xl font-semibold">{summary.title}</h2>

        {summary.authored.map((row: any) => (
          <section key={row.stepId} className="space-y-1">
            <h3 className="text-sm font-medium text-muted-foreground">{row.label}</h3>
            <p className="text-base">{row.value}</p>
            <button
              onClick={() => {
                commit(reviseStep(stepState, row.stepId));
                setReviewing(false);
              }}
              className="min-h-[44px] text-sm underline"
            >
              Rediger
            </button>
          </section>
        ))}

        {summary.derived.length > 0 && (
          <section className="space-y-1 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium text-muted-foreground">Punchout fylte ut</h3>
            {summary.derived.map((row: any) => (
              <p key={row.stepId} className="text-base">
                {row.value}
              </p>
            ))}
          </section>
        )}

        {/* One surface, one confirmation — not one press per known fact. */}
        {summary.systemKnown.length > 0 && (
          <section className="space-y-1 rounded-lg bg-muted p-3">
            <h3 className="text-sm font-medium text-muted-foreground">Registrert automatisk</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {summary.systemKnown.map((row: any) => (
                <div key={row.key} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-4">
          <button
            onClick={() => {
              motor?.applyGuidedFormToSchema?.(
                schemaId,
                toSchemaFields(stepState),
                toFieldProvenance(stepState),
              );
              onConfirmed();
            }}
            disabled={!summary.readyForReview}
            className="min-h-[56px] rounded-lg bg-primary text-lg font-medium text-primary-foreground disabled:opacity-40"
          >
            Bekreft {summary.title}
          </button>
          <button onClick={onClose} className="min-h-[44px] text-sm underline">
            Lukk
          </button>
        </div>
      </div>
    );
  }

  if (!step) return null;

  const canSubmit = draft.trim().length > 0 || picked.length > 0;

  return (
    <div
      key={step.id}
      className="mx-auto flex min-h-[100dvh] max-w-md flex-col gap-4 p-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
    >
      {/* Unobtrusive: a thin bar, no numbers competing with the prompt. */}
      <div className="h-1 w-full rounded bg-muted" aria-hidden="true">
        <div
          className="h-1 rounded bg-primary transition-all duration-300"
          style={{ width: `${(step.progress.step / step.progress.total) * 100}%` }}
        />
      </div>

      <h2 className="text-2xl font-semibold leading-snug">{step.prompt}</h2>

      {step.hint.length > 0 && (
        <p className="text-sm text-muted-foreground">{step.hint.join(" · ")}</p>
      )}

      {/* An inference, shown as something to agree with rather than a filled box. */}
      {step.prefill && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Punchout oppfattet:</p>
          <p className="text-lg font-medium">{step.prefill.value}</p>
          <div className="flex gap-3">
            <button
              onClick={() => commit(acceptPrefill(stepState))}
              className="min-h-[56px] flex-1 rounded-lg bg-primary text-lg font-medium text-primary-foreground"
            >
              Stemmer
            </button>
            <button
              onClick={() => setDraft(step.prefill.value)}
              className="min-h-[56px] flex-1 rounded-lg border border-border text-lg"
            >
              Rediger
            </button>
          </div>
        </div>
      )}

      {/* Proposals for a judgement step. Nothing is selected by default. */}
      {step.suggestions.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm text-muted-foreground">Forslag — velg det som passer</legend>
          {step.suggestions.map((s: string) => {
            const on = picked.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(on ? picked.filter((p) => p !== s) : [...picked, s])}
                className={cn(
                  "min-h-[52px] w-full rounded-lg border px-4 text-left text-base",
                  on ? "border-primary bg-primary/10 font-medium" : "border-border",
                )}
              >
                {s}
              </button>
            );
          })}
        </fieldset>
      )}

      {!step.prefill && (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Skriv eller bruk tale"
            className="w-full rounded-lg border border-border p-3 text-base"
          />
          <div className="flex justify-center">
            <VoiceButton
              isListening={isListening}
              onClick={onToggleVoice}
              label="Snakk inn svaret"
              size="lg"
            />
          </div>
          {voiceError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {voiceError}
            </p>
          )}
        </>
      )}

      {/* The primary action sits above the fold and is never covered by the
          keyboard: it is in normal flow at the end of the column, not fixed. */}
      <div className="mt-auto flex flex-col gap-3 pt-4">
        {canSubmit && (
          <button
            onClick={() =>
              commit(
                picked.length > 0
                  ? acceptSuggestions(stepState, picked)
                  : answerStep(stepState, draft.trim()),
              )
            }
            className="min-h-[56px] rounded-lg bg-primary text-lg font-medium text-primary-foreground"
          >
            Neste
          </button>
        )}

        {step.allowsNothingToAdd && !canSubmit && (
          <button
            onClick={() => commit(answerNothingToAdd(stepState))}
            className="min-h-[56px] rounded-lg border border-border text-base"
          >
            {step.nothingToAddLabel}
          </button>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => commit(goBack(stepState))}
            className="min-h-[44px] flex-1 text-sm underline"
          >
            Tilbake
          </button>
          {ready && (
            <button
              onClick={() => setReviewing(true)}
              className="min-h-[44px] flex-1 text-sm underline"
            >
              Se oppsummering
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
