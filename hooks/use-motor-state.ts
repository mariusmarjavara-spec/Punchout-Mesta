import { useState, useEffect, useMemo } from 'react';

// Type definitions for motor state
export interface DayLog {
  date: string;
  startTime: string | null;
  startTimeSource?: 'pending' | 'user' | 'auto';
  endTime?: string;
  phase: 'pre' | 'active' | 'ending';
  status?: string;
  entries: Entry[];
  drafts: Record<string, Draft>;
  schemas: Schema[];
  mainTimeHandled?: boolean;
  mainTimeDiscarded?: boolean;
  mainTimeDiscardReason?: 'no_work_done' | 'logged_elsewhere';
  externalTasks?: ExternalTask[];
  exportId?: string;
}

export interface Entry {
  time: string;
  text: string;
  type: string;
  ruhDecision?: string;
  vaktloggConfirmed?: boolean;
  vaktloggDiscarded?: boolean;
  converted?: boolean;
  keptAsNote?: boolean;
  verified?: boolean;
  lockedByUser?: boolean;
}

export interface ParsedEntry {
  ordre: string;
  fra: string | null;
  til: string | null;
  ressurser: string[];
  rawText: string;
}

export interface Draft {
  ordre: string;
  dato: string;
  fra_tid?: string;
  til_tid?: string;
  arbeidsbeskrivelse: string[];
  ressurser: string[];
  lonnskoder: LonnskodeEntry[];
  maskintimer?: MaskintimeEntry[];
  entryIndices: number[];
  status: 'draft' | 'confirmed' | 'discarded';
}

export interface LonnskodeEntry {
  kode: string;
  fra: string;
  til: string;
}

export interface MaskintimeEntry {
  maskintype: string;
  timer: string;
}

/** What motor.getSchemaFieldDefinitions() returns — Phase 9's Generic Schema Renderer source of truth, replacing React's own hardcoded SCHEMA_LABELS/REQUIRED_FIELDS/ENUM_OPTIONS copies. */
export interface SchemaFieldDefinition {
  label: string;
  type: 'string' | 'text' | 'boolean' | 'enum' | 'date' | 'time' | 'number';
  required: boolean;
  options?: string[];
}

export interface SchemaFieldDefinitions {
  label: string;
  fields: Record<string, SchemaFieldDefinition>;
}

export interface Schema {
  id: string;
  type: string;
  origin: string;
  status: 'draft' | 'confirmed' | 'skipped' | 'discarded' | 'deferred' | 'force_skipped';
  fields: Record<string, unknown>;
  createdAt: string;
  confirmedAt?: string;
  forceSkippedAt?: string;
  linkedEntries?: number[];
  /** Pins the SchemaRegistryEntry.version this instance was created under
   * (lib/organization/schema-registry.mjs). Optional today because motor.js
   * has no dynamic registry yet — every schema instance it creates is
   * implicitly against the one hardcoded definition. Adding this now
   * (additive, no behavior change) is what lets a future dynamic-schema
   * motor resolve an already-open instance back to its exact original
   * definition instead of a newer one, per the registry's versioning
   * invariant. */
  schemaVersion?: number;
}

export interface ExternalTask {
  system: string;
  params: Record<string, string>;
  openedAt: string;
  confirmedByUser: boolean;
  confirmedAt?: string;
}

export interface UxState {
  activeOverlay: string | null;
  schemaId: string | null;
  draftOrdre: string | null;
  externalSystem?: string;
  externalInstructions?: string;
}

export type AppState = 'NOT_STARTED' | 'ACTIVE' | 'LOCKED';

export interface UnresolvedItem {
  id: string;
  kind: 'schema' | 'friksjon' | 'main_time' | 'draft';
  label: string;
  data: Record<string, unknown>;
}

export interface OutboxStatus {
  pending: number;
  sent: number;
  failed: number;
}

export interface StorageError {
  type: string;
  message: string;
  raw?: string;
}

export interface PromptQueueItem {
  id: string;
  kind: string;
  target: string;
  priority: number;
  triggeredByRuleIds: string[];
  explanation: Array<{ ruleId: string; factKey: string }>;
}

export interface CompletionStatus {
  missingActions: PromptQueueItem[];
  factsConsidered: number;
  generatedAt: string;
}

export interface TelemetryEvent {
  type: string;
  occurredAt: string;
  organizationId: string;
  data: Record<string, unknown>;
}

export interface RuntimeConfig {
  lonnskoder: Array<{ kode: string; label: string }>;
  sjaDefaults: { sted?: string; arbeidsvarsling?: string } | null;
  kjoretoy: string[];
  externalLinks: Array<{ id: string; title: string; url: string }>;
  hoofdordre: string;
}

