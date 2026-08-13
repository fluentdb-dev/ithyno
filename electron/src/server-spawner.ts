// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import * as http from 'node:http';
import type { Readable } from 'node:stream';

export type ServerChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export interface SpawnResult {
  url: string;
  token: string;
  port: number;
  child: ServerChildProcess;
}

export interface SpawnOptions {
  binPath: string;
  projectRoot: string;
  nodePath?: string;
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void;
  port?: number;
  sessionToken?: string;
}

const TOKEN_RE = /token=([a-f0-9]+)/;

export async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error('failed to obtain free port'));
      }
    });
  });
}

export async function pollHealth(port: number, timeoutMs = 5000, intervalMs = 50): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const ok = await fetchHealth(port);
      if (ok) return;
    } catch (err) {
      lastError = err;
    }
    await delay(intervalMs);
  }
  throw new Error(`server /api/health did not respond within ${timeoutMs}ms${lastError ? `: ${String(lastError)}` : ''}`);
}

function fetchHealth(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/api/health', timeout: 500 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('health request timeout'));
    });
  });
}

export function buildServerSpawnEnv(opts: Pick<SpawnOptions, 'projectRoot' | 'sessionToken'>, port: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // The Electron shell always runs the server in production-static mode, even
  // if the developer's shell has ITHYNO_DEV set for the CLI workflow.
  delete env.ITHYNO_DEV;
  delete env.ITHYNO_LAUNCHER_SESSION_TOKEN;
  env.ELECTRON_RUN_AS_NODE = '1';
  env.ITHYNO_PROJECT_ROOT = opts.projectRoot;
  env.PORT = String(port);
  env.ITHYNO_OPEN = '0';
  if (opts.sessionToken !== undefined) {
    env.ITHYNO_LAUNCHER_SESSION_TOKEN = opts.sessionToken;
  }
  return env;
}

export async function spawnServer(opts: SpawnOptions): Promise<SpawnResult> {
  const t0 = Date.now();
  const port = opts.port ?? (await pickFreePort());
  console.log(`[startup] pickFreePort: ${Date.now() - t0}ms → port ${port}`);

  const nodeBin = opts.nodePath ?? process.execPath;
  const env = buildServerSpawnEnv(opts, port);

  const tSpawn = Date.now();
  const child = spawn(
    nodeBin,
    [opts.binPath, '--dir', opts.projectRoot, '--port', String(port), '--no-open'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  ) as ServerChildProcess;
  console.log(`[startup] child spawn() call: ${Date.now() - tSpawn}ms`);

  const tToken = Date.now();
  const token = await new Promise<string>((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const onExit = (code: number | null) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `server exited before printing launch URL (code=${code ?? 'null'}). stderr tail:\n${stderrBuf.slice(-2000)}`,
        ),
      );
    };

    child.on('exit', onExit);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      opts.onLog?.(chunk, 'stdout');
      const m = TOKEN_RE.exec(stdoutBuf);
      if (m && !settled) {
        settled = true;
        child.off('exit', onExit);
        resolve(m[1]);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrBuf += chunk;
      opts.onLog?.(chunk, 'stderr');
    });

    setTimeout(() => {
      if (settled) return;
      settled = true;
      child.off('exit', onExit);
      reject(
        new Error(
          `timed out waiting for launch URL from server. stderr tail:\n${stderrBuf.slice(-2000)}`,
        ),
      );
    }, 15_000);
  });
  console.log(`[startup] server token received: ${Date.now() - tToken}ms`);

  const tHealth = Date.now();
  await pollHealth(port);
  console.log(`[startup] pollHealth: ${Date.now() - tHealth}ms`);

  const url = `http://localhost:${port}/?token=${token}`;
  console.log(`[startup] spawnServer total: ${Date.now() - t0}ms`);
  return { url, token, port, child };
}
