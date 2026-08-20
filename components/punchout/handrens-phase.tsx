"use client";

import { useMotorState, useMotor, type UnresolvedItem } from "@/hooks/use-motor-state";
import { SchemaOverlayRouter } from "./schema-overlay-router";
import { cn } from "@/lib/utils";
import {
  Check,
  X,
  Lock,
  Clock,
  AlertCircle,
  Radio,
  Gauge,
  Wrench,
  FileText,
  Pencil,
} from "lucide-react";
import { useState } from "react";

/**
 * HandrensPhase — Flat verification list (replaces decision tunnel)
 *
 * Shows all unresolved items as a flat list.
 * Default action = Bekreft (one tap). Forkast requires expand.
 * When all resolved → readyToLock → shows "Lås dag" button.
 *
 * PURE PROJECTION of motor state:
 * - Reads getUnresolvedItems() for the list
 * - Reads readyToLock for lock button visibility
 * - Calls resolveItem(id, action) for all actions
 * - Calls lockDay() for explicit lock
 */

const KIND_ICONS: Record<string, typeof FileText> = {
  schema: AlertCircle,
  friksjon: Gauge,
  main_time: Clock,
  draft: Wrench,
};

const KIND_COLORS: Record<string, string> = {
  schema: "bg-destructive",
  friksjon: "bg-chart-4",
  main_time: "bg-primary",
  draft: "bg-primary",
};

