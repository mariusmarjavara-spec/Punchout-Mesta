"use client";

import { useEffect, useState } from "react";
import { useMotorState } from "@/hooks/use-motor-state";
import { GuidedForm } from "./guided-form";
import { SchemaEditOverlay } from "./start-day-phase";

/**
 * Which overlay a schema opens into.
 *
 * SJA and RUH go through the guided flow; everything else keeps the generic
 * field renderer. Routing here rather than inside each phase means the decision
 * exists once — `start-day-phase` and `handrens-phase` had identical overlay
 * blocks, and duplicating the branch is how one of them would quietly stop
 * matching the other.
 *
 * Deliberately narrow: this is not a form-system dispatcher. Two schema types
 * have a guided flow because two flows were written.
 */

const GUIDED_BY_SCHEMA_TYPE: Record<string, "sja" | "ruh"> = {
  sja_preday: "sja",
  ruh: "ruh",
};

interface SchemaOverlayRouterProps {
  dayLog: any;
  uxState: any;
  motor: any;
}

export function SchemaOverlayRouter({ dayLog, uxState, motor }: SchemaOverlayRouterProps) {
  const schema = dayLog?.schemas?.find((s: any) => s.id === uxState?.schemaId);
  const flowId = schema ? GUIDED_BY_SCHEMA_TYPE[schema.type] : undefined;

  if (!schema || !flowId) {
    return <SchemaEditOverlay dayLog={dayLog} uxState={uxState} motor={motor} />;
  }
  return <GuidedFormHost flowId={flowId} schemaId={schema.id} motor={motor} />;
}

/**
 * Voice wiring and lifecycle for a guided form.
 *
 * Kept apart from `GuidedForm` itself so that component stays a pure
 * projection: it receives a transcript and reports intent, and never reaches
 * for motor internals or window events.
 */
function GuidedFormHost({
  flowId,
  schemaId,
  motor,
}: {
  flowId: "sja" | "ruh";
  schemaId: string;
  motor: any;
}) {
  const isListening = useMotorState("isListening");
  const voiceError = useMotorState("voiceError");
  const [transcript, setTranscript] = useState<string | null>(null);

  /**
   * Claim voice for as long as this form is open.
   *
   * Without the claim, dictating an answer would ALSO run submitEntry() and
   * file a work entry the worker never wrote. The cleanup is the important
   * half: a form that closed without releasing would swallow every later
   * dictation for the rest of the day.
   */
  useEffect(() => {
    motor?.setVoiceCaptureTarget?.(flowId);
    const onTranscript = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail === "string" && detail.trim()) setTranscript(detail);
    };
    window.addEventListener("voice-transcript", onTranscript);
    return () => {
      window.removeEventListener("voice-transcript", onTranscript);
      motor?.setVoiceCaptureTarget?.(null);
    };
  }, [motor, flowId]);

  return (
    <GuidedForm
      motor={motor}
      flowId={flowId}
      schemaId={schemaId}
      isListening={!!isListening}
      voiceError={voiceError ?? null}
      onToggleVoice={() => motor?.toggleVoice?.()}
      voiceTranscript={transcript}
      onClose={() => motor?.closeSchemaEdit?.()}
      onConfirmed={() => motor?.closeSchemaEdit?.()}
    />
  );
}
