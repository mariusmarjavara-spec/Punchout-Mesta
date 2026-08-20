"use client";

import { useEffect, useState } from "react";
// @ts-ignore
import { buildAdminAuthHeader } from "@/lib/pilot-ux/ops-auth-header.mjs";

/**
 * DAY TRACE — "hva skjedde med denne dagen?", answered on one screen.
 *
 * The Relay page shows what the phone delivered. This one shows what happened
 * to it afterwards, and — the part that was missing — what happened to a day
 * that never got that far. A day refused at ingest has no Relay record, so the
 * Relay page cannot show it at all: an operator looking for Tuesday sees
 * nothing and has no way to learn that Tuesday was rejected because the device
 * had been revoked.
 *
 * Same deliberate limit as app/relay/page.tsx and app/ops/page.tsx: this page
 * computes nothing. Every stage, status, timestamp and recommended action comes
 * from /api/day-trace, which reads existing evidence and owns no state of its
 * own. The moment this page starts deciding what a status means, it stops being
 * evidence and starts being a second, competing source of truth.
 *
 * Token handling matches the other admin pages exactly: sessionStorage only,
 * cleared when the tab closes.
 */
const TOKEN_STORAGE_KEY = "punchout_ops_admin_token";

type Stage = { stage: string; status: string; detail: string; at: string | null };
type DeliveryRow = { target: string; status: string; attempts: number; lastTransitionAt: string | null };
type Trace = {
  exportId: string;
  organizationId: string | null;
  outcome: string;
  headline: string;
  operatorAction: string | null;
  stages: Stage[];
  identity: {
    deviceId: string | null;
    userId: string | null;
    userIdVerified: boolean;
    dayId: string | null;
    runtimeVersion: number | string | null;
    exportVersion: string | null;
  };
  delivery: DeliveryRow[];
  evidence: { exportLogEntries: number; relayRecord: boolean; rejectedReason: string | null };
};

type DayRow = {
  exportId: string;
  outcome: string;
  headline: string;
  dayId: string | null;
  deviceId: string | null;
  receivedAt: string | null;
  delivery: { target: string; status: string; attempts: number }[];
};

const STAGE_LABELS: Record<string, string> = {
  RECORDED: "Registrert på enheten",
  LOCKED: "Låst",
  SIGNED: "Signert og godkjent",
  ACCEPTED_BY_RELAY: "Mottatt av Relay",
  TRANSFORMED: "Omformet av adapter",
  DELIVERY_ATTEMPTED: "Levering forsøkt",
  DESTINATION_OUTCOME: "Resultat hos mottaker",
};

const OUTCOME_LABELS: Record<string, string> = {
  NEVER_ARRIVED: "Aldri mottatt",
  REJECTED_AT_INGEST: "Avvist ved mottak",
  IN_CUSTODY_UNDELIVERED: "I forvaring — ikke sendt",
  DELIVERING: "Sender nå",
  DELIVERED: "Levert",
  RETRYING: "Feilet — kan prøves igjen",
  FAILED_FINAL: "Feilet — endelig",
  PARTIALLY_DELIVERED: "Delvis levert",
};

function stageClass(status: string): string {
  if (status === "OK") return "bg-green-100 text-green-900 border-green-300";
  if (status === "FAILED") return "bg-red-100 text-red-900 border-red-300";
  if (status === "PENDING") return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-neutral-100 text-neutral-700 border-neutral-300";
}

function outcomeClass(outcome: string): string {
  if (outcome === "DELIVERED") return "bg-green-100 text-green-900 border-green-300";
  if (outcome === "REJECTED_AT_INGEST" || outcome === "FAILED_FINAL")
    return "bg-red-100 text-red-900 border-red-300";
  if (outcome === "RETRYING" || outcome === "PARTIALLY_DELIVERED")
    return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-neutral-100 text-neutral-800 border-neutral-300";
}