export function HandrensPhase() {
  const appState = useMotorState("appState");
  const dayLog = useMotorState("dayLog");
  const readyToLock = useMotorState("readyToLock");
  const uxState = useMotorState("uxState");
  const motor = useMotor();

  // Guard
  if (appState !== "ACTIVE" || dayLog?.phase !== "ending") return null;
  if (!motor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Laster...</div>
      </div>
    );
  }

  // Schema edit overlay — shown when user edits a schema (e.g. RUH fields) from håndrens
  const isEditingSchema = uxState?.activeOverlay === "schema_edit" && uxState?.schemaId;
  if (isEditingSchema && dayLog && uxState) {
    // RUH opens into the guided flow; other schema types keep the field
    // renderer. The router owns that decision so the two phases that show
    // this overlay cannot quietly stop matching each other.
    return <SchemaOverlayRouter dayLog={dayLog} uxState={uxState} motor={motor} />;
  }

  const unresolvedItems: UnresolvedItem[] = motor.getUnresolvedItems() || [];
  const allResolved = unresolvedItems.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="px-4 py-4">
          <h1 className="text-xl font-semibold text-foreground">Håndrens</h1>
          <p className="text-sm text-muted-foreground">
            {allResolved
              ? "Alt er behandlet"
              : `${unresolvedItems.length} ${unresolvedItems.length === 1 ? "punkt" : "punkter"} gjenstår`}
          </p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-4 py-4 pb-28">
        {allResolved ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success mb-4">
              <Check className="h-8 w-8 text-success-foreground" />
            </div>
            <p className="text-lg font-medium text-foreground">
              Ingen ubehandlede punkter
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lås dagen for å fullføre
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {unresolvedItems.map((item) => (
              <UnresolvedItemCard
                key={item.id}
                item={item}
                motor={motor}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bottom bar — Lock button */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 px-4 pt-4 backdrop-blur-sm [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
        {readyToLock && allResolved ? (
          <LockDayButton motor={motor} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Behandle alle punkter for å låse dagen
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Item card — one tap to confirm, expand for discard
// ============================================================

function UnresolvedItemCard({
  item,
  motor,
}: {
  item: UnresolvedItem;
  motor: NonNullable<typeof window.Motor>;
}) {
  const [expanded, setExpanded] = useState(false);
  const schemaError = useMotorState("schemaError");

  const Icon = KIND_ICONS[item.kind] || FileText;
  const iconColor = KIND_COLORS[item.kind] || "bg-secondary";

  // Main time needs special handling (discard has sub-options)
  if (item.kind === "main_time") {
    return (
      <MainTimeCard item={item} motor={motor} />
    );
  }

  // RUH items require expand — no one-tap confirm allowed
  const isRuh = item.kind === "schema" && item.data.type === "ruh";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", iconColor)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-card-foreground">{item.label}</p>
          {isRuh && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Opprett RUH-rapport?
            </p>
          )}
          {item.kind === "schema" && item.data.type === "vaktlogg" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Bekreft vaktlogg
            </p>
          )}
          {item.kind === "draft" && !!item.data.beskrivelse && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {String(item.data.beskrivelse)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!expanded && !isRuh && (
            <button
              onClick={() => motor.resolveItem(item.id, "confirm")}
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all active:scale-95"
              aria-label="Bekreft"
            >
              <Check className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            type="button"
            className={cn(
              "flex h-11 shrink-0 items-center justify-center rounded-lg transition-all active:scale-95",
              isRuh && !expanded
                ? "bg-secondary px-3 text-sm font-medium text-secondary-foreground"
                : "w-11 bg-secondary text-secondary-foreground"
            )}
            aria-label={expanded ? "Skjul" : isRuh ? "Behandle" : "Mer"}
          >
            {isRuh && !expanded ? (
              "Behandle"
            ) : (
              <X className={cn("h-4 w-4 transition-transform", expanded && "rotate-45")} />
            )}
          </button>
        </div>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {/* RUH: show edit button before confirm — arsak+tiltak must be filled */}
          {isRuh && (
            <button
              onClick={() => motor.openSchemaEdit(item.data.schemaId as string)}
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background py-3 font-medium text-foreground transition-all active:scale-[0.98]"
            >
              <Pencil className="h-4 w-4" />
              Rediger RUH-felt
            </button>
          )}
          {/* schemaError shown directly above confirm button for RUH */}
          {isRuh && schemaError && (
            <p className="text-sm text-destructive text-center">{schemaError}</p>
          )}
          <button
            onClick={() => motor.resolveItem(item.id, "confirm")}
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-all active:scale-[0.98]"
          >
            <Check className="h-4 w-4" />
            {isRuh ? "Bekreft opprettelse av RUH-rapport" : "Bekreft"}
          </button>
          <button
            onClick={() => motor.resolveItem(item.id, "discard")}
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 py-3 font-medium text-destructive transition-all active:scale-[0.98]"
          >
            Forkast
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main time card — special because discard needs reason
// ============================================================

function MainTimeCard({
  item,
  motor,
}: {
  item: UnresolvedItem;
  motor: NonNullable<typeof window.Motor>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showDiscardOptions, setShowDiscardOptions] = useState(false);

  const startTime = item.data.startTime ? String(item.data.startTime) : "?";
  const endTime = item.data.endTime ? String(item.data.endTime) : "?";

  /**
   * Operation Punchout Field Trial: this card used to render the lønnskode
   * list read-only, with "Bekreft timeark" permanently disabled because
   * nothing in React could add a line — so main hours could only ever be
   * DISCARDED, and no locked day ever exported a main-time line. The motor now
   * exposes DOM-free main-time editing (see public/motor.js above
   * teAddLonnskode); this reads through it rather than through item.data, so
   * edits are reflected immediately instead of waiting for the item list to be
   * rebuilt.
   */
  const ctx = motor.getMainTimeContext?.() ?? null;
  const lonnskoder =
    ctx?.lonnskoder ?? ((item.data.lonnskoder as Array<{ kode: string; fra: string; til: string }>) || []);
  const availableCodes = ctx?.availableLonnskoder ?? [];
  const lockedTillegg = ctx?.lockedTilleggHours ?? 0;

  function hoursFor(lk: { fra: string; til: string }): number {
    if (!lk.fra || !lk.til) return 0;
    const [fh, fm] = lk.fra.split(":").map(Number);
    const [th, tm] = lk.til.split(":").map(Number);
    if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return 0;
    let diff = th * 60 + tm - (fh * 60 + fm);
    if (diff < 0) diff += 24 * 60;
    return diff / 60;
  }
  const totalHours = lonnskoder.reduce((sum, lk) => sum + hoursFor(lk), 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Clock className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-card-foreground">Hovedtimeføring</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Timene dine for dagen — {startTime} – {endTime}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          type="button"
          className="flex h-10 shrink-0 items-center justify-center rounded-lg bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-all active:scale-95"
        >
          {expanded ? "Skjul" : "Behandle"}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Lønnskoder — editable */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lønnskoder</p>
            <p className="text-xs text-muted-foreground/70">
              Hvilken timekode arbeidet føres på (f.eks. ordinær tid, overtid)
            </p>

            {lockedTillegg > 0 && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{lockedTillegg.toFixed(1)} timer</span> er allerede ført
                på egne ordrer. Hovedtimeføringen gjelder resten av dagen.
              </p>
            )}

            {lonnskoder.length === 0 && (
              <p className="text-sm text-muted-foreground">Ingen lønnskoder lagt til ennå.</p>
            )}

            {lonnskoder.map((lk, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                <select
                  value={lk.kode}
                  onChange={(e) => motor.updateMainTimeLonnskode?.(i, { kode: e.target.value })}
                  aria-label="Lønnskode"
                  className="min-h-11 flex-1 min-w-24 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  {availableCodes.length === 0 && <option value={lk.kode}>{lk.kode}</option>}
                  {availableCodes.map((c) => (
                    <option key={c.kode} value={c.kode}>
                      {c.kode} – {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={lk.fra || ""}
                  onChange={(e) => motor.updateMainTimeLonnskode?.(i, { fra: e.target.value })}
                  aria-label="Fra klokkeslett"
                  className="min-h-11 w-28 rounded-lg border border-border bg-background px-2 text-sm"
                />
                <input
                  type="time"
                  value={lk.til || ""}
                  onChange={(e) => motor.updateMainTimeLonnskode?.(i, { til: e.target.value })}
                  aria-label="Til klokkeslett"
                  className="min-h-11 w-28 rounded-lg border border-border bg-background px-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => motor.removeMainTimeLonnskode?.(i)}
                  aria-label={`Fjern lønnskode ${lk.kode}`}
                  className="min-h-11 min-w-11 rounded-lg border border-border px-3 text-sm text-destructive transition-all active:scale-95"
                >
                  Fjern
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => motor.addMainTimeLonnskode?.()}
              className="flex min-h-11 w-full items-center justify-center rounded-lg border border-dashed border-border py-2.5 text-sm font-medium transition-all active:scale-[0.98]"
            >
              + Legg til lønnskode
            </button>

            {lonnskoder.length > 0 && (
              <p className="text-right text-xs text-muted-foreground">
                Sum hovedtimeføring: <span className="font-medium text-foreground">{totalHours.toFixed(1)} t</span>
              </p>
            )}
          </div>

          {/* Action buttons */}
          {!showDiscardOptions ? (
            <div className="space-y-2">
              <button
                onClick={() => motor.resolveItem(item.id, "confirm")}
                type="button"
                disabled={lonnskoder.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Bekreft timeark
              </button>
              {lonnskoder.length === 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  Legg til minst én lønnskode for å bekrefte, eller bruk «Forkast timeføring» dersom timer føres i
                  annet system.
                </p>
              )}
              <button
                onClick={() => setShowDiscardOptions(true)}
                type="button"
                className="flex w-full items-center justify-center rounded-lg border border-border py-2.5 text-sm font-medium text-secondary-foreground transition-all active:scale-[0.98]"
              >
                Forkast timeføring...
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">Velg grunn:</p>
              <button
                onClick={() => motor.resolveItem(item.id, "discard", { reason: "no_work_done" })}
                type="button"
                className="flex w-full items-center rounded-lg border border-border bg-background p-3 text-left text-sm transition-all active:scale-[0.98]"
              >
                Jeg har ikke arbeidet i dag
              </button>
              <button
                onClick={() => motor.resolveItem(item.id, "discard", { reason: "logged_elsewhere" })}
                type="button"
                className="flex w-full items-center rounded-lg border border-border bg-background p-3 text-left text-sm transition-all active:scale-[0.98]"
              >
                Timene er ført i annet system
              </button>
              <button
                onClick={() => setShowDiscardOptions(false)}
                type="button"
                className="flex w-full items-center justify-center py-2 text-sm text-muted-foreground"
              >
                Avbryt
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Lock day button — explicit, deliberate action
// ============================================================

function LockDayButton({
  motor,
}: {
  motor: NonNullable<typeof window.Motor>;
}) {
  const [isLocking, setIsLocking] = useState(false);

  const handleLock = () => {
    if (isLocking) return;
    setIsLocking(true);
    motor.lockDay();
    // Safety: if lockDay returned early (race with new unresolved items), reset after 500ms.
    // If lock succeeded, component unmounts before timer fires (harmless noop).
    setTimeout(() => setIsLocking(false), 500);
  };

  return (
    <div className="space-y-2">
      {/*
        Operation Punchout Field Trial — Prism finding TR-01 fired here for 5 of
        6 field personas, and notably NOT for the founder profile (baseline
        trust 0.75 clears the commitment threshold on its own). Locking is the
        single irreversible act of the workday: it archives the day, signs an
        export packet and hands it to the outbox. The button said none of that,
        so every worker except the one who built it was asked to commit without
        being told what they were committing to. One sentence, stating only what
        the code actually does — no reassurance that is not backed by the Relay.
      */}
      <p className="text-center text-xs text-muted-foreground">
        Dagen låses og sendes til arbeidsgiver. Etterpå kan den ikke endres.
        Sendingen skjer automatisk — også om du er uten dekning nå.
      </p>
      <button
        onClick={handleLock}
        disabled={isLocking}
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-5 text-lg font-semibold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
      >
        <Lock className="h-5 w-5" />
        {isLocking ? "Låser..." : "Lås dag"}
      </button>
    </div>
  );
}
