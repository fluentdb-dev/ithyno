// SPDX-License-Identifier: GPL-3.0-or-later
// Ithyno server lifecycle for skill-e2e.
//
// Spawns bin/ithyno.js as a subprocess (D4) with the scaffolded target as
// its cwd, on a random free port (D3 — one port per flow). Tails stderr into
// the harness log for post-mortem visibility. Kills gracefully at teardown,
// falling back to SIGKILL if SIGTERM doesn't take.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { info, warn, error } from "./log.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const ITHYNO_ENTRY = resolve(REPO_ROOT, "bin", "ithyno.js");

/** Pick a random free port by binding to 0 and reading the assigned port. */
export async function pickFreePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on("error", rej);
    s.listen(0, () => {
      const port = s.address().port;
      s.close(() => res(port));
    });
  });
}

/**
 * Start `bin/ithyno.js --port <port>` with cwd = targetDir. Waits up to
 * `bootTimeoutMs` for the server to announce it's listening (parsed from
 * stderr / stdout). Returns the child process + a helper to fetch the
 * captured log.
 *
 * @param {object} opts
 * @param {string} opts.targetDir
 * @param {number} opts.port
 * @param {number} [opts.bootTimeoutMs=15000]
 */
export async function startServer({ targetDir, port, bootTimeoutMs = 15000 }) {
  info(`server: spawning bin/ithyno.js --port ${port} (cwd=${targetDir})`);

  const child = spawn(
    process.execPath,
    [ITHYNO_ENTRY, "--port", String(port), "--no-open"],
    {
      cwd: targetDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        // Don't inherit an accidental --dir from the parent.
        ITHYNO_PROJECT_ROOT: targetDir,
        ITHYNO_OPEN: "0",
      },
    },
  );

  let logBuffer = "";
  let listening = false;

  const onData = (chunk) => {
    const text = chunk.toString();
    logBuffer += text;
    // Match the fastify boot line — historically "Server listening at
    // http://localhost:<port>" or "listening on http://localhost:<port>".
    // Accept both patterns loosely.
    if (
      /listen(ing)?\s+(at|on)\s+https?:\/\//i.test(text) ||
      new RegExp(`:${port}`).test(text)
    ) {
      listening = true;
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  const exitPromise = new Promise((res) => child.once("exit", res));

  // Poll a health endpoint too — some server variants don't log a boot line.
  const start = Date.now();
  while (Date.now() - start < bootTimeoutMs) {
    if (listening) break;
    if (await probeHealth(port)) {
      listening = true;
      break;
    }
    // Interleave with exit detection so a crashed child fails fast.
    const raced = await Promise.race([
      sleep(200),
      exitPromise.then(() => "exited"),
    ]);
    if (raced === "exited") {
      error(`server exited before listening. Log:\n${logBuffer}`);
      throw new Error("ithyno server exited during boot");
    }
  }

  if (!listening) {
    child.kill("SIGTERM");
    error(
      `server did not listen within ${bootTimeoutMs}ms. Captured log:\n${logBuffer}`,
    );
    throw new Error(`ithyno server boot timed out on port ${port}`);
  }

  info(`server: listening on http://localhost:${port}`);

  return {
    child,
    port,
    getLog: () => logBuffer,
    async stop() {
      await stopServer(child, port);
    },
  };
}

/**
 * Poll GET /api/config (or fall back to GET /) to confirm the server is up.
 * A successful HTTP response with `content-type: application/json` OR a
 * server-generated HTML response indicates ithyno is answering; a raw
 * ECONNREFUSED (or a TCP-level failure) indicates the port is free. This
 * matters for the post-stop unbind check: after SIGKILL, `fetch` should
 * ECONNREFUSED reliably — but a stale ephemeral socket in TIME_WAIT can
 * briefly respond with junk, which the looser check would miscount as
 * "still listening".
 */
async function probeHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/config`, {
      signal: AbortSignal.timeout(500),
    });
    // ithyno's /api/config returns JSON. Reject responses that don't look
    // like our server.
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.includes("application/json")) return true;
    if (res.status === 404) return true; // ithyno's fastify still responded
    return false;
  } catch {
    return false;
  }
}

/** Bind check: try to bind to the port. If it succeeds, nothing is listening. */
async function isPortFree(port) {
  const { createServer } = await import("node:net");
  return new Promise((res) => {
    const s = createServer();
    s.once("error", () => res(false));
    s.once("listening", () => {
      s.close(() => res(true));
    });
    s.listen(port);
  });
}

/** SIGTERM → wait ≤5s → SIGKILL. Verify the port is unbound before returning. */
export async function stopServer(child, port) {
  if (!child || child.exitCode !== null) return;
  info(`server: SIGTERM pid=${child.pid}`);
  child.kill("SIGTERM");

  const graceful = await Promise.race([
    new Promise((res) => child.once("exit", () => res("exited"))),
    sleep(5000).then(() => "timeout"),
  ]);
  if (graceful === "timeout") {
    warn(`server did not exit within 5s, sending SIGKILL to pid=${child.pid}`);
    child.kill("SIGKILL");
    await new Promise((res) => child.once("exit", res));
  }

  // Wait for the port to unbind — SIGKILL doesn't always release immediately.
  // Use bind-based probe (isPortFree) not health-based: after SIGTERM, the
  // socket may be in TIME_WAIT and briefly answer with junk, which a
  // health-based probe would misread as "still listening".
  const start = Date.now();
  while (Date.now() - start < 3000) {
    if (await isPortFree(port)) return;
    await sleep(200);
  }
  warn(`port ${port} still bound after server stop — TIME_WAIT ok, leak unlikely`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
