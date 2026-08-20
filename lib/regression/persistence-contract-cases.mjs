/**
 * PERSISTENCE CONTRACT C3 — the allocation half
 * =============================================
 * `lib/regression/runtime-publish-collision.mjs` already covers DETECTION
 * thoroughly: a duplicate version is rejected, the rejection names the version,
 * the stored runtime survives, history keeps every version, rollback still
 * works. Every one of those cases hands `publish()` a hand-made runtime at a
 * fixed version.
 *
 * None of them exercises the ALLOCATION, which is where C3's gap actually
 * lives. `allocateNextRuntimeVersion` reads the history and returns max + 1;
 * the write happens later, in `publish`. Nothing between them is atomic, so two
 * callers observing the same history do not merely risk computing the same
 * number — they always do.
 *
 * These cases pin that, and the recovery path the rejection message promises.
 * They are deliberately written to PASS against the current implementation: a
 * test that fails in order to announce a known limitation is just a red build,
 * and a red build gets muted. If a future store makes allocation atomic, the
 * first case starts failing, which is the intended signal — C3's story changed
 * and this file must be updated on purpose rather than drifting.
 *
 * See docs/PERSISTENCE_CONTRACT.md § C3 and § "Replacing the store".
 */

import { RuntimeStore } from "../runtime/store.mjs";
import { allocateNextRuntimeVersion } from "../backend/state.mjs";

/** Minimal runtime object — only the fields publish() and the version key read. */
function runtimeAt(organizationId, runtimeVersion, marker) {
  return {
    organizationId,
    runtimeVersion,
    checksum: "checksum-" + marker,
    schemas: [{ id: marker }],
  };
}

let orgCounter = 0;
function freshOrg() {
  orgCounter += 1;
  return `pc-contract-org-${orgCounter}`;
}

export const PERSISTENCE_CONTRACT_CASES = [
  {
    id: "c3_allocation_is_empty_history_safe",
    description:
      "A first publish must allocate version 1 rather than -Infinity. Math.max() with no arguments returns -Infinity, so the empty-history branch is load-bearing and not defensive decoration.",
    run: () => allocateNextRuntimeVersion([]) === 1,
  },
  {
    id: "c3_two_readers_of_the_same_history_allocate_the_same_version",
    description:
      "THE C3 GAP AT ITS SOURCE. Allocation is a read; the publish that consumes it is a later write; nothing in between is atomic. Two callers observing the same history do not merely risk colliding — they compute the identical number every time. The contract names this the clearest single reason the current architecture is being replaced, and until now it was asserted only in prose and a comment.",
    run: () => {
      const store = new RuntimeStore();
      const org = freshOrg();
      store.publish(runtimeAt(org, 1, "seed"), "seed");

      // Neither caller is at fault: each read the store, each saw the same
      // history. fly.toml runs a machine that does not serialize them.
      const versionA = allocateNextRuntimeVersion(store.history(org));
      const versionB = allocateNextRuntimeVersion(store.history(org));

      return versionA === 2 && versionB === 2;
    },
  },
  {
    id: "c3_allocation_advances_only_after_the_write_lands",
    description:
      "The gap closes only when the publish commits. Proving the allocation moves after — and not before — is what distinguishes 'read-then-write' from an atomic sequence, and is the property a future store must change.",
    run: () => {
      const store = new RuntimeStore();
      const org = freshOrg();
      store.publish(runtimeAt(org, 1, "seed"), "seed");

      const before = allocateNextRuntimeVersion(store.history(org));
      store.publish(runtimeAt(org, before, "writer_a"), "writer_a");
      const after = allocateNextRuntimeVersion(store.history(org));

      return before === 2 && after === 3;
    },
  },
  {
    id: "c3_recompiling_after_a_rejection_actually_resolves_the_collision",
    description:
      "The rejection tells the loser to recompile against current history and publish again. That recovery has to work, or detection is a dead end that strands a legitimate publish. After losing, re-allocating must yield the next free version and publish cleanly.",
    run: () => {
      const store = new RuntimeStore();
      const org = freshOrg();
      store.publish(runtimeAt(org, 1, "seed"), "seed");

      const contested = allocateNextRuntimeVersion(store.history(org));
      store.publish(runtimeAt(org, contested, "writer_a"), "writer_a");

      let rejected = false;
      try {
        store.publish(runtimeAt(org, contested, "writer_b"), "writer_b");
      } catch (e) {
        rejected = /already published/i.test(String(e && e.message));
      }

      const retry = allocateNextRuntimeVersion(store.history(org));
      const manifest = store.publish(runtimeAt(org, retry, "writer_b"), "writer_b");

      return (
        rejected === true &&
        retry === contested + 1 &&
        manifest.runtimeVersion === retry &&
        store.getActive(org).runtimeVersion === retry
      );
    },
  },
  {
    id: "c3_allocation_is_scoped_per_organization",
    description:
      "C5 isolation applied to allocation: a busy organization's publishes must not advance a quiet organization's counter. Allocation reads only the history it was handed, which is what makes that true by construction rather than by convention.",
    run: () => {
      const store = new RuntimeStore();
      const busy = freshOrg();
      const quiet = freshOrg();

      store.publish(runtimeAt(busy, 1, "a"), "seed");
      store.publish(runtimeAt(busy, 2, "b"), "seed");
      store.publish(runtimeAt(busy, 3, "c"), "seed");

      return (
        allocateNextRuntimeVersion(store.history(quiet)) === 1 &&
        allocateNextRuntimeVersion(store.history(busy)) === 4
      );
    },
  },
];
