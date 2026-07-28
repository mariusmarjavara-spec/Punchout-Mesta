/**
 * Human-readable reason an entry is locked (Execution Sprint 3, Oppgave 2).
 * Mirrors operations-phase.tsx's own lock-flag reading (the `isLocked`
 * check already there: vaktloggConfirmed/Discarded for "vaktlogg" type,
 * ruhDecision for "hendelse" type, converted/keptAsNote otherwise) so the
 * short badge and the expanded "why locked" panel always agree — pure
 * function so it's regression-testable without rendering React.
 *
 * @param {{vaktloggConfirmed?:boolean, vaktloggDiscarded?:boolean, ruhDecision?:string, converted?:boolean, keptAsNote?:boolean}} entry
 * @returns {{short: string, full: string} | null} null if none of the known lock flags are set
 */
export function describeLockReason(entry) {
  if (entry.vaktloggConfirmed) return { short: "Bekreftet", full: "Vaktloggen er bekreftet og kan ikke endres." };
  if (entry.vaktloggDiscarded) return { short: "Forkastet", full: "Vaktloggen er forkastet og kan ikke endres." };
  if (entry.ruhDecision === "yes") return { short: "RUH opprettet", full: "Det er opprettet en RUH-rapport for denne hendelsen, og oppføringen kan ikke endres." };
  if (entry.ruhDecision === "no") return { short: "Ikke RUH", full: "Hendelsen er vurdert som ikke RUH-pliktig, og oppføringen kan ikke endres." };
  if (entry.converted) return { short: "Konvertert", full: "Oppføringen er konvertert til en strukturert registrering og kan ikke endres." };
  if (entry.keptAsNote) return { short: "Beholdt", full: "Oppføringen er beholdt som notat og kan ikke endres." };
  return null;
}
