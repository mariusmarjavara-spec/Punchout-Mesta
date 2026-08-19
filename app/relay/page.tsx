"use client";

import { useEffect, useState } from "react";
// @ts-ignore
import { buildAdminAuthHeader } from "@/lib/pilot-ux/ops-auth-header.mjs";

/**
 * RELAY INSPECTION — evidence inspection, not an Operations dashboard.
 *
 * Operation Punchout Field Trial: after a real workday on a real phone, the
 * founder must be able to see EXACTLY what the phone delivered — without
 * DevTools, without curl, without developer archaeology. That is this page's
 * entire job, and its deliberate limit.
 *
 * It computes nothing. Every number shown comes from /api/relay, which reads
 * the stored records. No metric, no score, no derived judgement — the same
 * "kun presenter eksisterende" posture as app/ops/page.tsx, for the same
 * reason: the moment this page starts calculating, it stops being evidence.
 *
 * Token handling matches the ops page exactly: sessionStorage only (cleared
 * when the tab closes), never localStorage — an admin bearer token has no
 * reason to outlive the session it was typed into.
 */
const TOKEN_STORAGE_KEY = "punchout_ops_admin_token";

type DeliveryState = {
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  deliveredAt: string | null;
  receipt: { outputDir?: string; filesWritten?: string[]; filesUnchanged?: string[] } | null;
};

type RelayRow = {
  exportId: string;
  organizationId: string;
  userId: string | null;
  userIdVerified: boolean;
  deviceId: string;
  dayId: string | null;
  lockedAt: string | null;
  receivedAt: string;
  runtimeVersion: number | null;
  signatureValid: boolean;
  payloadSummary: {
    entries: number;
    schemas: number;
    timeEntries: number;
    machineHours: number;
    quantities: number;
    startTime: string | null;
    endTime: string | null;
  };
  delivery: Record<string, DeliveryState>;
};

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Mottatt",
  READY: "Klar",
  DELIVERING: "Sender",
  DELIVERED: "Levert",
  FAILED_RETRYABLE: "Feilet — prøver igjen",
  FAILED_FINAL: "Feilet — endelig",
};

function statusClass(status: string): string {
  if (status === "DELIVERED") return "bg-green-100 text-green-900 border-green-300";
  if (status === "FAILED_FINAL") return "bg-red-100 text-red-900 border-red-300";
  if (status === "FAILED_RETRYABLE") return "bg-amber-100 text-amber-900 border-amber-300";
  return "bg-neutral-100 text-neutral-800 border-neutral-300";
}

export default function RelayPage() {
  const [org, setOrg] = useState("");
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<RelayRow[] | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
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

  async function call(path: string, init?: RequestInit) {
    const res = await fetch(path, {
      ...init,
      headers: { ...buildAdminAuthHeader(token), ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
    if (res.status === 401) throw new Error("Ikke autentisert — admin-token mangler eller er ugyldig.");
    if (!res.ok) throw new Error("Feil " + res.status + " fra API");
    return res.json();
  }

  async function load() {
    if (!org.trim()) return;
    setBusy(true);
    setError(null);
    setDetail(null);
    try {
      const data = await call("/api/relay?org=" + encodeURIComponent(org.trim()));
      setRows(data.records ?? []);
    } catch (e: any) {
      setError(String(e.message || e));
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(exportId: string) {
    setBusy(true);
    setError(null);
    try {
      setDetail(await call(`/api/relay?org=${encodeURIComponent(org.trim())}&exportId=${encodeURIComponent(exportId)}`));
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function runAdapter(exportId?: string) {
    setBusy(true);
    setError(null);
    try {
      await call("/api/relay", {
        method: "POST",
        body: JSON.stringify({ org: org.trim(), target: "csv-file", ...(exportId ? { exportId } : {}) }),
      });
      await load();
    } catch (e: any) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 font-sans text-sm">
      <h1 className="text-xl font-semibold mb-1">Relay — leverte arbeidsdager</h1>
      <p className="text-neutral-500 mb-6">
        Viser nøyaktig hva telefonen faktisk leverte. Ingen beregninger, ingen tolkning.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <input
          className="min-w-0 border rounded px-3 py-2 flex-1"
          placeholder="organizationId (f.eks. mesta)"
          value={org}
          onChange={(e) => setOrg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <input
          className="min-w-0 border rounded px-3 py-2 flex-1"
          type="password"
          placeholder="admin-token"
          value={token}
          onChange={(e) => updateToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button className="border rounded px-4 py-2 font-medium" onClick={load} disabled={busy}>
          {busy ? "Henter…" : "Hent"}
        </button>
      </div>

      {error && <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900">{error}</p>}

      {rows && rows.length === 0 && (
        <p className="text-neutral-500">Ingen arbeidsdager mottatt for denne organisasjonen ennå.</p>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-neutral-600">{rows.length} arbeidsdag(er) i Relay</p>
            <button className="border rounded px-3 py-1.5" onClick={() => runAdapter()} disabled={busy}>
              Kjør CSV-adapter på alle ventende
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Dag</th>
                  <th className="py-2 pr-3">Bruker / enhet</th>
                  <th className="py-2 pr-3">Innhold</th>
                  <th className="py-2 pr-3">CSV-status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const csv = r.delivery?.["csv-file"];
                  const status = csv?.status ?? "RECEIVED";
                  return (
                    <tr key={r.exportId} className="border-b align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.dayId ?? "—"}</div>
                        <div className="text-neutral-500">
                          {r.payloadSummary.startTime ?? "?"}–{r.payloadSummary.endTime ?? "?"}
                        </div>
                        <div className="text-neutral-400 font-mono text-[10px] break-all">{r.exportId}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div>{r.userId ?? "—"}</div>
                        {!r.userIdVerified && <div className="text-amber-700 text-[10px]">bruker ikke verifisert</div>}
                        <div className="text-neutral-500 font-mono text-[10px] break-all">{r.deviceId}</div>
                      </td>
                      <td className="py-2 pr-3 text-neutral-700">
                        {r.payloadSummary.entries} oppf. · {r.payloadSummary.timeEntries} timelinjer ·{" "}
                        {r.payloadSummary.schemas} skjema
                        {r.payloadSummary.quantities > 0 && <> · {r.payloadSummary.quantities} mengder</>}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={"inline-block rounded border px-2 py-0.5 " + statusClass(status)}>
                          {STATUS_LABEL[status] ?? status}
                        </span>
                        {csv?.lastError && <div className="text-red-700 text-[10px] mt-1">{csv.lastError}</div>}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <button className="border rounded px-2 py-1 mr-1" onClick={() => openDetail(r.exportId)} disabled={busy}>
                          Vis
                        </button>
                        {status !== "DELIVERED" && (
                          <button className="border rounded px-2 py-1" onClick={() => runAdapter(r.exportId)} disabled={busy}>
                            CSV
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Innhold — {detail.record?.exportId}</h2>
          {detail.delivery?.["csv-file"]?.receipt?.outputDir && (
            <p className="mb-2 text-neutral-600">
              CSV skrevet til:{" "}
              <code className="break-all bg-neutral-100 px-1">{detail.delivery["csv-file"].receipt.outputDir}</code>
            </p>
          )}
          <pre className="overflow-x-auto rounded border bg-neutral-50 p-3 text-[11px] leading-relaxed">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
