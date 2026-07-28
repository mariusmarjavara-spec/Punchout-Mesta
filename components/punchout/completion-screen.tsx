"use client";

import { useEffect, useState } from "react";
import { useMotorState, useMotor } from "@/hooks/use-motor-state";
import { Check, RotateCcw, RefreshCw, FileText, Copy, Download, X, AlertCircle, Loader2 } from "lucide-react";
// @ts-ignore
import { logUxEvent } from "@/lib/telemetry/ux-events.mjs";

/**
 * CompletionScreen - Shows after day is locked
 *
 * Reads dayLog for summary data, calls motor.startNewDay() for reset
 */
export function CompletionScreen() {
  const dayLog = useMotorState('dayLog');
  const exportStatus = useMotorState('exportStatus');
  const motor = useMotor();

  const now = new Date();
  const dateStr = dayLog?.date || now.toLocaleDateString("no-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const [isResetting, setIsResetting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [copied, setCopied] = useState(false);

  // Execution Sprint 3, Oppgave 7: logged once per transition into "failed", not on every
  // re-render while the status stays failed.
  useEffect(() => {
    if (exportStatus === "failed") logUxEvent("ExportFailureShown", {});
  }, [exportStatus]);



  const handleReset = () => {
    if (isResetting) return;
    setIsResetting(true);
    motor?.startNewDay();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="flex flex-col items-center gap-8 text-center">
        {/* Status icon — reflects export state */}
        {exportStatus === "failed" ? (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
        ) : exportStatus === "sending" ? (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
          </div>
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-success">
            <Check className="h-12 w-12 text-success-foreground" />
          </div>
        )}

        {/* Title — honest about lock vs send state */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {exportStatus === "sent" ? "Dagen er låst og lagret" :
              exportStatus === "sending" ? "Dagen er låst" :
                exportStatus === "failed" ? "Dagen er låst" :
                  "Dagen er låst"}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">{dateStr}</p>
        </div>

        {/* Summary card */}
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Arbeidstid</span>
            <span className="font-semibold text-card-foreground">
              {dayLog?.startTime || "?"} – {dayLog?.endTime || "?"}
            </span>
          </div>
        </div>

        {/* Export status — per-day, honest */}
        {exportStatus === "disabled" && (
          <p className="text-sm text-muted-foreground/60">Eksport ikke aktivert</p>
        )}
        {exportStatus === "sending" && (
          <p className="text-sm text-muted-foreground">Sender til Mesta...</p>
        )}
        {exportStatus === "failed" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-destructive">Sending feilet</p>
            <button
              onClick={() => motor?.syncExports()}
              type="button"
              className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Prøv igjen
            </button>
          </div>
        )}
        {exportStatus === "sent" && (
          <p className="text-sm text-success">Lagret hos Mesta</p>
        )}
        {exportStatus === "no_data" && (
          <p className="text-sm text-muted-foreground/60">Ingen data å sende</p>
        )}

        {/* Report button */}
        <button
          onClick={() => setShowReport(true)}
          type="button"
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-4 font-medium text-card-foreground transition-all active:scale-95"
        >
          <FileText className="h-5 w-5" />
          Vis dagsrapport
        </button>

        {/* Info text */}
        <p className="max-w-xs text-sm text-muted-foreground">
          Alle data er lagret og kan ikke endres i etterkant. Var noe feilregistrert? Trykk på
          oppføringen i loggen for å legge til en rettelse — eller kontakt leder.
        </p>

        {/* Reset button */}
        <button
          onClick={handleReset}
          disabled={isResetting}
          type="button"
          className="flex items-center gap-2 rounded-xl bg-secondary px-6 py-4 font-medium text-secondary-foreground transition-all active:scale-95 disabled:opacity-50"
        >
          <RotateCcw className="h-5 w-5" />
          {isResetting ? "Tilbakestiller..." : "Start ny dag"}
        </button>
        <p className="text-xs text-muted-foreground/70">
          Dette starter en ny dag og nullstiller dagens økt
        </p>
      </div>

      {/* Report modal */}
      {showReport && dayLog && (() => {
        const report = motor?.buildHumanReadableReport(dayLog) || "";
        const filename = `punchout-${dayLog.date || "rapport"}.txt`;

        const handleCopy = () => {
          navigator.clipboard.writeText(report).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        };

        const handleDownload = () => {
          const blob = new Blob([report], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-background shadow-xl">
              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="text-lg font-semibold text-foreground">Dagsrapport</h2>
                <button
                  onClick={() => setShowReport(false)}
                  type="button"
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Report content */}
              <div className="flex-1 overflow-y-auto p-4">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                  {report}
                </pre>
              </div>

              {/* Modal actions */}
              <div className="flex gap-2 border-t border-border px-4 py-3">
                <button
                  onClick={handleCopy}
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Kopiert" : "Kopier"}
                </button>
                <button
                  onClick={handleDownload}
                  type="button"
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
                >
                  <Download className="h-4 w-4" />
                  Last ned .txt
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
