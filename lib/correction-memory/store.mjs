/**
 * CorrectionMemoryStore — same in-memory posture as RuntimeStore/
 * LocalCache elsewhere in this platform. Not wired into motor.js this
 * phase, per the explicit instruction to ship this as an isolated,
 * additive component first.
 *
 * count only ever increments inside recordCorrection() — an explicit
 * user action. Looking a correction up during scoring (scoring.mjs)
 * never touches count. This is the deliberate anti-drift boundary: if
 * usage alone could grow the bonus, this would quietly become a
 * feedback loop indistinguishable from a learning system. It cannot,
 * by construction — only a fresh, explicit "no, I meant X" grows it.
 */
import { bonusForCount, CORRECTION_BONUS_THRESHOLDS } from "./bonus.mjs";

export class CorrectionMemoryStore {
  /** @param {{minCount:number, bonus:number}[]} [correctionBonusThresholds] Runtime-supplied; defaults to the engine's own table */
  constructor(correctionBonusThresholds = CORRECTION_BONUS_THRESHOLDS) {
    /** @type {import('./types.mjs').CorrectionEntry[]} */
    this.entries = [];
    /** @type {import('../telemetry/types.mjs').TelemetryEvent[]} */
    this.telemetry = [];
    this.correctionBonusThresholds = correctionBonusThresholds;
  }

  emit(type, organizationId, data) {
    this.telemetry.push({ type, occurredAt: new Date().toISOString(), organizationId, data });
  }

  /** @returns {import('./types.mjs').CorrectionEntry|null} */
  findActive(category, originalValue, userId, organizationId) {
    return this.entries.find((e) => e.active && e.category === category && e.originalValue === originalValue && e.userId === userId && e.organizationId === organizationId) || null;
  }

  /**
   * Explicit correction. If an active correction already exists for the
   * same (category, originalValue, user) pointing at the SAME
   * correctedValue, count grows. If it points at a DIFFERENT
   * correctedValue, that's a conflict — resolved deterministically
   * ("the most recent explicit action wins", never a guess) by
   * deactivating the old entry and starting a fresh one.
   * @param {{category: import('./types.mjs').CorrectionCategory, originalValue: string, correctedValue: string, userId: string, organizationId: string, runtimeVersion?: number}} input
   * @param {Date} [now]
   * @returns {import('./types.mjs').CorrectionEntry}
   */
  recordCorrection(input, now = new Date()) {
    const { category, originalValue, correctedValue, userId, organizationId, runtimeVersion } = input;
    const existing = this.findActive(category, originalValue, userId, organizationId);

    if (existing && existing.correctedValue === correctedValue) {
      existing.count += 1;
      existing.lastUsedAt = now.toISOString();
      existing.confidenceBonus = bonusForCount(existing.count, this.correctionBonusThresholds);
      this.emit("CorrectionCreated", organizationId, { id: existing.id, count: existing.count, repeated: true });
      return existing;
    }

    if (existing) {
      existing.active = false;
      this.emit("CorrectionConflict", organizationId, { category, originalValue, previous: existing.correctedValue, next: correctedValue });
    }

    /** @type {import('./types.mjs').CorrectionEntry} */
    const entry = {
      id: category + ":" + originalValue + ":" + userId + ":" + this.entries.length,
      category, originalValue, correctedValue, userId, organizationId, runtimeVersion,
      count: 1, createdAt: now.toISOString(), lastUsedAt: now.toISOString(),
      confidenceBonus: bonusForCount(1, this.correctionBonusThresholds), active: true,
    };
    this.entries.push(entry);
    this.emit("CorrectionCreated", organizationId, { id: entry.id, count: 1, repeated: false });
    return entry;
  }

  /**
   * Explicit maintenance pass — not silent decay. Called deliberately,
   * with a fixed cutoff; never runs during scoring.
   * @param {Date} [now]
   * @param {number} [staleDays]
   */
  expireStale(now = new Date(), staleDays = 180) {
    const cutoffMs = now.getTime() - staleDays * 86400000;
    for (const e of this.entries) {
      if (e.active && new Date(e.lastUsedAt).getTime() < cutoffMs) {
        e.active = false;
        this.emit("CorrectionExpired", e.organizationId, { id: e.id, staleDays });
      }
    }
  }

  /** User-initiated reset — deletes (not just deactivates) everything for that user, since the user asked to forget, not merely stop using. @returns {number} entries removed */
  clearForUser(userId, organizationId) {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => !(e.userId === userId && e.organizationId === organizationId));
    return before - this.entries.length;
  }
}
