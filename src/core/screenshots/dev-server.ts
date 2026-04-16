/**
 * Dev server management for screenshot capture.
 */

import { spawn, type ChildProcess } from "child_process";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { sleep } from "../utils.js";

export function installDeps(workDir: string, appFullPath: string): void {
  const rootPkgPath = join(workDir, "package.json");
  if (existsSync(rootPkgPath)) {
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
    if (rootPkg.workspaces) {
      execSync("npm install --ignore-scripts 2>&1", {
        cwd: workDir,
        encoding: "utf-8",
        timeout: 180_000,
      });
    } else {
      execSync("npm install --ignore-scripts 2>&1", {
        cwd: appFullPath,
        encoding: "utf-8",
        timeout: 180_000,
      });
    }
  }
}

export function startDevServer(
  appFullPath: string,
  port: number
): ChildProcess {
  const serverProcess = spawn("npm", ["run", "dev"], {
    cwd: appFullPath,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return serverProcess;
}

export async function waitForServer(
  url: string,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.status < 500) return true;
    } catch {
      // Server not ready yet
    }
    await sleep(2_000);
  }
  return false;
}

export function killServer(serverProcess: ChildProcess): void {
  if (serverProcess.pid) {
    try {
      process.kill(-serverProcess.pid, "SIGTERM");
    } catch {
      try {
        serverProcess.kill("SIGTERM");
      } catch {
        /* best effort */
      }
    }
  }
}