export interface MotorSnapshot {
  appState: AppState;
  dayLog: DayLog | null;
  uxState: UxState;
  storageError: StorageError | null;
  isStaleDay: boolean;
  isListening: boolean;
  voiceState: 'idle' | 'listening' | 'processing' | 'error';
  voiceError: string | null;
  schemaError: string | null;
  voiceSupported: boolean;
  editingIndex: number;
  outboxStatus: OutboxStatus;
  exportEnabled: boolean;
  readyToLock: boolean;
  unresolvedCount: number;
  exportStatus: 'disabled' | 'sending' | 'sent' | 'failed' | 'no_data';
  config: RuntimeConfig;
}

// Declare global Motor interface
declare global {
  interface Window {
    Motor?: {
      getSnapshot: () => MotorSnapshot;
      startDay: (text?: string) => void;
      endDay: () => void;
      lockDay: () => void;
      startNewDay: () => void;
      submitEntry: (text?: string, type?: string) => void;
      confirmStartTime: (timeString?: string) => void;
      openSchemaEdit: (schemaId: string) => void;
      closeSchemaEdit: () => void;
      saveSchemaEdit: () => void;
      setSchemaField: (schemaId: string, key: string, value: unknown) => void;
      openDraftEdit: (ordre: string) => void;
      closeDraftEdit: () => void;
      saveDraftEdit: () => void;
      openTimeEntryOverlay: (ordre: string) => void;
      openMainTimeEntryOverlay: () => void;
      hideTimeEntryOverlay: () => void;
      confirmTimeEntry: () => void;
      confirmMainTimeEntry: () => void;
      discardMainTimeEntry: (reason: 'no_work_done' | 'logged_elsewhere') => void;
      draftDecision: (action: string) => void;
      schemaDecision: (action: string) => void;
      friksjonDecision: (action: string) => void;
      noteDecision: (action: string) => void;
      showPreDayOverlay: () => void;
      hidePreDayOverlay: () => void;
      continueFromPreDay: () => void;
      forceStartDay: () => void;
      skipPreDaySchema: (schemaId: string) => void;
      isSchemaRequired: (schemaType: string) => boolean;
      // Entry editing
      openEdit: (index: number) => void;
      saveEdit: (index: number, newText: string) => void;
      cancelEdit: () => void;
      // Pre-day schema deferral
      deferPreDaySchema: (schemaId: string) => void;
      openExternalSystem: (system: string, params?: Record<string, string>) => void;
      confirmExternalTask: (system: string) => void;
      closeExternalInstructionOverlay: () => void;
      // Stale day
      continueStaleDay: () => void;
      endStaleDay: () => void;
      discardStaleDay: () => void;
      // Storage error
      resetCurrentDayOnly: () => void;
      tryIgnoreError: () => void;
      // Voice
      toggleVoice: () => void;
      // Structured entry (verify at moment of input)
      parseEntry: (text: string) => ParsedEntry | null;
      confirmStructuredEntry: (text: string, type: string, parsed: ParsedEntry) => void;
      // Håndrens (flat verification)
      getUnresolvedItems: () => UnresolvedItem[];
      resolveItem: (id: string, action: string, data?: Record<string, unknown>) => void;
      // Operational Completion Engine + Telemetry (Phase 6.5, read-only)
      getCompletionStatus: () => CompletionStatus;
      getTelemetryLog: () => TelemetryEvent[];
      // Generic Schema Renderer support (Phase 9, read-only)
      getSchemaFieldDefinitions: (schemaType: string, origin?: string) => SchemaFieldDefinitions | null;
      // Export
      syncExports: () => void;
      // Report
      buildHumanReadableReport: (log: DayLog) => string;
    };
  }
}

/**
 * Hook for reading motor state in React components.
 *
 * IMPORTANT: This hook provides READ-ONLY access to motor state.
 * UI should NEVER write directly to motor state - always call motor functions.
 *
 * Uses a revision counter that increments on ANY motor-state-change event,
 * then reads fresh from getSnapshot() during render. This ensures React
 * always sees the latest state, even for motor functions that don't emit
 * specific state keys (which is most of them in REACT_MODE).
 *
 * @param key - The state key to subscribe to
 * @returns The current value of that state key, or undefined if motor not ready
 */
