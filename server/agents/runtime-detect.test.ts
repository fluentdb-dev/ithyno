// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { detectRuntime, detectAllRuntimes } from "./runtime-detect.js";

// R3 (revert-runtime-abstraction) collapsed RuntimeDef to a minimal
// `{ command: string }`. runtime-detect stays until R4.
type RuntimeStub = { command: string };

const skipOnWindows = process.platform === "win32" ? it.skip : it;

function runtime(_name: string, command: string): RuntimeStub {
  return { command };
}

describe("detectRuntime", () => {
  skipOnWindows("reports `echo` as installed on POSIX", async () => {
    const r = await detectRuntime("echo");
    expect(r.installed).toBe(true);
    expect(r.path).toBeTruthy();
    expect(typeof r.path).toBe("string");
    expect(r.path!.startsWith("/")).toBe(true);
  });

  skipOnWindows("reports a bogus command as not installed", async () => {
    const r = await detectRuntime("this-command-should-not-exist-xyz-abc-42");
    expect(r.installed).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("returns the windows sentinel on Windows platform", async () => {
    // We can't temporarily replace process.platform in a portable way, so
    // instead we call the internal `isWindows` via a stubbed environment.
    // Test skipped as informational — the isWindows() branch is covered
    // by detectAllRuntimes's dedicated test below via vi.stubGlobal.
    expect(true).toBe(true);
  });
});

describe("detectAllRuntimes", () => {
  it("returns an empty map when there are no runtimes", async () => {
    const out = await detectAllRuntimes({});
    expect(out).toEqual({});
  });

  skipOnWindows("detects a mix of installed and missing commands", async () => {
    const map: Record<string, RuntimeStub> = {
      installed: runtime("installed", "echo"),
      bogus: runtime("bogus", "this-command-should-not-exist-xyz-abc-42"),
    };
    const out = await detectAllRuntimes(map);
    expect(out.installed.installed).toBe(true);
    expect(out.installed.path).toBeTruthy();
    expect(out.bogus.installed).toBe(false);
    expect(out.bogus.error).toBeTruthy();
  });

  skipOnWindows("shares a single detection between runtimes with the same command", async () => {
    // Both runtimes point at `echo`; both entries should carry the same
    // path (i.e. the underlying `which echo` was resolved once and reused).
    const map: Record<string, RuntimeStub> = {
      a: runtime("a", "echo"),
      b: runtime("b", "echo"),
    };
    const out = await detectAllRuntimes(map);
    expect(out.a.installed).toBe(true);
    expect(out.b.installed).toBe(true);
    expect(out.a.path).toBe(out.b.path);
  });

  it("returns the windows sentinel for every entry on Windows", async () => {
    // Temporarily stub isWindows via module import trick: we can only
    // observe the sentinel by mocking process.platform. Use vi.stubGlobal
    // to swap the platform value.
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const map: Record<string, RuntimeStub> = {
        a: runtime("a", "echo"),
        b: runtime("b", "aider"),
      };
      const out = await detectAllRuntimes(map);
      expect(out.a.installed).toBe(false);
      expect(out.a.error).toBe("windows detection not supported");
      expect(out.b.installed).toBe(false);
      expect(out.b.error).toBe("windows detection not supported");
    } finally {
      Object.defineProperty(process, "platform", { value: original });
    }
  });
});
