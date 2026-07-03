import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
// @ts-ignore
import { getDeviceCounts, getLogSizes } from "@/lib/backend/state.mjs";
// @ts-ignore
import { getPersistenceHealth } from "@/lib/backend/persistence.mjs";

/**
 * Execution Sprint 1 Oppgave 2. Unauthenticated by design (a health
 * check needs to work before/without an admin token, e.g. from a
 * hosting platform's automated probe) — deliberately reports ONLY
 * counts and statuses, never device ids, secrets, tokens, org content,
 * or file paths. "runtime-version" here means the Node.js process
 * runtime (process.version), distinct from Punchout's own Organization
 * Runtime concept — the app's own package version covers that
 * separately.
 */
let appVersion = "unknown";
try {
  appVersion = JSON.parse(readFileSync("./package.json", "utf8")).version;
} catch {
  // non-fatal — health must never fail just because package.json couldn't be read
}

export async function GET() {
  const persistence = getPersistenceHealth();
  const devices = getDeviceCounts();
  const logs = getLogSizes();

  return NextResponse.json({
    status: "ok",
    version: appVersion,
    nodeRuntimeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    persistence: {
      // No file path exposed — that's a real filesystem detail, not operationally useful to a caller.
      lastWriteOk: persistence.lastWriteOk,
      lastWriteAt: persistence.lastWriteAt,
    },
    registeredDevices: devices,
    exportQueue: { totalReceived: logs.exportLogEntries },
    telemetryQueue: { totalReceived: logs.telemetryLogEntries },
  });
}