export function useMotorState<K extends keyof MotorSnapshot>(key: K): MotorSnapshot[K] | undefined {
  // Revision counter forces re-render; actual value is read from getSnapshot() below
  const [, setRevision] = useState(0);

  useEffect(() => {
    // ANY motor event → increment revision → re-render → fresh getSnapshot() read
    const handler = () => {
      setRevision(r => r + 1);
    };

    window.addEventListener('motor-state-change', handler);

    if (!window.Motor) {
      // Motor not ready yet — poll until available (handles mobile race condition)
      const interval = setInterval(() => {
        if (window.Motor) {
          setRevision(r => r + 1);
          clearInterval(interval);
        }
      }, 50);
      return () => {
        clearInterval(interval);
        window.removeEventListener('motor-state-change', handler);
      };
    } else {
      // Motor already available — trigger initial render with data
      setRevision(r => r + 1);
    }

    return () => {
      window.removeEventListener('motor-state-change', handler);
    };
  }, [key]);

  // Always read fresh from source — never cache in useState
  if (typeof window === 'undefined') return undefined;
  return window.Motor?.getSnapshot()?.[key];
}

/**
 * Hook for getting all motor state at once.
 * Use sparingly - prefer useMotorState(key) for granular updates.
 */
export function useMotorSnapshot(): MotorSnapshot | undefined {
  const [, setRevision] = useState(0);

  useEffect(() => {
    const handler = () => {
      setRevision(r => r + 1);
    };

    window.addEventListener('motor-state-change', handler);

    if (!window.Motor) {
      const interval = setInterval(() => {
        if (window.Motor) {
          setRevision(r => r + 1);
          clearInterval(interval);
        }
      }, 50);
      return () => {
        clearInterval(interval);
        window.removeEventListener('motor-state-change', handler);
      };
    } else {
      setRevision(r => r + 1);
    }

    return () => {
      window.removeEventListener('motor-state-change', handler);
    };
  }, []);

  if (typeof window === 'undefined') return undefined;
  return window.Motor?.getSnapshot();
}

// Read-only motor functions that should NOT dispatch state-change events
const READONLY_MOTOR_FUNCTIONS = new Set(['getSnapshot', 'isSchemaRequired', 'toggleVoice', 'buildHumanReadableReport', 'getUnresolvedItems', 'parseEntry', 'getCompletionStatus', 'getTelemetryLog', 'getSchemaFieldDefinitions']);

/**
 * Hook for calling motor functions.
 * Returns a Proxy that dispatches a motor-state-change event after every
 * state-changing function call. This ensures useMotorState hooks re-render
 * even when motor functions don't emit their own events (which is most of them).
 *
 * Read-only functions (getSnapshot, isSchemaRequired) are NOT wrapped.
 *
 * Polls for window.Motor availability to handle the race condition
 * where React hydrates before motor.js finishes executing (common on mobile).
 */
export function useMotor() {
  const [ready, setReady] = useState(
    typeof window !== 'undefined' && !!window.Motor
  );

  useEffect(() => {
    if (window.Motor) {
      setReady(true);
      return;
    }

    // Poll until motor is available (handles slow mobile script loading)
    const interval = setInterval(() => {
      if (window.Motor) {
        setReady(true);
        clearInterval(interval);
      }
    }, 50);

    // Also listen for motor state changes as a signal that motor is ready
    const handler = () => {
      if (window.Motor) {
        setReady(true);
        clearInterval(interval);
      }
    };
    window.addEventListener('motor-state-change', handler);

    return () => {
      clearInterval(interval);
      window.removeEventListener('motor-state-change', handler);
    };
  }, []);

  return useMemo(() => {
    if (!ready || typeof window === 'undefined' || !window.Motor) return undefined;
    const motor = window.Motor;

    return new Proxy(motor, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function' || READONLY_MOTOR_FUNCTIONS.has(prop as string)) {
          return value;
        }
        // Wrap state-changing functions to dispatch event after call
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(target, args);
          window.dispatchEvent(
            new CustomEvent('motor-state-change', { detail: { key: '__action__' } })
          );
          return result;
        };
      }
    });
  }, [ready]) as typeof window.Motor;
}

/**
 * Derive the current UI phase from motor state.
 * This is a pure function - no side effects.
 */
export function derivePhase(appState: AppState | undefined, dayLog: DayLog | null | undefined):
  'start' | 'operations' | 'handrens' | 'complete' {

  if (!appState || appState === 'NOT_STARTED') {
    return 'start';
  }

  if (appState === 'LOCKED') {
    return 'complete';
  }

  if (appState === 'ACTIVE') {
    if (dayLog?.phase === 'ending') {
      return 'handrens';
    }
    if (dayLog?.phase === 'pre') {
      return 'start'; // Still in pre-day phase
    }
    return 'operations';
  }

  return 'start';
}
