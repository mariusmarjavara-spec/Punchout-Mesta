"use client";

import { useEffect, useState } from "react";
// @ts-ignore
import { buildAdminAuthHeader } from "@/lib/pilot-ux/ops-auth-header.mjs";

/**
 * Validation Sprint Del 7 finding: Operations Center existed only as a
 * JSON API (/api/operations-center) — no human-readable presentation at
 * all. A raw JSON blob is not a usable operational tool for an
 * administrator during a pilot. This page presents EXACTLY what that
 * API already returns, nothing more — no new metric is computed here,
 * this file contains zero business logic. "Kun presenter eksisterende
 * bedre," per the phase's own instruction.
 *
 * Deliberately minimal: one page, one org lookup, plain tables. This is
 * an internal operator tool for a small pilot, not a polished product
 * surface — building more than this now would be exactly the kind of
 * new-feature scope this phase explicitly excludes.
 *
 * Hotfix Sprint, Hotfix 2 — root cause: Execution Sprint 4 correctly
 * added verifyAdminAuth() to /api/operations-center (it had none, a real
 * vulnerability), but this page's fetch() never sent an Authorization
 * header — it had no token input at all, because none was needed before
 * that fix. The fix was correct on the API side and broke the only
 * legitimate consumer of that API. This adds ONLY a client-side token
 * field so the already-correct server-side check has something to
 * verify — verifyAdminAuth()/lib/backend/auth.mjs is untouched, no
 * authentication logic is weakened or bypassed anywhere.
 *
 * Token is kept in sessionStorage (cleared when the tab closes), never
 * localStorage — an admin bearer token has no reason to outlive the
 * session it was typed into.
 */
const TOKEN_STORAGE_KEY = "punchout_ops_admin_token";

type OpsData = {
  organizationId: string;
  runtimeHistory: Array<{ runtimeVersion: number; status: string; publishedAt: string; publishedBy: string }>;
  exportLog: Array<{ receivedAt: string; exportId: string; deviceId: string; signatureValid: boolean | null }>;
  telemetryEventCount: number;
  health: {
    exportHealth: { success: number; failed: number; successRate: number | null };
    completionRate: number | null;
    runtimeAdoption: number | null;
    ruleFrequency: Array<{ ruleId: string; count: number }>;
    promptOutcomeByTarget: Array<{ target: string; accepted: number; dismissed: number; total: number; ignoredRate: number | null }>;
    publishHistory: { totalPublishes: number; activeVersion: number | null };
  };
  dataAvailability: Record<string, string>;
  dataSource: string;
};

function pct(v: number | null): string {
  return v === null ? "ikke nok data" : Math.round(v * 100) + "%";
}

export default function OpsPage() {
  const [org, setOrg] = useState("");
  const [token, setToken] = useState("");
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Restore a previously-entered token for this tab session only (sessionStorage, not localStorage).
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) setToken(saved);
  }, []);

  function updateToken(value: string) {
    setToken(value);
    if (value) sessionStorage.setItem(TOKEN_STORAGE_KEY, value);
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  async function load() {
    if (!org.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operations-center?org=" + encodeURIComponent(org.trim()), {
        headers: buildAdminAuthHeader(token),
      });
      if (res.status === 401) {
        setError("Ikke autentisert — admin-token mangler eller er ugyldig.");
        setData(null);
      } else if (!res.ok) {
        setError("Feil " + res.status + " fra API");
        setData(null);
      } else {
        setData(await res.json());
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 font-sans text-sm">
      <h1 className="text-xl font-semibold mb-1">Operations Center</h1>
      <p className="text-neutral-500 mb-6">Kun eksisterende, ekte backend-data — ingen simulerte tall.</p>

      <div className="flex gap-2 mb-6">
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
          placeholder="Admin-token (PUNCHOUT_ADMIN_TOKEN)"
          value={token}
          onChange={(e) => updateToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          autoComplete="off"
        />
        <button className="border rounded px-4 py-2 bg-neutral-900 text-white" onClick={load} disabled={loading}>
          {loading ? "Laster…" : "Hent"}
        </button>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {data && (
        <div className="space-y-8">
          <section>
            <h2 className="font-semibold mb-2">Eksport</h2>
            <p>Vellykket: {data.health.exportHealth.success} · Feilet: {data.health.exportHealth.failed} · Suksessrate: {pct(data.health.exportHealth.successRate)}</p>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Completion Rate</h2>
            <p>{pct(data.health.completionRate)} (andel akseptert av akseptert+avvist i Prompt Queue)</p>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Runtime-adopsjon</h2>
            <p>{pct(data.health.runtimeAdoption)} av telemetri-hendelser er fra nyeste Runtime-versjon</p>
            <p className="text-neutral-500">Aktiv versjon: {data.health.publishHistory.activeVersion ?? "ingen publisert ennå"} · Totalt {data.health.publishHistory.totalPublishes} publiseringer</p>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Mest utløste regler</h2>
            {data.health.ruleFrequency.length === 0 ? (
              <p className="text-neutral-500">Ingen regel-utløsninger registrert ennå</p>
            ) : (
              <table className="w-full text-left">
                <thead><tr><th>Regel</th><th>Antall</th></tr></thead>
                <tbody>
                  {data.health.ruleFrequency.map((r) => (
                    <tr key={r.ruleId}><td>{r.ruleId}</td><td>{r.count}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="font-semibold mb-2">Prompt-utfall per mål</h2>
            {data.health.promptOutcomeByTarget.length === 0 ? (
              <p className="text-neutral-500">Ingen prompt-utfall registrert ennå</p>
            ) : (
              <table className="w-full text-left">
                <thead><tr><th>Mål</th><th>Akseptert</th><th>Avvist</th><th>Avvisningsrate</th></tr></thead>
                <tbody>
                  {data.health.promptOutcomeByTarget.map((r) => (
                    <tr key={r.target}><td>{r.target}</td><td>{r.accepted}</td><td>{r.dismissed}</td><td>{pct(r.ignoredRate)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section>
            <h2 className="font-semibold mb-2">Runtime-historikk</h2>
            <table className="w-full text-left">
              <thead><tr><th>Versjon</th><th>Status</th><th>Publisert</th><th>Av</th></tr></thead>
              <tbody>
                {data.runtimeHistory.map((m) => (
                  <tr key={m.runtimeVersion}><td>v{m.runtimeVersion}</td><td>{m.status}</td><td>{m.publishedAt}</td><td>{m.publishedBy}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Siste eksporter</h2>
            <table className="w-full text-left">
              <thead><tr><th>Tid</th><th>Enhet</th><th>Signatur</th></tr></thead>
              <tbody>
                {data.exportLog.slice(-10).reverse().map((e) => (
                  <tr key={e.exportId}><td>{e.receivedAt}</td><td>{e.deviceId}</td><td>{e.signatureValid === true ? "OK" : e.signatureValid === false ? "Ugyldig" : "Ukjent"}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Ikke tilgjengelig her</h2>
            <ul className="list-disc pl-5 text-neutral-500">
              {Object.entries(data.dataAvailability).filter(([, v]) => v.startsWith("not_available")).map(([k, v]) => (
                <li key={k}>{k}: {v.replace("not_available — ", "")}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
