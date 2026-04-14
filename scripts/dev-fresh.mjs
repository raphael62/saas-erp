/**
 * Stops dev servers on 3000/3001, waits for handles to release, deletes .next (retry),
 * then starts `next dev`.
 *
 * If .next still won't delete (EPERM on .next\\trace): stray Node process or Cursor still has the folder open.
 * Do not run "kill all node" from inside npm (it stops this script). Use scripts\\dev-fresh-nuke.cmd instead.
 * Instead double-click: scripts\\dev-fresh-nuke.cmd
 */
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

import { killDevPorts } from "./kill-dev-ports.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = path.join(root, ".next");
const isWin = platform() === "win32";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Windows: cmd rmdir often succeeds when Node fs.rmSync hits EPERM on .next\\trace */
function rmdirNextCmd() {
  if (!isWin) return false;
  try {
    execSync("if exist .next attrib -r -h -s .next\\*.* /s", {
      cwd: root,
      stdio: "pipe",
      windowsHide: true,
      shell: "cmd.exe",
    });
  } catch {
    /* ignore */
  }
  try {
    execSync("if exist .next rmdir /s /q .next", {
      cwd: root,
      stdio: "pipe",
      windowsHide: true,
      shell: "cmd.exe",
    });
    return true;
  } catch {
    return false;
  }
}

killDevPorts();
console.log("Waiting for Windows to release .next file locks…");
await sleep(isWin ? 3000 : 1500);

let lastErr = null;
for (let i = 0; i < 15; i++) {
  try {
    if (!fs.existsSync(nextDir)) {
      lastErr = null;
      break;
    }
    if (isWin) rmdirNextCmd();
    if (fs.existsSync(nextDir)) {
      fs.rmSync(nextDir, { recursive: true, force: true });
    }
    if (!fs.existsSync(nextDir)) {
      lastErr = null;
      break;
    }
  } catch (e) {
    lastErr = e;
    console.warn(`Retry ${i + 1}/15: could not remove .next — ${e.message}`);
  }
  await sleep(800);
}

if (fs.existsSync(nextDir)) {
  console.error("\nCould not delete .next (files still locked). Do this:\n");
  console.error("  1) Close EVERY Cursor / VS Code terminal tab (you had several open).");
  console.error("  2) Task Manager → end all “Node.js” processes.");
  console.error("  3) Double-click this file in File Explorer (starts dev AFTER a full Node kill):");
  console.error("     " + path.join(root, "scripts", "dev-fresh-nuke.cmd"));
  console.error("\n  Or quit Cursor completely, delete the folder manually:");
  console.error("     " + nextDir);
  console.error("  Then: npm run dev\n");
  if (lastErr) console.error(String(lastErr));
  process.exit(1);
}

const cacheDir = path.join(root, "node_modules", ".cache");
try {
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
} catch {
  /* optional */
}

console.log("Starting Next.js dev server…\n");
const child = spawn("npx", ["next", "dev"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
