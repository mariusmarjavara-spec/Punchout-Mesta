"use client";

import { useMemo, useState, useEffect, useRef } from "react";


import { useMotorState, useMotor, Schema, UxState, DayLog } from "@/hooks/use-motor-state";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { VoiceButton } from "./voice-button";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, ExternalLink, FileText, X, Languages } from "lucide-react";
// @ts-ignore
import { getUnconfirmedRequiredSchemas } from "@/lib/pilot-ux/required-schemas.mjs";
// @ts-ignore
import { logUxEvent } from "@/lib/telemetry/ux-events.mjs";

// UI text translations (simple NO/EN toggle, UI-only)
const UI_TEXT = {
  NO: {
    greeting_morning: "God morgen",
    greeting_day: "Hei",
    greeting_evening: "God kveld",
    greeting_night: "God natt",
    ready_message: "Klar for en ny arbeidsdag",
    start_button: "Start",
    text_fallback: "Du kan skrive hvis du vil",
    suggested_tasks: "Anbefalte oppgaver",
    optional_message: "Disse er valgfrie - du kan gå videre når som helst",
    schemas_heading: "Skjema",
    external_heading: "Eksterne systemer",
    recommended: "Anbefalt",
    required: "Påkrevd",
    fill_in: "Fyll ut",
    skipped: "Hoppet over",
    open: "Åpne",
    go_to_operations: "Gå til drift",
    can_return: "Du kan alltid gå tilbake til disse senere",
    sja_label: "SJA (før arbeid)",
    vehicle_check_label: "Kjøretøysjekk",
  },
  EN: {
    greeting_morning: "Good morning",
    greeting_day: "Hello",
    greeting_evening: "Good evening",
    greeting_night: "Good night",
    ready_message: "Ready for a new workday",
    start_button: "Start",
    text_fallback: "You can type if you prefer",
    suggested_tasks: "Suggested tasks",
    optional_message: "These are optional - you can continue anytime",
    schemas_heading: "Forms",
    external_heading: "External systems",
    recommended: "Recommended",
    required: "Required",
    fill_in: "Fill in",
    skipped: "Skipped",
    open: "Open",
    go_to_operations: "Go to operations",
    can_return: "You can always return to these later",
    sja_label: "SJA (before work)",
    vehicle_check_label: "Vehicle check",
  }
} as const;

type Language = 'NO' | 'EN';

function getTimeBasedGreeting(lang: Language): string {
  const hour = new Date().getHours();
  const t = UI_TEXT[lang];

  if (hour >= 5 && hour < 10) {
    return t.greeting_morning;
  } else if (hour >= 10 && hour < 17) {
    return t.greeting_day;
  } else if (hour >= 17 && hour < 22) {
    return t.greeting_evening;
  } else {
    return t.greeting_night;
  }
}

/**
 * StartDayPhase - Handles NOT_STARTED and ACTIVE(pre) phases
 *
 * Principles:
 * - All suggestions are RECOMMENDED, never blocking
 * - Motor owns all state, UI only projects
 * - External systems are delegation only (open URL, no verification)
 * - User can ALWAYS proceed to drift
 */
