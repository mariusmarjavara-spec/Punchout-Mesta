"use client";

import { useEffect, useState } from "react";
// @ts-ignore
import { logUxEvent } from "@/lib/telemetry/ux-events.mjs";

/**
 * Execution Sprint 3, Oppgave 3/4: the app has no online/offline awareness
 * anywhere today — motor.js's own `online` listeners (initExportSync,
 * initTelemetrySync) only trigger internal retries, they don't expose
 * state. This is plain browser API, independent of motor.js.
 *
 * @returns {boolean} true if the browser reports a network connection.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    // Execution Sprint 3, Oppgave 7: logged once per actual transition (not per render/tick),
    // so "hvor ofte offline brukes" is answerable from timestamps without spamming events.
    const goOnline = () => {
      setIsOnline(true);
      logUxEvent("OfflineStateObserved", { isOnline: true });
    };
    const goOffline = () => {
      setIsOnline(false);
      logUxEvent("OfflineStateObserved", { isOnline: false });
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
