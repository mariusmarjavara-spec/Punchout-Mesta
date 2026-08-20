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
const secret = registerDevice("restart_test_device", "regression", "fixed-test-secret-for-restart-check", "mesta");
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

/**
 * Independent-review finding PO-03 (2026-08-14): a production deploy with
 * PUNCHOUT_DATA_DIR unset previously fell back to the working directory —
 * not durable storage on most hosts — with no error anywhere, a silent
 * data-loss risk. persistence.mjs now throws at import time when
 * NODE_ENV=production and the var is genuinely unset. Proves both the
 * fail-fast case (spawns a real child process the same way the restart
 * check above does, so this exercises the real module-load throw, not a
 * mocked one) and that production WITH the var set is unaffected.
 */
export function runProductionDataDirGuardCheck() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const importScriptPath = (dir) => {
    const scriptPath = path.join(dir, "importCheck.mjs");
    writeFileSync(scriptPath, `import ${JSON.stringify(pathToFileURL(path.resolve(process.cwd(), "lib/backend/persistence.mjs")).href)};\nconsole.log("imported-ok");\n`);
    return scriptPath;
  };

  const tmpDir = mkdtempSync(path.join(tmpdir(), "punchout-datadir-guard-test-"));
  try {
    // Production + unset PUNCHOUT_DATA_DIR must fail fast.
    const unsetScript = importScriptPath(tmpDir);
    const envWithoutDataDir = { ...process.env, NODE_ENV: "production" };
    delete envWithoutDataDir.PUNCHOUT_DATA_DIR;
    const runUnset = spawnSync(process.execPath, [unsetScript], { env: envWithoutDataDir, encoding: "utf8" });
    const unsetStderr = String(runUnset.stderr ?? "");
    check(
      "production_without_data_dir_fails_fast",
      runUnset.status !== 0 && unsetStderr.includes("PUNCHOUT_DATA_DIR is required"),
      { status: runUnset.status, stderr: unsetStderr },
    );

    // Production + a real PUNCHOUT_DATA_DIR must import cleanly.
    const setScript = importScriptPath(tmpDir);
    const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-datadir-guard-real-"));
    try {
      const envWithDataDir = { ...process.env, NODE_ENV: "production", PUNCHOUT_DATA_DIR: dataDir };
      const runSet = spawnSync(process.execPath, [setScript], { env: envWithDataDir, encoding: "utf8" });
      check("production_with_data_dir_imports_cleanly", runSet.status === 0 && runSet.stdout.includes("imported-ok"), {
        status: runSet.status,
        stderr: runSet.stderr,
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }

    // Non-production (e.g. local dev/test) + unset PUNCHOUT_DATA_DIR must
    // still import cleanly -- the guard must not fire outside production.
    const devScript = importScriptPath(tmpDir);
    const envDev = { ...process.env, NODE_ENV: "development" };
    delete envDev.PUNCHOUT_DATA_DIR;
    const runDev = spawnSync(process.execPath, [devScript], { env: envDev, encoding: "utf8" });
    check("non_production_without_data_dir_still_imports_cleanly", runDev.status === 0 && runDev.stdout.includes("imported-ok"), {
      status: runDev.status,
      stderr: runDev.stderr,
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  return results;
}
