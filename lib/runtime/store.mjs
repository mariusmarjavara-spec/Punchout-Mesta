/**
 * Runtime Store contracts — Del 3. No database: an in-memory store here
 * (same posture as lib/sync/cache.mjs's LocalCache), standing in for
 * whatever Backend eventually persists to. Append-only history, same
 * pattern motor.js already uses for locked days (pushToHistory) — publish
 * never deletes a prior version, rollback reactivates one instead of
 * reconstructing it.
 */

/**
 * Mock signature — deterministic, NOT real cryptography. A real backend
 * signs with HMAC/asymmetric keys (motor.js's own export sync already has
 * a real HMAC path via ADMIN_CONFIG.exportHmacSecret — same shape of
 * concern, mocked here for the same reason lib/adapters/landax-adapter.mjs
 * mocks send()).
 * @param {{runtimeVersion:number, organizationId:string, checksum:string}} manifestCore
 * @returns {string}
 */
export function signRuntime(manifestCore) {
  const s = JSON.stringify(manifestCore);
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash + s.charCodeAt(i)) >>> 0;
  return "sig_" + hash.toString(16);
}

/** organizationId+runtimeVersion, not checksum — see runtimesByVersionKey comment below. */
function versionKey(organizationId, runtimeVersion) {
  return organizationId + "@v" + runtimeVersion;
}

export class RuntimeStore {
  constructor() {
    /** @type {Map<string, import('./types.mjs').RuntimeManifest[]>} */
    this.manifestsByOrg = new Map();
    /**
     * Validation Sprint Del 5/6 finding: this was previously keyed by
     * checksum alone (runtimesByChecksum). Checksum is a CONTENT hash —
     * two publishes with unchanged source content (a re-publish, or a
     * change reverted before the next publish) produce the SAME
     * checksum but a DIFFERENT runtimeVersion. Keyed by checksum, the
     * second publish silently overwrote the first's stored object, so
     * a later rollback to the OLDER version's manifest could still
     * serve the NEWER version's runtime object (wrong runtimeVersion,
     * found via a real 3-device rollback test, not reasoned about).
     * Keyed by organizationId+runtimeVersion instead, every published
     * version is independently retrievable regardless of content
     * collisions with any other version. checksum stays on the runtime
     * object itself for integrity verification — just not as the
     * storage key.
     * @type {Map<string, import('./types.mjs').OrganizationRuntime>}
     */
    this.runtimesByVersionKey = new Map();
  }

  /**
   * @param {import('./types.mjs').OrganizationRuntime} runtime
   * @param {string} publishedBy
   * @returns {import('./types.mjs').RuntimeManifest}
   */
  publish(runtime, publishedBy) {
    const manifests = this.manifestsByOrg.get(runtime.organizationId) || [];
    const previousActive = manifests.find((m) => m.status === "active");
    if (previousActive) previousActive.status = "superseded";

    const manifestCore = { runtimeVersion: runtime.runtimeVersion, organizationId: runtime.organizationId, checksum: runtime.checksum };
    /** @type {import('./types.mjs').RuntimeManifest} */
    const manifest = {
      ...manifestCore,
      signature: signRuntime(manifestCore),
      publishedAt: new Date().toISOString(),
      publishedBy,
      status: "active",
      previousVersion: previousActive ? previousActive.runtimeVersion : undefined,
    };
    manifests.push(manifest);
    this.manifestsByOrg.set(runtime.organizationId, manifests);
    this.runtimesByVersionKey.set(versionKey(runtime.organizationId, runtime.runtimeVersion), runtime);
    return manifest;
  }

  /** @param {string} organizationId @returns {import('./types.mjs').OrganizationRuntime|null} */
  getActive(organizationId) {
    const active = (this.manifestsByOrg.get(organizationId) || []).find((m) => m.status === "active");
    return active ? this.runtimesByVersionKey.get(versionKey(organizationId, active.runtimeVersion)) : null;
  }

  /**
   * Reactivate an older version. Nothing is deleted or reconstructed —
   * the prior active manifest is marked "rolledback", the target is
   * marked "active" again.
   * @param {string} organizationId
   * @param {number} toVersion
   * @returns {{ok: boolean, manifest?: import('./types.mjs').RuntimeManifest, error?: string}}
   */
  rollback(organizationId, toVersion) {
    const manifests = this.manifestsByOrg.get(organizationId) || [];
    const target = manifests.find((m) => m.runtimeVersion === toVersion);
    if (!target) return { ok: false, error: "runtimeVersion " + toVersion + " not found" };
    const current = manifests.find((m) => m.status === "active");
    if (current) current.status = "rolledback";
    target.status = "active";
    return { ok: true, manifest: target };
  }

  /** @param {string} organizationId @returns {import('./types.mjs').RuntimeManifest[]} */
  history(organizationId) {
    return this.manifestsByOrg.get(organizationId) || [];
  }
}
