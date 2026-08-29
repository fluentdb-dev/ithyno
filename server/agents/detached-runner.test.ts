import { describe, expect, it, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDetached, startLogTail } from "./detached-runner.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("detached runner", () => {
  it("writes metadata and leaves the child alive after the parent releases its handle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ithyno-detached-runner-"));
    dirs.push(dir);
    const { meta, child } = await startDetached({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 5000)"],
      cwd: dir,
      env: process.env,
      jobId: "job-test",
      changeId: "add-test",
      agentName: "node",
    });

    expect(child.pid).toBe(meta.pid);
    expect(existsSync(join(dir, ".agent-meta.json"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, ".agent-meta.json"), "utf8"));
    expect(onDisk).toMatchObject({
      jobId: "job-test",
      changeId: "add-test",
      agentName: "node",
      pid: meta.pid,
      logPath: join(dir, ".agent.log"),
    });

    // This is the equivalent of server shutdown: the detached child is not
    // killed when the parent drops its process handle.
    process.kill(meta.pid, 0);
    process.kill(meta.pid, "SIGTERM");
    await unlink(join(dir, ".agent-meta.json")).catch(() => undefined);
  });
});

describe("startLogTail", () => {
  it("delivers appended chunks in order", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ithyno-log-tail-"));
    dirs.push(dir);
    const logPath = join(dir, ".agent.log");
    writeFileSync(logPath, "first\n");
    const chunks: string[] = [];
    const tail = startLogTail(logPath, (chunk) => chunks.push(chunk));
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      writeFileSync(logPath, "second\n", { flag: "a" });
      await vi.waitFor(() => expect(chunks.join("")).toContain("second\n"), { timeout: 2000 });
      expect(chunks.join("")).toBe("first\nsecond\n");
    } finally {
      tail.dispose();
    }
  });
});