export function StartDayPhase() {
  const appState = useMotorState('appState');
  const dayLog = useMotorState('dayLog');
  const uxState = useMotorState('uxState');
  const isListening = useMotorState('isListening');
  const voiceState = useMotorState('voiceState');
  const voiceError = useMotorState('voiceError');
  const voiceSupported = useMotorState('voiceSupported');
  const motor = useMotor();

  const config = useMotorState('config');
  const externalLinks = config?.externalLinks ?? [];

  // Language toggle (UI-only, not motor state)
  const [lang, setLang] = useState<Language>('NO');
  const t = UI_TEXT[lang];

  // UI-only state machine for start phase flow
  const [startUIState, setStartUIState] = useState<'idle' | 'listening' | 'review'>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  // Execution Sprint 3, Oppgave 1: continueFromPreDay() already blocks (motor.js:2245-2261)
  // when a required schema is unconfirmed — but only alert()s in vanilla mode. This surfaces
  // the same, real block in React mode instead of letting the button silently no-op.
  const [continueBlockedMessage, setContinueBlockedMessage] = useState<string | null>(null);
  // Execution Sprint 3, Oppgave 4: pre-flight network check before opening the mic — see the
  // matching change in operations-phase.tsx for the full rationale.
  const isOnline = useOnlineStatus();
  const [voiceBlockedByOffline, setVoiceBlockedByOffline] = useState(false);

  useEffect(() => {
    if (isOnline) setVoiceBlockedByOffline(false);
  }, [isOnline]);
  // Text input for start-idle (optional, passed to startDay if filled)
  const [startText, setStartText] = useState('');

  // Listen for voice transcript from motor
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail;
      if (text) setVoiceTranscript(text);
    };
    window.addEventListener('voice-transcript', handler);
    return () => window.removeEventListener('voice-transcript', handler);
  }, []);

  const greeting = useMemo(() => getTimeBasedGreeting(lang), [lang]);

  // Determine sub-phase
  const isNotStarted = appState === 'NOT_STARTED';
  const isPreDay = appState === 'ACTIVE' && dayLog?.phase === 'pre';

  // Auto-transition when voice stops (use voiceState for determinism)
  useEffect(() => {
    if (startUIState === 'listening' && voiceState !== 'listening' && voiceState !== 'processing') {
      if (appState === 'ACTIVE') {
        // Voice result triggered startDay — show pre-day review
        setStartUIState('review');
      } else {
        // No speech captured or recognition failed — return to idle
        setStartUIState('idle');
      }
    }
  }, [voiceState, startUIState, appState]);

  // Check if we're editing a schema (overlay state)
  const isEditingSchema = uxState?.activeOverlay === 'schema_edit' && uxState?.schemaId;

  // Get pre-day schemas from motor (not hard-coded)
  const preDaySchemas = useMemo(() => {
    if (!dayLog?.schemas) return [];
    return dayLog.schemas.filter(s => s.origin === "pre_day");
  }, [dayLog]);

  // Clear the block message once the user resolves the required schema(s) it named.
  useEffect(() => {
    if (!continueBlockedMessage) return;
    const stillUnconfirmed = getUnconfirmedRequiredSchemas(preDaySchemas, (type: string) => !!motor?.isSchemaRequired(type));
    if (stillUnconfirmed.length === 0) setContinueBlockedMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preDaySchemas]);

  // Check if any schemas are admin-required (via motor)
  const getSchemaStatus = (schema: Schema): "anbefalt" | "påkrevd" => {
    if (motor?.isSchemaRequired(schema.type)) {
      return "påkrevd";
    }
    return "anbefalt";
  };

  // Helper for schema labels. The two NO/EN-translated short labels are a
  // UI-language concern (kept); any other schema type's title comes from
  // Runtime via motor — no hardcoded fallback list here. Hoisted to top-level
  // scope (was local to the pre-day render branch) so handleContinue can use
  // it too (Execution Sprint 3, Oppgave 1).
  const getSchemaLabel = (schemaType: string): string => {
    if (schemaType === "sja_preday") return t.sja_label;
    if (schemaType === "kjoretoyssjekk") return t.vehicle_check_label;
    return motor?.getSchemaFieldDefinitions(schemaType)?.label || schemaType;
  };

  // Handle continue to drift — blocks (and explains why) when a required schema is unconfirmed,
  // matching motor.js's own continueFromPreDay() enforcement (Execution Sprint 3, Oppgave 1).
  const handleContinue = () => {
    if (isContinuing) return;
    const unconfirmed = getUnconfirmedRequiredSchemas(preDaySchemas, (type: string) => !!motor?.isSchemaRequired(type));
    if (unconfirmed.length > 0) {
      const names = unconfirmed.map((s: { type: string }) => getSchemaLabel(s.type)).join(", ");
      setContinueBlockedMessage(`Fullfør ${names} før du kan gå videre til drift.`);
      logUxEvent("RequiredSchemaBlocked", { schemaTypes: unconfirmed.map((s: { type: string }) => s.type) });
      return;
    }
    setContinueBlockedMessage(null);
    setIsContinuing(true);
    motor?.continueFromPreDay();
    // Safety: reset if motor rejected
    setTimeout(() => setIsContinuing(false), 500);
  };

  // Handle defer schema (Utsett — shows up at end-of-day)
  const handleDeferSchema = (schemaId: string) => {
    motor?.deferPreDaySchema(schemaId);
  };

  // Handle discard schema (Ikke relevant)
  const handleDiscardSchema = (schemaId: string) => {
    motor?.skipPreDaySchema(schemaId);
  };

  // Handle open schema for edit
  const handleOpenSchema = (schemaId: string) => {
    motor?.openSchemaEdit(schemaId);
  };

  // Handle external link (delegation only)
  const handleOpenExternal = (url: string) => {
    window.open(url, '_blank');
  };

  // --- NOT_STARTED: Show start button (idle state) ---
  if (isNotStarted && startUIState === 'idle') {
    return (
      <div className="flex min-h-screen flex-col px-4 py-8">
        {/* Language toggle - upper right corner */}
        <div className="flex justify-end mb-8">
          <button
            onClick={() => setLang(lang === 'NO' ? 'EN' : 'NO')}
            type="button"
            className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary"
          >
            <Languages className="h-4 w-4" />
            {lang}
          </button>
        </div>

        {/* Main content - centered */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-foreground">{greeting}</h1>
              <p className="mt-2 text-lg text-muted-foreground">
                {t.ready_message}
              </p>
            </div>

            {/* Start section: button always visible, text input optional */}
            <div className="w-full max-w-xs space-y-3">
              <button
                type="button"
                onClick={() => motor?.startDay(startText.trim() || undefined)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground transition-all active:scale-[0.98]"
              >
                <Check className="h-5 w-5" />
                Start dag
              </button>
              <textarea
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                placeholder="Du kan skrive her for å hoppe direkte til relevant skjema (valgfritt)"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Voice button — only shown when voice is supported */}
            {voiceSupported && (
              <div className="flex flex-col items-center gap-2">
                <VoiceButton
                  isListening={false}
                  onClick={() => {
                    if (!isOnline) {
                      setVoiceBlockedByOffline(true);
                      logUxEvent("VoiceBlockedOffline", { screen: "start_day_idle" });
                      return;
                    }
                    setVoiceBlockedByOffline(false);
                    setStartUIState('listening');
                    motor?.toggleVoice();
                  }}
                  label={t.start_button}
                  size="xl"
                />
                {voiceBlockedByOffline && (
                  <p className="max-w-xs text-center text-sm text-destructive">
                    Tale krever nettforbindelse. Skriv i tekstfeltet over i stedet.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- NOT_STARTED: Listening state ---
  if (isNotStarted && startUIState === 'listening') {
    return (
      <div className="flex min-h-screen flex-col px-4 py-8">
        {/* Language toggle - upper right corner */}
        <div className="flex justify-end mb-8">
          <button
            onClick={() => setLang(lang === 'NO' ? 'EN' : 'NO')}
            type="button"
            className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary"
          >
            <Languages className="h-4 w-4" />
            {lang}
          </button>
        </div>

        {/* Main content - centered */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-foreground">{greeting}</h1>
              <p className="mt-2 text-lg text-muted-foreground">
                {t.ready_message}
              </p>
            </div>

            <VoiceButton
              isListening={voiceState === "listening"}
              onClick={() => {
                if (voiceState !== "listening" && !isOnline) {
                  setVoiceBlockedByOffline(true);
                  logUxEvent("VoiceBlockedOffline", { screen: "start_day_listening" });
                  return;
                }
                setVoiceBlockedByOffline(false);
                motor?.toggleVoice();
              }}
              label={
                voiceState === "listening" ? "Lytter..." :
                voiceState === "processing" ? "Behandler..." :
                "Lytter..."
              }
              size="xl"
              disabled={!voiceSupported || voiceState === "processing"}
            />

            {voiceBlockedByOffline ? (
              <p className="max-w-xs text-center text-sm text-destructive">
                Tale krever nettforbindelse.
              </p>
            ) : voiceState === "error" && voiceError ? (
              <p className="max-w-xs text-center text-sm text-destructive">
                {voiceError}
              </p>
            ) : (
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                Trykk igjen for å gå videre
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Schema Edit Overlay (during pre-day) ---
  if (isPreDay && isEditingSchema && motor && dayLog && uxState) {
    return <SchemaEditOverlay dayLog={dayLog} uxState={uxState} motor={motor} />;
  }

  // --- Review state OR ACTIVE (pre): Show pre-day suggestions ---
  if (startUIState === 'review' || isPreDay) {
    return (
      <div className="flex min-h-screen flex-col px-4 py-8 pb-24">
        {/* Language toggle - upper right corner */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setLang(lang === 'NO' ? 'EN' : 'NO')}
            type="button"
            className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary"
          >
            <Languages className="h-4 w-4" />
            {lang}
          </button>
        </div>

        <div className="mx-auto w-full max-w-md">
          {/* Header */}
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-foreground">
              {t.suggested_tasks}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.optional_message}
            </p>
          </div>

          {/* Voice transcript summary */}
          {voiceTranscript && (
            <div className="mb-4 rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Tale mottatt
              </p>
              <p className="text-sm text-foreground italic">
                &ldquo;{voiceTranscript}&rdquo;
              </p>
            </div>
          )}
          {!voiceTranscript && startUIState === 'review' && (
            <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">
                Ingen tale fanget opp
              </p>
            </div>
          )}

          {/* Pre-day schemas from motor */}
          {preDaySchemas.length > 0 && (
            <div className="mb-4 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t.schemas_heading}
              </h3>
              {preDaySchemas.map((schema) => {
                const status = getSchemaStatus(schema);
                const isCompleted = schema.status === "confirmed";
                const isSkipped = schema.status === "skipped" || schema.status === "discarded";
                const isDeferred = (schema.status as string) === "deferred";
                const isHandled = isCompleted || isSkipped || isDeferred;

                // Get grovfilled field values for display
                const fieldEntries = schema.fields ? Object.entries(schema.fields).filter(
                  ([, v]) => v !== null && v !== undefined && v !== ""
                ) : [];

                return (
                  <div
                    key={schema.id}
                    className={cn(
                      "rounded-xl border p-4 transition-all",
                      isCompleted && "border-success/50 bg-success/10",
                      isSkipped && "border-muted bg-muted/30 opacity-60",
                      isDeferred && "border-accent/30 bg-accent/5 opacity-80",
                      !isHandled && "border-border bg-card"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className={cn(
                          "h-5 w-5",
                          isCompleted ? "text-success" : "text-muted-foreground"
                        )} />
                        <div>
                          <p className={cn(
                            "font-medium",
                            isCompleted && "text-success",
                            isSkipped && "text-muted-foreground line-through",
                            isDeferred && "text-muted-foreground"
                          )}>
                            {getSchemaLabel(schema.type)}
                          </p>
                          <span className={cn(
                            "text-xs",
                            status === "påkrevd" ? "text-destructive" : "text-muted-foreground"
                          )}>
                            {status === "påkrevd" ? t.required : t.recommended}
                          </span>
                          {status === "påkrevd" && !isCompleted && !isSkipped && !isDeferred && (
                            <span className="block text-xs text-destructive/80 mt-0.5">
                              Må bekreftes før drift
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {isCompleted ? (
                          <Check className="h-5 w-5 text-success" />
                        ) : isSkipped ? (
                          <span className="text-xs text-muted-foreground">Ikke relevant</span>
                        ) : isDeferred ? (
                          <span className="text-xs text-accent">Utsatt</span>
                        ) : (
                          <button
                            onClick={() => handleOpenSchema(schema.id)}
                            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                          >
                            {t.fill_in}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Show grovfilled field values inline */}
                    {!isSkipped && fieldEntries.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {fieldEntries.slice(0, 4).map(([key, val]) => (
                          <span key={key}>
                            {motor?.getSchemaFieldDefinitions(schema.type)?.fields[key]?.label || key}: <span className="text-foreground">{String(val)}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Utsett / Ikke relevant buttons for unhandled, non-required schemas */}
                    {!isHandled && status !== "påkrevd" && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleDeferSchema(schema.id)}
                          type="button"
                          className="rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-all hover:bg-accent/20"
                        >
                          Utsett
                        </button>
                        <button
                          onClick={() => handleDiscardSchema(schema.id)}
                          type="button"
                          className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/80"
                        >
                          Ikke relevant
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* External suggestions (delegation only) */}
          <div className="mb-6 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t.external_heading}
            </h3>
            {externalLinks.map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ExternalLink className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{suggestion.title}</p>
                      <span className="text-xs text-muted-foreground">{t.recommended}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenExternal(suggestion.url)}
                    className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground"
                  >
                    {t.open}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Continue button — blocked (with an explanation) only when a required schema is unconfirmed */}
          {continueBlockedMessage && (
            <p className="mb-2 text-center text-sm font-medium text-destructive">
              {continueBlockedMessage}
            </p>
          )}
          <button
            onClick={handleContinue}
            disabled={isContinuing}
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-5 text-lg font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Check className="h-6 w-6" />
            {isContinuing ? "Starter drift..." : t.go_to_operations}
            <ChevronRight className="h-5 w-5" />
          </button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t.can_return}
          </p>
        </div>
      </div>
    );
  }

  // Fallback (should not reach here)
  return null;
}

// ============================================================
// SCHEMA EDIT OVERLAY — shared between pre-day and håndrens
// ============================================================

interface SchemaEditOverlayProps {
  dayLog: DayLog;
  uxState: UxState;
  motor: NonNullable<typeof window.Motor>;
}

// Generic Schema Renderer (Phase 9): field labels, required flags, and
// enum options all come from motor.getSchemaFieldDefinitions() at
// render time — Runtime describes the schema, React only draws it.
// There is deliberately no hardcoded per-schema-type data left here.

export function SchemaEditOverlay({ dayLog, uxState, motor }: SchemaEditOverlayProps) {
  const schemaError = useMotorState('schemaError');
  const schema = dayLog.schemas?.find(s => s.id === uxState.schemaId);
  // Debounce ref: avoids localStorage write per every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const config = useMotorState('config');
  const configKjoretoy: string[] = config?.kjoretoy ?? [];

  // Local edit state — mirrors schema.fields for immediate UI feedback.
  // Motor receives debounced updates via setSchemaField.
  const [editState, setEditState] = useState<Record<string, unknown>>(() => ({...(schema?.fields ?? {})}));

  // Dogfooding Punchout audit finding: `pendingFieldRef` and the
  // flush-on-unmount effect below used to sit AFTER the `if (!schema)
  // return null;` guard — a real Rules-of-Hooks violation (react-hooks/
  // rules-of-hooks), since these two hooks were then skipped entirely on
  // any render where `schema` was undefined, desyncing React's hook call
  // order across renders of the same component instance. Moved both
  // above the early return; the effect's own cleanup now guards `schema`
  // being possibly undefined internally instead of via a conditional hook.
  const pendingFieldRef = useRef<{ key: string; value: unknown } | null>(null);

  // Flush a pending debounced write on unmount instead of letting it fire
  // late (e.g. after "Lagre"/"Avbryt" already closed the overlay, or after
  // the day was locked) or dropping the last keystroke silently.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        if (pendingFieldRef.current && schema) {
          motor.setSchemaField(schema.id, pendingFieldRef.current.key, pendingFieldRef.current.value);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!schema) return null;

  const fieldDefinitions = motor.getSchemaFieldDefinitions(schema.type, schema.origin);
  const schemaDef = fieldDefinitions
    ? { label: fieldDefinitions.label, fields: Object.fromEntries(Object.entries(fieldDefinitions.fields).map(([k, f]) => [k, f.label])) }
    : { label: schema.type, fields: {} as Record<string, string> };
  const requiredFields = fieldDefinitions
    ? Object.entries(fieldDefinitions.fields).filter(([, f]) => f.required).map(([k]) => k)
    : [];
  // In håndrens context, the schema is saved but NOT auto-confirmed by motor —
  // confirmation happens via resolveItem() in HandrensPhase.
  const isHandrens = dayLog.phase === "ending";
  const saveLabel = isHandrens ? "Lagre" : "Lagre og bekreft";

  const handleFieldChange = (key: string, value: unknown) => {
    // Update local state immediately for responsive UI
    setEditState(prev => ({ ...prev, [key]: value }));
    // Debounce motor update to avoid excessive localStorage writes
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendingFieldRef.current = { key, value };
    debounceRef.current = setTimeout(() => {
      motor.setSchemaField(schema.id, key, value);
      pendingFieldRef.current = null;
    }, 250);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{schemaDef.label}</h1>
            <p className="text-sm text-muted-foreground">Fyll ut skjemaet</p>
          </div>
          <button
            onClick={() => motor.closeSchemaEdit()}
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Form fields */}
      <main className="flex-1 px-4 py-6 overflow-auto pb-32">
        <div className="space-y-4">
          {Object.entries(schema.fields).map(([key]) => {
            const fieldDef = fieldDefinitions?.fields[key];
            const fieldLabel = fieldDef?.label || schemaDef.fields[key] || key;
            const isRequired = requiredFields.includes(key);
            const enumOptions = fieldDef?.type === "enum" ? fieldDef.options : undefined;
            const isBooleanField = fieldDef?.type === "boolean";
            const rawValue = editState[key];
            const currentValue = rawValue === null || rawValue === undefined ? "" : rawValue;

            return (
              <div key={key} className="rounded-xl border border-border bg-card p-4">
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  {fieldLabel}
                  {isRequired && <span className="ml-1 text-destructive">*</span>}
                </label>

                {/* Kjøretøy field — quick-pick buttons (if configured) + always a free-text input */}
                {key === "kjoretoy" ? (
                  <div className="space-y-3">
                    {configKjoretoy.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {configKjoretoy.map((kj) => (
                          <button
                            key={kj}
                            type="button"
                            onClick={() => handleFieldChange(key, kj)}
                            className={cn(
                              "rounded-lg px-3 py-2 text-sm font-medium font-mono transition-all active:scale-95",
                              currentValue === kj
                                ? "bg-primary text-primary-foreground"
                                : "border border-border bg-background text-muted-foreground"
                            )}
                          >
                            {kj}
                          </button>
                        ))}
                      </div>
                    )}
                    <input
                      type="text"
                      value={typeof currentValue === "string" ? currentValue : ""}
                      onChange={(e) => handleFieldChange(key, e.target.value || null)}
                      placeholder="Skriv eller velg registreringsnummer..."
                      className={cn(
                        "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary",
                        isRequired && (currentValue === "" || currentValue === null)
                          ? "border-destructive/50"
                          : "border-border"
                      )}
                    />
                  </div>
                ) : /* Boolean field — three-state toggle. Driven by the declared
                       field type, not a field-name convention (e.g. "_ok" suffix) —
                       falls back to the current value's own type only if no
                       definition loaded yet. */
                isBooleanField || (fieldDef === undefined && typeof currentValue === "boolean") ? (
                  <div className="flex gap-2">
                    {(["true", "false", "null"] as const).map((opt) => {
                      const optLabel = opt === "true" ? "Ja" : opt === "false" ? "Nei" : "Ikke satt";
                      const isActive =
                        opt === "true" ? currentValue === true :
                        opt === "false" ? currentValue === false :
                        currentValue === "" || currentValue === null || currentValue === undefined;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const val = opt === "true" ? true : opt === "false" ? false : null;
                            handleFieldChange(key, val);
                          }}
                          className={cn(
                            "flex-1 rounded-lg py-2.5 text-sm font-medium transition-all active:scale-95",
                            isActive
                              ? opt === "true" ? "bg-success text-success-foreground"
                                : opt === "false" ? "bg-destructive text-destructive-foreground"
                                : "bg-secondary text-secondary-foreground"
                              : "border border-border bg-background text-muted-foreground"
                          )}
                        >
                          {optLabel}
                        </button>
                      );
                    })}
                  </div>
                ) : enumOptions ? (
                  /* Enum field — segmented options */
                  <div className="flex flex-wrap gap-2">
                    {enumOptions.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleFieldChange(key, opt)}
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm font-medium capitalize transition-all active:scale-95",
                          currentValue === opt
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-background text-muted-foreground"
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  /* String field — controlled textarea */
                  <textarea
                    value={typeof currentValue === "string" ? currentValue : ""}
                    onChange={(e) => handleFieldChange(key, e.target.value || null)}
                    placeholder={`Skriv ${fieldLabel.toLowerCase()}...`}
                    rows={3}
                    className={cn(
                      "w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary",
                      isRequired && (currentValue === "" || currentValue === null)
                        ? "border-destructive/50"
                        : "border-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Actions */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 px-4 pt-4 backdrop-blur-sm space-y-2 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
        {schemaError && (
          <p className="text-sm text-destructive text-center pb-1">{schemaError}</p>
        )}
        <button
          onClick={() => motor.saveSchemaEdit()}
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-semibold text-primary-foreground transition-all active:scale-[0.98]"
        >
          <Check className="h-5 w-5" />
          {saveLabel}
        </button>
        <button
          onClick={() => motor.closeSchemaEdit()}
          type="button"
          className="flex w-full items-center justify-center rounded-xl bg-secondary py-3 font-medium text-secondary-foreground transition-all active:scale-[0.98]"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}
