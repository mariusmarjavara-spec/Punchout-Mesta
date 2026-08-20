import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

function appendChunk(buffer, chunk) {
  const text = String(chunk ?? "");
  if (!text) return;
  buffer.push(text);
  if (buffer.length > 200) buffer.splice(0, buffer.length - 200);
}

function snapshotEnv(env = {}) {
  const keys = ["PORT", "PUNCHOUT_DATA_DIR", "PUNCHOUT_ADMIN_TOKEN", "NODE_ENV"];
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(env, key)) out[key] = env[key];
  }
  return out;
}

export async function waitForServer(baseUrl, timeoutMs = 60000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        return {
          ok: true,
          probe: `${baseUrl}/api/health`,
          status: res.status,
        };
      }
      lastError = `health returned ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(500);
  }
  return {
    ok: false,
    probe: `${baseUrl}/api/health`,
    lastError,
  };
}

export async function startNextDevServer({ cwd, port, env, timeoutMs = 60000 }) {
  const command = [process.execPath, "node_modules/next/dist/bin/next", "dev", "-p", String(port)];
  const stdout = [];
  const stderr = [];
  const proc = spawn(command[0], command.slice(1), {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (chunk) => appendChunk(stdout, chunk));
  proc.stderr?.on("data", (chunk) => appendChunk(stderr, chunk));

  const readiness = await waitForServer(`http://localhost:${port}`, timeoutMs);
  return {
    proc,
    readiness,
    diagnostics: {
      command: command.join(" "),
      cwd,
      env: snapshotEnv(env),
      port,
      startupTimeoutMs: timeoutMs,
      readinessProbe: readiness.probe,
      stdout: stdout.join(""),
      stderr: stderr.join(""),
      exitCode: proc.exitCode,
      pid: proc.pid,
      teardown: process.platform === "win32"
        ? "taskkill /PID <pid> /T /F then wait for exit"
        : "SIGTERM then wait for exit",
    },
  };
}

export async function stopServerTree(proc) {
  if (!proc) return;
  const pid = proc.pid;
  if (!pid) return;

  const exited = new Promise((resolve) => {
    if (proc.exitCode !== null) {
      resolve();
      return;
    }
    proc.once("exit", () => resolve());
  });

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    await new Promise((resolve) => killer.once("exit", () => resolve()));
  } else {
    try {
      proc.kill("SIGTERM");
    } catch {
      // best effort
    }
  }

  await Promise.race([exited, delay(5000)]);
}
