// SPDX-License-Identifier: GPL-3.0-or-later
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stopChildProcess } from "./process-lifecycle";

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly signals: Array<NodeJS.Signals | number | undefined> = [];

  kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(signal);
    return true;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("stopChildProcess", () => {
  it("does not signal an already exited child", async () => {
    const child = new FakeChild();
    child.exitCode = 0;

    await stopChildProcess(child);

    expect(child.signals).toEqual([]);
  });

  it("sends SIGTERM and waits for graceful exit", async () => {
    const child = new FakeChild();
    const stopped = stopChildProcess(child, 2_000);

    expect(child.signals).toEqual(["SIGTERM"]);
    child.exitCode = 0;
    child.emit("exit", 0, null);
    await stopped;

    expect(child.signals).toEqual(["SIGTERM"]);
  });

  it("falls back to SIGKILL after the grace period", async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const stopped = stopChildProcess(child, 2_000);

    await vi.advanceTimersByTimeAsync(2_000);
    await stopped;

    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
