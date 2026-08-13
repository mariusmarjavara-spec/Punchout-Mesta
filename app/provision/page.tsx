"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Operation Punchout Soft Launch, Phase B — Field Client Provisioning.
 *
 * A one-time, admin/IT-run step on the physical device itself, run once
 * per device before a worker ever uses it. An administrator has already
 * run POST /api/devices/register (admin-token gated, out of band) and
 * has the resulting deviceId + secret in hand (e.g. from the terminal
 * output of that call, per docs/deploy-runbook.md). Pasting them here
 * proves this browser is the intended device, sets an httpOnly
 * organization cookie server-side (see /api/devices/provision), and from
 * then on app/layout.tsx serves this device its real organization's
 * compiled Runtime on every load — no further action needed.
 *
 * Real bug found and fixed via actual browser + real-server end-to-end
 * tracing this session (not caught by any prior VM-sandbox or curl-only
 * test, since it only manifests across a real page reload): the secret
 * was never persisted anywhere client-side, so a "provisioned" device
 * could correctly identify its organization and fetch the right Runtime,
 * but could never actually sign and send an export — ADMIN_CONFIG.
 * exportHmacSecret stayed null forever. Also found: userId has no
 * mechanism ANYWHERE in this app to ever be set — motor.js's own
 * buildExportPacket() silently aborts every export without one
 * (confirmed by reading it). Neither gap is specific to this fix; both
 * were simply never reachable before real Runtime injection existed to
 * expose them. Fixed by persisting both to the exact localStorage keys
 * app/layout.tsx's injected script already reads.
 *
 * userId here names the worker primarily assigned to this device, not a
 * login — matches this app's whole "no login system" posture. A device
 * being reassigned to a different worker is a real, legitimate future
 * need not solved here (deliberately: re-running this same one-time
 * step is the smallest correct answer today).
 */
export default function ProvisionPage() {
  const [deviceId, setDeviceId] = useState("");
  const [secret, setSecret] = useState("");
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!deviceId.trim() || !secret.trim() || !userId.trim()) return;
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/devices/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId.trim(), secret: secret.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error || "Klarte ikke å registrere enheten (" + res.status + ")");
        return;
      }
      // These three keys are exactly what app/layout.tsx's injected
      // beforeInteractive script reads to build window.PUNCHOUT_CONFIG,
      // and (for punchout_device_id) the exact key motor.js's own
      // getOrCreateDeviceId() reads first, before generating a random one.
      window.localStorage.setItem("punchout_device_id", body.deviceId);
      window.localStorage.setItem("punchout_export_hmac_secret", secret.trim());
      window.localStorage.setItem("punchout_user_id", userId.trim());
      setStatus("done");
      setMessage("Enheten er satt opp for organisasjon: " + body.organizationId);
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
    }
  }

  return (
    <div className="max-w-md mx-auto p-6 font-sans text-sm">
      <h1 className="text-xl font-semibold mb-1">Sett opp enhet</h1>
      <p className="text-neutral-500 mb-6">
        Kjøres én gang, av en administrator eller IT-ansvarlig, direkte på den fysiske enheten —
        ikke av arbeideren selv. Lim inn deviceId og secret fra registreringssvaret
        (se docs/deploy-runbook.md).
      </p>

      {status === "done" ? (
        <div className="border rounded-lg p-4 bg-green-50 border-green-300 text-green-900">
          <p className="font-medium">{message}</p>
          <p className="text-neutral-600 mt-2">
            Enheten kan nå brukes normalt — gå til <Link href="/" className="underline">forsiden</Link>.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-neutral-600 mb-1">deviceId</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="f.eks. mesta_phone_1"
            />
          </div>
          <div>
            <label className="block text-neutral-600 mb-1">secret</label>
            <input
              className="border rounded px-3 py-2 w-full"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="hemmeligheten fra registreringssvaret"
            />
          </div>
          <div>
            <label className="block text-neutral-600 mb-1">arbeider (navn/id)</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="f.eks. ola.nordmann"
            />
          </div>
          <button
            className="border rounded px-3 py-2 bg-black text-white disabled:opacity-50"
            disabled={status === "loading" || !deviceId.trim() || !secret.trim() || !userId.trim()}
            onClick={submit}
            type="button"
          >
            {status === "loading" ? "Setter opp…" : "Sett opp enhet"}
          </button>
          {status === "error" && <p className="text-red-600">{message}</p>}
        </div>
      )}
    </div>
  );
}
