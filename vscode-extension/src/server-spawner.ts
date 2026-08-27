// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn, ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import * as http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";

export type SpawnedServer = {
  /** Full URL including `?token=…` — hand this directly to the webview. */
  url: string;
  port: number;
  child: ChildProcess;
  dispose(): void;
};

/** Ask the OS for a free ephemeral port by binding, reading, and releasing. */
export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error("failed to obtain ephemeral port"));
      }
    });
  });
}

/** Poll GET /api/health at 50ms intervals until 200 or timeout. */
export function waitForHealth(port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/health", timeout: 500 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve();
            return;
          }
          scheduleNext();
        },
      );
      req.on("error", scheduleNext);
      req.on("timeout", () => {
        req.destroy();
        scheduleNext();
      });
    };
    const scheduleNext = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`server did not become healthy within ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/**
 * Locate the packaged ithyno repo root.
 *
 * Search order:
 *   1. `<extensionPath>/host/`   — the staged monorepo layout produced by
 *      `scripts/prepack.mjs` and bundled into the VSIX.
 *   2. `<extensionPath>/`        — sibling layout (unused today, kept for
 *      manually-copied installs).
 *   3. `dirname(extensionPath)`  — F5 development host, where the extension
 *      folder is nested one level under the monorepo root.
 */
function resolvePackageRoot(extensionPath: string): string {
  const candidates = [
    path.join(extensionPath, "host"),
    extensionPath,
    path.dirname(extensionPath),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "bin", "ithyno.js"))) return c;
  }
  return extensionPath;
}

/** Match the `?token=<hex>` printed on the launch line. */
const TOKEN_RE = /token=([a-f0-9]+)/i;

/**
 * Build the environment for the spawned server process.
 *
 * On Windows, VS Code's extension host inherits the registry PATH but never
 * sources shell profiles, so directories like %APPDATA%\npm (npm global bin)
 * and %USERPROFILE%\.local\bin may be absent. Augment PATH with these
 * well-known user-level directories when they exist and are not already present.
 * Non-Windows platforms receive process.env unchanged.
 */
function buildServerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (process.platform !== "win32") return env;

  const candidates = [
    process.env["APPDATA"] ? `${process.env["APPDATA"]}\\npm` : null,
    process.env["USERPROFILE"] ? `${process.env["USERPROFILE"]}\\.local\\bin` : null,
  ].filter((d): d is string => d !== null);

  // Windows env var names are case-insensitive but the actual key casing varies
  // (e.g. "Path" vs "PATH"). Find the real key name to avoid creating a
  // duplicate entry that could shadow the original PATH.
  const pathKey = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const currentPath = env[pathKey] ?? "";
  const pathDirs = currentPath.split(";").map((s) => s.toLowerCase());
  const additions = candidates.filter(
    (d) => fs.existsSync(d) && !pathDirs.includes(d.toLowerCase()),
  );

  if (additions.length > 0) {
    env[pathKey] = [...additions, currentPath].filter(Boolean).join(";");
  }
  return env;
}

export async function spawnServer(opts: {
  extensionPath: string;
  workspaceRoot: string;
}): Promise<SpawnedServer> {
  const port = await pickFreePort();
  const pkgRoot = resolvePackageRoot(opts.extensionPath);
  const entry = path.join(pkgRoot, "bin", "ithyno.js");

  // Pass port + project root as CLI args, not env: bin/ithyno.js uses
  // commander whose --port default ("4321") overwrites env.PORT. Passing
  // --port explicitly is the only way to actually pin the picked port.
  const env: NodeJS.ProcessEnv = buildServerEnv();
  delete env.ITHYNO_DEV;

  const child = spawn(
    process.execPath,
    [entry, "--dir", opts.workspaceRoot, "--port", String(port), "--no-open"],
    { env, cwd: pkgRoot, stdio: ["ignore", "pipe", "pipe"] },
  );

  const log = vscode.window.createOutputChannel("ithyno");

  // Capture stdout to (a) surface it in the output channel and (b) sniff the
  // launch URL for the per-process session token.
  let token: string | null = null;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    const onData = (buf: Buffer) => {
      const chunk = buf.toString();
      log.append(chunk);
      if (!token) {
        const m = chunk.match(TOKEN_RE);
        if (m) {
          token = m[1];
          resolve(token);
        }
      }
    };
    child.stdout?.on("data", onData);
    child.on("exit", (code) => {
      log.appendLine(`[ithyno] server exited: ${code}`);
      if (!token) reject(new Error(`server exited before printing launch URL (code ${code})`));
    });
    setTimeout(() => {
      if (!token) reject(new Error("did not observe launch URL within 20000ms"));
    }, 20000);
  });
  child.stderr?.on("data", (b) => log.append(b.toString()));

  try {
    const [t] = await Promise.all([tokenPromise, waitForHealth(port)]);
    return {
      url: `http://127.0.0.1:${port}/?token=${t}`,
      port,
      child,
      dispose() {
        if (!child.killed) child.kill("SIGTERM");
        log.dispose();
      },
    };
  } catch (err) {
    if (!child.killed) child.kill("SIGTERM");
    const msg = err instanceof Error ? err.message : String(err);
    log.appendLine(`[ithyno] spawn failed: ${msg}`);
    log.show(true);
    throw err;
  }
}
