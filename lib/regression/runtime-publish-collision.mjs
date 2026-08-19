/**
 * Two publishes must not be able to claim the same runtime version.
 *
 * `compileRuntime` allocates a version by reading the current history and
 * adding one (`state.mjs`: `Math.max(...history.map(m => m.runtimeVersion)) + 1`),
 * and `publish` then writes it. The read and the write are not atomic, so two
 * callers that compile against the same observed history both arrive at the
 * same version.
 *
 * That was survivable while nothing ran concurrently, but `fly.toml` sets
 * `min_machines_running = 1` and caps nothing, so more than one machine may
 * serve at once.
 *
 * What made it dangerous rather than merely untidy is that `publish` stored the
 * runtime with `runtimesByVersionKey.set(...)`, which overwrites. The second
 * publish replaced the first's runtime object under the same key while pushing
 * its own manifest, so the first publish's content was gone and nothing
 * reported it — no error, no log, no conflicting-state signal. A field
 * configuration would simply not be the one that was published.
 *
 * These checks are about detection, not about which persistence architecture
 * Punchout ends up with. Rejecting a duplicate version is correct under
 * single-writer JSON and under a datastore migration alike, so this does not
 * presuppose that decision.
 */

import { RuntimeStore } from "../runtime/store.mjs";

/**
 * Minimal runtime object. Only the fields publish() and the version key read.
 * @param {string} organizationId
 * @param {number} runtimeVersion
 * @param {string} marker  distinguishes two runtimes claiming one version
 */
function runtimeAt(organizationId, runtimeVersion, marker) {
  return {
    organizationId,
    runtimeVersion,
    checksum: "checksum-" + marker,
    schemas: [{ id: marker }],
  };
}

export function runRuntimePublishCollisionChecks() {
  const results = [];
  const check = (id, ok, detail) =>
    results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const org = "collision-test-org";

  // ── The race, reproduced deterministically ────────────────────────────────
  // Two callers compile against the same observed history. Neither is at
  // fault: each read the store and each saw version 1 as next.
  {
    const store = new RuntimeStore();
    const first = runtimeAt(org, 1, "first");
    const second = runtimeAt(org, 1, "second");

    store.publish(first, "writer-a");

    let rejected = false;
    let thrown = null;
    try {
      store.publish(second, "writer-b");
    } catch (err) {
      rejected = true;
      thrown = err;
    }

    check(
      "runtime_publish_rejects_duplicate_version",
      rejected,
      { detail: "second publish of version 1 was accepted; the first is silently lost" },
    );

    check(
      "runtime_publish_conflict_names_the_version",
      rejected && /version/i.test(String(thrown && thrown.message)),
      { message: String(thrown && thrown.message) },
    );

    // The first publish must survive intact. This is the actual damage: not
    // that a second manifest exists, but that the stored runtime under that
    // version key was replaced.
    const active = store.getActive(org);
    check(
      "runtime_publish_collision_does_not_replace_stored_runtime",
      active !== null && active.checksum === "checksum-first",
      { checksum: active && active.checksum },
    );
  }

  // ── The cap must still do its job ─────────────────────────────────────────
  // A guard that rejected ordinary publishing would be worse than the defect.
  {
    const store = new RuntimeStore();
    store.publish(runtimeAt(org, 1, "v1"), "writer-a");
    store.publish(runtimeAt(org, 2, "v2"), "writer-a");
    store.publish(runtimeAt(org, 3, "v3"), "writer-a");

    const active = store.getActive(org);
    check(
      "runtime_publish_sequential_versions_still_work",
      active !== null && active.checksum === "checksum-v3",
      { checksum: active && active.checksum },
    );

    check(
      "runtime_publish_history_keeps_every_version",
      store.history(org).length === 3,
      { length: store.history(org).length },
    );
  }

  // ── Rollback must not be mistaken for a collision ─────────────────────────
  // Rollback reactivates an existing version deliberately. If the guard were
  // written against the manifest list rather than the publish path, it would
  // break this.
  {
    const store = new RuntimeStore();
    store.publish(runtimeAt(org, 1, "v1"), "writer-a");
    store.publish(runtimeAt(org, 2, "v2"), "writer-a");
    store.rollback(org, 1);

    const active = store.getActive(org);
    check(
      "runtime_rollback_still_reactivates_an_earlier_version",
      active !== null && active.checksum === "checksum-v1",
      { checksum: active && active.checksum },
    );
  }

  // ── Organizations are independent ─────────────────────────────────────────
  {
    const store = new RuntimeStore();
    store.publish(runtimeAt("org-a", 1, "a1"), "writer-a");
    let crossOrgRejected = false;
    try {
      store.publish(runtimeAt("org-b", 1, "b1"), "writer-b");
    } catch {
      crossOrgRejected = true;
    }
    check(
      "runtime_publish_version_1_is_per_organization",
      !crossOrgRejected,
      { detail: "org-b's first publish was rejected because org-a already had a version 1" },
    );
  }

  return results;
}
