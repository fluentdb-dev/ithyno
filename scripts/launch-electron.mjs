// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * launch-electron.mjs
 *
 * Cross-platform replacement for a bare `electron .` in electron/package.json's
 * `dev` script. VS Code's integrated terminal (and any other terminal spawned
 * from an already-running Electron app, e.g. a nested Electron dev shell)
 * inherits ELECTRON_RUN_AS_NODE=1 from its parent process. Electron checks
 * that variable on startup and, when set, runs as a plain Node.js process
 * instead of launching the actual GUI app — no window, no error, it just
 * silently behaves like `node .` instead of `electron .`.
 *
 * `env -u ELECTRON_RUN_AS_NODE electron .` fixes this on POSIX shells, but
 * there's no single cross-platform shell one-liner for "unset an env var"
 * that works the same in npm's script shell on both Windows (cmd.exe) and
 * POSIX — hence this tiny Node wrapper, which deletes the var from its own
 * environment before spawning the real electron.exe/electron binary.
 */
import { spawn } from "node:child_process";
import electronPath from "electron";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[launch-electron] failed to spawn electron:", err);
  process.exit(1);
});