export default function DayTracePage() {
  const [org, setOrg] = useState("");
  const [token, setToken] = useState("");
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [byOutcome, setByOutcome] = useState<Record<string, number>>({});
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores a token saved for this tab; sessionStorage cannot be read during SSR
    if (saved) setToken(saved);
  }, []);

  function updateToken(value: string) {
    setToken(value);
    if (value) sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  async function call(path: string) {
    const res = await fetch(path, { headers: buildAdminAuthHeader(token) });
    if (res.status === 401) throw new Error("Ikke autentisert — admin-token mangler eller er ugyldig.");
    if (!res.ok) throw new Error("Feil " + res.status + " fra API");
    return res.json();
  }

  async function load() {
    if (!org.trim()) return;
    setBusy(true);
    setError(null);
    setTrace(null);
    try {
      const data = await call("/api/day-trace?org=" + encodeURIComponent(org.trim()));
      setDays(data.days ?? []);
      setByOutcome(data.byOutcome ?? {});
    } catch (e: any) {
      setError(String(e.message || e));
      setDays(null);
    } finally {
      setBusy(false);
    }
  }

  async function openTrace(exportId: string) {
    setBusy(true);
    setError(null);
    try {
      setTrace(
        await call(
          `/api/day-trace?org=${encodeURIComponent(org.trim())}&exportId=${encodeURIComponent(exportId)}`,
        ),
      );
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dagsspor</h1>
        <p className="text-sm text-neutral-600">
          Hva skjedde med denne dagen? Alt her er lest fra eksisterende bevis — eksportlogg,
          Relay-arkiv og leveringstilstand. Ingenting er beregnet på nytt.
        </p>
      </header>

      <section className="space-y-3 rounded border border-neutral-300 p-4">
        <label className="block text-sm font-medium">
          Admin-token
          <input
            type="password"
            value={token}
            onChange={(e) => updateToken(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            placeholder="Bearer-token"
          />
        </label>
        <label className="block text-sm font-medium">
          Organisasjon
          <input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
            placeholder="mesta"
          />
        </label>
        <button
          onClick={load}
          disabled={busy || !org.trim()}
          className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40"
        >
          {busy ? "Henter…" : "Hent dager"}
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-900">
          {error}
        </p>
      )}

      {days && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(byOutcome).map(([outcome, count]) => (
              <span
                key={outcome}
                className={`rounded border px-2 py-1 text-xs ${outcomeClass(outcome)}`}
              >
                {OUTCOME_LABELS[outcome] ?? outcome}: {count}
              </span>
            ))}
          </div>

          {days.length === 0 && <p className="text-sm text-neutral-600">Ingen dager registrert.</p>}

          <ul className="space-y-2">
            {days.map((d) => (
              <li key={d.exportId} className="rounded border border-neutral-300 p-3">
                <button onClick={() => openTrace(d.exportId)} className="w-full text-left">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm">{d.exportId}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs ${outcomeClass(d.outcome)}`}>
                      {OUTCOME_LABELS[d.outcome] ?? d.outcome}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-700">{d.headline}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Dag: {d.dayId ?? "—"} · Enhet: {d.deviceId ?? "—"} · Mottatt: {d.receivedAt ?? "—"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {trace && (
        <section className="space-y-4 rounded border border-neutral-400 p-4">
          <div>
            <h2 className="font-mono text-lg">{trace.exportId}</h2>
            <p className={`mt-1 inline-block rounded border px-2 py-0.5 text-sm ${outcomeClass(trace.outcome)}`}>
              {OUTCOME_LABELS[trace.outcome] ?? trace.outcome}
            </p>
            <p className="mt-2 text-sm">{trace.headline}</p>
            {trace.operatorAction && (
              <p className="mt-2 rounded bg-neutral-100 p-2 text-sm">
                <strong>Neste steg:</strong> {trace.operatorAction}
              </p>
            )}
          </div>

          <ol className="space-y-2">
            {trace.stages.map((s) => (
              <li key={s.stage} className={`rounded border p-3 ${stageClass(s.status)}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{STAGE_LABELS[s.stage] ?? s.stage}</span>
                  <span className="text-xs">{s.at ?? ""}</span>
                </div>
                <p className="mt-1 text-sm">{s.detail}</p>
              </li>
            ))}
          </ol>

          <div className="text-sm">
            <h3 className="font-medium">Identitet</h3>
            <p className="text-neutral-700">
              Enhet: {trace.identity.deviceId ?? "—"} · Dag: {trace.identity.dayId ?? "—"} ·
              Runtime: {trace.identity.runtimeVersion ?? "—"}
            </p>
            <p className="text-neutral-700">
              Bruker: {trace.identity.userId ?? "—"}{" "}
              {trace.identity.userId && !trace.identity.userIdVerified && (
                <span className="rounded border border-amber-300 bg-amber-100 px-1 text-xs text-amber-900">
                  oppgitt av enheten, ikke verifisert
                </span>
              )}
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
