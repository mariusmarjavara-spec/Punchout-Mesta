"use client";

import { useMotorState, useMotor, derivePhase } from "@/hooks/use-motor-state";
import { StartDayPhase } from "@/components/punchout/start-day-phase";
import { OperationsPhase } from "@/components/punchout/operations-phase";
import { HandrensPhase } from "@/components/punchout/handrens-phase";
import { CompletionScreen } from "@/components/punchout/completion-screen";
import { StaleDayBanner } from "@/components/punchout/stale-day-banner";
import { StorageErrorOverlay } from "@/components/punchout/storage-error-overlay";
import { captureTelemetry } from "@/lib/telemetry";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";

export default function PunchoutApp() {
  // Mount guard — server and first client render must produce identical HTML.
  // Motor reads localStorage on client only, so we defer all motor-driven
  // rendering until after mount to prevent hydration mismatch.
  const [isMounted, setIsMounted] = useState(false);

  // Read state from motor (READ-ONLY)
  const appState = useMotorState('appState');
  const dayLog = useMotorState('dayLog');
  const storageError = useMotorState('storageError');
  const isStaleDay = useMotorState('isStaleDay');
  const motor = useMotor();

  // Derive current phase from motor state
  const currentPhase = derivePhase(appState, dayLog);

  // Local UI-only state (transitions, animations - NOT business logic)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [displayedPhase, setDisplayedPhase] = useState<string | null>(null);
  const lastTrackedPhase = useRef<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Privacy-minimal product telemetry: phase only. No day-log contents,
  // employee data, form values, location, free text, or person profile.
  useEffect(() => {
    if (!isMounted || !motor || lastTrackedPhase.current === currentPhase) return;

    lastTrackedPhase.current = currentPhase;
    captureTelemetry("phase viewed", { phase: currentPhase });
  }, [currentPhase, isMounted, motor]);

  // Handle phase transitions (visual only)
  // Skip transition on initial mount (displayedPhase is null)
  useEffect(() => {
    if (displayedPhase === null) {
      // First render — show content immediately, no transition
      setDisplayedPhase(currentPhase);
      return;
    }
    if (currentPhase !== displayedPhase) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayedPhase(currentPhase);
        setIsTransitioning(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [currentPhase, displayedPhase]);

  // Identical markup on server and first client render — no hydration mismatch
  if (!isMounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Laster...</div>
      </div>
    );
  }

  // Show loading state if motor not ready
  if (!motor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Laster...</div>
      </div>
    );
  }

  // Storage error takes priority over everything
  if (storageError) {
    return <StorageErrorOverlay error={storageError} motor={motor} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Stale day banner (non-blocking, shown at top) */}
      {isStaleDay && dayLog && (
        <StaleDayBanner date={dayLog.date} motor={motor} />
      )}

      {/* Phase transition overlay */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[100] bg-background transition-opacity duration-300",
          isTransitioning ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Content */}
      <div
        className={cn(
          "transition-opacity duration-200",
          isTransitioning ? "opacity-0" : "opacity-100"
        )}
      >
        {currentPhase === "start" && (
          <StartDayPhase />
        )}

        {currentPhase === "operations" && (
          <OperationsPhase />
        )}

        {currentPhase === "handrens" && (
          <HandrensPhase />
        )}

        {currentPhase === "complete" && (
          <CompletionScreen />
        )}
      </div>
    </div>
  );
}
