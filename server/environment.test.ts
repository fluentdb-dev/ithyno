// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeDevelopmentEnvironment,
  mutateEnvironmentFile,
  readEnvironmentSelection,
  resolveDevelopmentEnvironmentValues,
  writeEnvironmentSelection,
} from "./environment/index.js";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("development environment resolver", () => {
  it("loads the selected profile and masks values", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "BASE=from-base\nSECRET=hidden\n", "utf8");
    writeFileSync(join(dir, ".env.local"), "BASE=from-local\n", "utf8");
    writeFileSync(join(dir, ".env.dev"), "API_URL=http://localhost\n", "utf8");
    await writeEnvironmentSelection(dir, { selectedProfile: "dev", preferences: {} });

    const state = await composeDevelopmentEnvironment(dir);
    expect(state.selection.selectedProfile).toBe("dev");
    expect(state.variables.find((item) => item.key === "BASE")?.maskedValue).toBe("********");
    expect(state.variables.find((item) => item.key === "API_URL")?.source).toBe(".env.dev");
  });

  it("does not expose dotenvx key values in encryption sources and still reports diagnostics without a selection", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    mkdirSync(join(dir, ".env"), { recursive: true });
    writeFileSync(join(dir, ".env.local"), "A=1\n", "utf8");
    const previousDotenvxKey = process.env.DOTENVX_KEY;
    process.env.DOTENVX_KEY = "super-secret";
    try {
      await writeEnvironmentSelection(dir, { selectedProfile: null, preferences: {} });
      const state = await composeDevelopmentEnvironment(dir);
      expect(state.encryption.sources).toEqual(["DOTENVX_KEY"]);
      expect(state.encryption.sources.join(" ")).not.toContain("super-secret");
      expect(state.diagnostics.some((diagnostic) => diagnostic.kind === "unsupported-syntax")).toBe(true);
    } finally {
      if (previousDotenvxKey === undefined) {
        delete process.env.DOTENVX_KEY;
      } else {
        process.env.DOTENVX_KEY = previousDotenvxKey;
      }
    }
  });

  it("reveals actual values and preserves revision checks", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    mkdirSync(join(dir, ".ithyno"), { recursive: true });
    writeFileSync(join(dir, ".env"), "A=1\n", "utf8");
    await writeEnvironmentSelection(dir, { selectedProfile: "default", preferences: {} });

    const actual = await resolveDevelopmentEnvironmentValues(dir);
    expect(actual.A).toBe("1");

    const initial = await readEnvironmentSelection(dir);
    expect(initial.selectedProfile).toBe("default");

    const currentContent = await readFile(join(dir, ".env"), "utf8");
    const currentRevision = createHash("sha1").update(currentContent).digest("hex");
    const mutation = await mutateEnvironmentFile(dir, { profile: "default", values: { B: "2" }, revision: currentRevision });
    expect(mutation.wrote).toBe(true);
    expect(mutation.path).toBe(".env");
  });

  it("rejects reserved keys and stale revisions", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "A=1\n", "utf8");
    await writeEnvironmentSelection(dir, { selectedProfile: "default", preferences: {} });

    await expect(
      mutateEnvironmentFile(dir, { profile: "default", values: { ITHYNO_SESSION_TOKEN: "secret" }, revision: "" }),
    ).rejects.toThrow(/Reserved environment keys/);

    await expect(
      mutateEnvironmentFile(dir, { profile: "default", values: { B: "2" }, revision: "stale" }),
    ).rejects.toThrow(/stale revision/);
  });

  it("reports escaping symlinks and tracked secrets", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    const outside = mkdtempSync(join(tmpdir(), "ithyno-outside-"));
    writeFileSync(join(dir, ".env"), "A=1\n", "utf8");
    writeFileSync(join(outside, ".env.remote"), "SECRET=remote\n", "utf8");
    symlinkSync(join(outside, ".env.remote"), join(dir, ".env.dev"));
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    writeFileSync(join(dir, ".env.local"), "B=2\n", "utf8");
    execFileSync("git", ["add", ".env.local"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    await writeEnvironmentSelection(dir, { selectedProfile: "dev", preferences: {} });

    const state = await composeDevelopmentEnvironment(dir);
    expect(state.diagnostics.some((diag) => diag.kind === "path-traversal")).toBe(true);
    expect(state.diagnostics.some((diag) => diag.kind === "git-tracked-secret")).toBe(true);
  });
});
