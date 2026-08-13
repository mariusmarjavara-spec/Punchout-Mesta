/**
 * Execution Sprint 4, Oppgave 4 — permanent regression proof for the
 * exact backup/restore drill run manually against a real standalone
 * server this sprint: write real state -> back up the state file ->
 * simulate disaster (delete it) -> confirm a fresh boot degrades
 * gracefully (doesn't crash) -> restore the backup -> confirm the data
 * is back. lib/regression/backend-persistence.mjs already proves plain
 * restart-survival; this proves the disaster-recovery path specifically
 * (data loss + restore from a backup copy), which is a different claim.
 *
 * Same "spawn a real, separate Node process" approach as
 * backend-persistence.mjs, since lib/backend/state.mjs only loads from
 * disk once, at module import — there's no in-process "reload" to call.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const STATE_MODULE_URL = pathToFileURL(path.resolve(process.cwd(), "lib/backend/state.mjs")).href;

const WRITE_STATE_SCRIPT = `
import { registerDevice, compileFromPackage, publish } from ${JSON.stringify(STATE_MODULE_URL)};
const secret = registerDevice("drill_device", "backup_drill", "drill-secret", "mesta");
const compiled = compileFromPackage("mesta");
const manifest = publish(compiled.runtime, "backup_drill");
console.log(JSON.stringify({ secret, organizationId: compiled.organizationId, runtimeVersion: manifest.runtimeVersion }));
`;

const READ_STATE_SCRIPT = `
import { getDeviceSecret, getActiveRuntime, listDevices } from ${JSON.stringify(STATE_MODULE_URL)};
console.log(JSON.stringify({
  secret: getDeviceSecret("drill_device"),
  active: getActiveRuntime(${JSON.stringify("__ORG_ID__")}),
  deviceCount: listDevices().length,
}));
`;

function run(scriptSource, dataDir) {
  const scriptPath = path.join(dataDir, `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mjs`);
  writeFileSync(scriptPath, scriptSource);
  return spawnSync(process.execPath, [scriptPath], { env: { ...process.env, PUNCHOUT_DATA_DIR: dataDir }, encoding: "utf8" });
}

export function runBackupRestoreDrill() {
  const results = [];
  const check = (id, ok, detail) => results.push({ id, passed: ok, error: ok ? null : JSON.stringify(detail) });

  const dataDir = mkdtempSync(path.join(tmpdir(), "punchout-backup-drill-"));
  const stateFile = path.join(dataDir, "backend-state.json");
  const backupFile = path.join(dataDir, "..", "backend-state-backup.json");

  try {
    // 1. Write real state.
    const writeRun = run(WRITE_STATE_SCRIPT, dataDir);
    if (writeRun.status !== 0) {
      check("backup_drill_writes_state", false, { stderr: writeRun.stderr });
      return results;
    }
    const written = JSON.parse(writeRun.stdout.trim().split("\n").pop());
    check("backup_drill_writes_state", true);
    check("backup_drill_state_file_exists_after_write", existsSync(stateFile), { stateFile });

    // 2. Back up the state file (exactly what a daily manual copy, per pilot-operations.md, does).
    copyFileSync(stateFile, backupFile);
    check("backup_drill_backup_copy_created", existsSync(backupFile), { backupFile });

    // 3. Simulate disaster: delete the live state file.
    unlinkSync(stateFile);
    check("backup_drill_live_state_deleted", !existsSync(stateFile), { stateFile });

    // 4. Fresh boot after disaster must degrade gracefully (no crash, empty state) — proves the Oppgave 1 finding as an automated case, not just a one-off manual observation.
    const readAfterDisaster = run(READ_STATE_SCRIPT.replaceAll("__ORG_ID__", written.organizationId), dataDir);
    check("backup_drill_boots_cleanly_after_disaster", readAfterDisaster.status === 0, { stderr: readAfterDisaster.stderr });
    if (readAfterDisaster.status === 0) {
      const afterDisaster = JSON.parse(readAfterDisaster.stdout.trim().split("\n").pop());
      check("backup_drill_state_empty_after_disaster", afterDisaster.deviceCount === 0 && afterDisaster.secret == null, { afterDisaster });
    }

    // 5. Restore the backup.
    copyFileSync(backupFile, stateFile);
    check("backup_drill_restore_copies_file_back", existsSync(stateFile), { stateFile });

    // 6. Fresh boot after restore must see the ORIGINAL data again.
    const readAfterRestore = run(READ_STATE_SCRIPT.replaceAll("__ORG_ID__", written.organizationId), dataDir);
    check("backup_drill_boots_after_restore", readAfterRestore.status === 0, { stderr: readAfterRestore.stderr });
    if (readAfterRestore.status === 0) {
      const afterRestore = JSON.parse(readAfterRestore.stdout.trim().split("\n").pop());
      check("backup_drill_secret_restored", afterRestore.secret === written.secret, { expected: written.secret, actual: afterRestore.secret });
      check("backup_drill_active_runtime_restored", afterRestore.active?.runtimeVersion === written.runtimeVersion, { expected: written.runtimeVersion, actual: afterRestore.active?.runtimeVersion });
      check("backup_drill_device_count_restored", afterRestore.deviceCount === 1, { deviceCount: afterRestore.deviceCount });
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
    if (existsSync(backupFile)) rmSync(backupFile, { force: true });
  }

  return results;
}
