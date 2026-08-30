// SPDX-License-Identifier: GPL-3.0-or-later
import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";

export type DetachedMeta = {
  jobId: string;
  changeId: string;
  agentName: string;
  command: string;
  pid: number;
  startedAt: number;
  logPath: string;
  metaPath: string;
};

/** Conservative PID-reuse guard used when adopting a detached process. */
export function detachedCommandMatches(meta: Pick<DetachedMeta, "command">, commandLine: string): boolean {
  const executable = meta.command.split(/[\\/]/).pop() ?? meta.command;
  return commandLine.includes(meta.command) || commandLine.includes(executable);
}

export async function startDetached(opts: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  jobId: string;
  changeId: string;
  agentName: string;
}): Promise<{ child: ChildProcess; meta: DetachedMeta }> {
  const logPath = join(opts.cwd, ".agent.log");
  const metaPath = join(opts.cwd, ".agent-meta.json");
  const logFd = openSync(logPath, "w");
  let child: ChildProcess;
  try {
    child = spawn(opts.command, opts.args, {
      detached: true,
      cwd: opts.cwd,
      env: opts.env,
      stdio: ["ignore", logFd, logFd],
    });
  } finally {
    closeSync(logFd);
  }
  child.unref();
  const meta: DetachedMeta = {
    jobId: opts.jobId,
    changeId: opts.changeId,
    agentName: opts.agentName,
    command: opts.command,
    pid: child.pid!,
    startedAt: Date.now(),
    logPath,
    metaPath,
  };
  const { metaPath: _metaPath, ...fileMeta } = meta;
  await writeFile(metaPath, JSON.stringify(fileMeta, null, 2) + "\n", "utf8");
  return { child, meta };
}

export function startLogTail(logPath: string, onData: (data: string) => void): { dispose(): void } {
  let offset = 0;
  let disposed = false;
  let reading = false;
  const readDelta = () => {
    if (disposed || reading || !existsSync(logPath)) return;
    reading = true;
    try {
      const fd = openSync(logPath, "r");
      try {
        const size = fstatSync(fd).size;
        if (size < offset) offset = 0;
        const buf = Buffer.alloc(Math.max(0, size - offset));
        if (buf.length) {
          readSync(fd, buf, 0, buf.length, offset);
          offset += buf.length;
          onData(buf.toString("utf8"));
        }
      } finally {
        closeSync(fd);
      }
    } catch {
      // The child may still be creating or rotating the file.
    } finally {
      reading = false;
    }
  };
  const watcher: FSWatcher = chokidar.watch(logPath, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
  });
  watcher.on("add", readDelta);
  watcher.on("change", readDelta);
  return { dispose: () => { disposed = true; void watcher.close(); } };
}

export async function readDetachedMeta(path: string): Promise<DetachedMeta | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<DetachedMeta>;
    if (typeof value.jobId !== "string" || typeof value.changeId !== "string" ||
        typeof value.agentName !== "string" || !Number.isInteger(value.pid) ||
        typeof value.startedAt !== "number" || typeof value.logPath !== "string" ||
        typeof value.command !== "string") return null;
    return { ...value, metaPath: path } as DetachedMeta;
  } catch {
    return null;
  }
}

export function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function removeMeta(path: string): Promise<void> {
  await unlink(path).catch(() => undefined);
}
