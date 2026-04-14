/**
 * Frees common Next.js dev ports so a single dev server can start cleanly.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const ports = [3000, 3001];

function killWin(pid) {
  try {
    execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

function killUnix(port) {
  try {
    execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { shell: "/bin/sh", stdio: "ignore" });
  } catch {
    /* ignore */
  }
}

export function killDevPorts() {
  if (platform() === "win32") {
    for (const port of ports) {
      try {
        const out = execSync(`netstat -ano | findstr ":${port} "`, { encoding: "utf8" });
        const pids = new Set();
        for (const line of out.split("\n")) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) pids.add(pid);
        }
        for (const pid of pids) killWin(pid);
      } catch {
        /* no listeners */
      }
    }
  } else {
    for (const port of ports) killUnix(port);
  }
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  killDevPorts();
}
