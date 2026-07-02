/**
 * Phase A Del 2/9 — permanent regression proof that backend state
 * survives a process restart. Runs entirely in plain Node (no HTTP
 * server needed, CI-friendly): spawns a child process that mutates
 * state via lib/backend/state.mjs and exits (simulating a full process
 * teardown — module-level in-memory state is gone), then spawns a
 * SECOND, independent child process that imports state.mjs fresh and
 * confirms the mutations are still there, read back only from the
 * persisted file.
 *
 * Uses an isolated PUNCHOUT_DATA_DIR (OS temp dir) so this never
 * touches real dev/pilot persisted state.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STATE_MODULE_URL = pathToFileURL(path.resolve(process.cwd(), "lib/backend/state.mjs")).href;

const CHILD_A_SCRIPT = `
import { registerDevice, compileFromPackage, publish } from ${JSON.stringify(STATE_MODULE_URL)};
const secret = registerDevice("restart_test_device", "regression", "fixed-test-secret-for-restart-check");
const compiled = compileFromPackage("mesta");
const manifest = publish(compiled.runtime, "restart_test");
console.log(JSON.stringify({ secret, organizationId: compiled.organizationId, runtimeVersion: manifest.runtimeVersion }));
`;

const CHILD_B_SCRIPT = `
import { getDeviceSecret, getHistory, getActiveRuntime } from ${JSON.stringify(STATE_MODULE_URL)};
const secret = getDeviceSecret("restart_test_device");
const history = getHistory(${JSON.stringify("__ORG_ID__")});
const active = getActiveRuntime(${JSON.stringify("__ORG_ID__")});
console.log(JSON.stringify({ secret, historyLength: history.length, activeVersion: active ? active.runtimeVersion : null }));
`;

export function runBackendPersistenceCheck() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-persistence-test-"));
  const env = { ...process.env, PUNCHOUT_DATA_DIR: dataDir };

  try {
    const scriptAPath = path.join(dataDir, "childA.mjs");
    writeFileSync(scriptAPath, CHILD_A_SCRIPT);
    const runA = spawnSync(process.execPath, [scriptAPath], { env, encoding: "utf8" });
    if (runA.status !== 0) {
      check("backend_persistence_child_a_runs", false, { stderr: runA.stderr, stdout: runA.stdout });
      return results;
    }
    const outA = JSON.parse(runA.stdout.trim().split("\n").pop());
    check("backend_persistence_child_a_runs", true);

    const scriptBSource = CHILD_B_SCRIPT.replaceAll("__ORG_ID__", outA.organizationId);
    const scriptBPath = path.join(dataDir, "childB.mjs");
    writeFileSync(scriptBPath, scriptBSource);
    const runB = spawnSync(process.execPath, [scriptBPath], { env, encoding: "utf8" });
    if (runB.status !== 0) {
      check("backend_persistence_child_b_runs", false, { stderr: runB.stderr, stdout: runB.stdout });
      return results;
    }
    const outB = JSON.parse(runB.stdout.trim().split("\n").pop());
    check("backend_persistence_child_b_runs", true);

    check("backend_persistence_device_secret_survives_restart", outB.secret === outA.secret, { expected: outA.secret, actual: outB.secret });
    check("backend_persistence_runtime_history_survives_restart", outB.historyLength >= 1, { historyLength: outB.historyLength });
    check("backend_persistence_active_runtime_version_survives_restart", outB.activeVersion === outA.runtimeVersion, { expected: outA.runtimeVersion, actual: outB.activeVersion });
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }

  return results;
}
