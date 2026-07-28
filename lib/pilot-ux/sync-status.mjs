/**
 * Execution Sprint 3, Oppgave 3: collapse motor.js's outboxStatus
 * ({pending, sent, failed} — motor.js:5044-5054, already live in
 * MotorSnapshot) plus browser online/offline state into one of 4 honest
 * states for a small, discrete UI indicator.
 *
 * Deliberately 4 states, not the 5 example states from the brief
 * ("lagret lokalt" / "venter på synk" / "synkroniserer" / "ferdig
 * synkronisert" / "feil ved synk"): motor.js's getOutboxStatus() merges
 * "queued, not yet attempted" and "actively sending" into one `pending`
 * count (`if (s==="pending"||s==="sending") pending++`), so "venter på
 * synk" and "synkroniserer" cannot be told apart without a motor.js
 * change (out of scope this sprint) — both map to "syncing" here rather
 * than fabricating a distinction the data doesn't support.
 *
 * @param {{pending:number, sent:number, failed:number}|null|undefined} outboxStatus
 * @param {boolean} isOnline
 * @returns {"synced"|"offline_pending"|"syncing"|"sync_failed"}
 */
export function deriveSyncStatus(outboxStatus, isOnline) {
  if (!outboxStatus) return "synced";
  if (outboxStatus.failed > 0) return "sync_failed";
  if (outboxStatus.pending > 0) return isOnline ? "syncing" : "offline_pending";
  return "synced";
}
