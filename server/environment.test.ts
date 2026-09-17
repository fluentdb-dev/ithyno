// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeDevelopmentEnvironment,
  encryptEnvironmentFile,
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

  it("uses real dotenvx .env.keys resolution and recognized profile-specific keys", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=base\n", "utf8");
    writeFileSync(join(dir, ".env.development"), "APP=development\nFEATURE=enabled\n", "utf8");
    const dotenvxCliPath = join(dirname(require.resolve("@dotenvx/dotenvx/package.json")), "src", "cli", "dotenvx.js");
    execFileSync(process.execPath, [
      dotenvxCliPath,
      "encrypt",
      "-f",
      join(dir, ".env"),
      "-f",
      join(dir, ".env.development"),
      "-fk",
      join(dir, ".env.keys"),
      "--no-native",
    ], { cwd: dir, stdio: "ignore" });
    await writeEnvironmentSelection(dir, { selectedProfile: "development", preferences: {} });

    const actual = await resolveDevelopmentEnvironmentValues(dir);
    expect(actual.APP).toBe("development");
    expect(actual.FEATURE).toBe("enabled");

    const snapshot = await composeDevelopmentEnvironment(dir);
    expect(snapshot.encryption.status).toBe("ready");
    expect(snapshot.encryption.sources).toContain("DOTENV_PRIVATE_KEY_DEVELOPMENT");
    expect(snapshot.variables.some((item) => item.key === "APP")).toBe(true);
  });

  it("creates a default .env.keys key file on first-time encryption without a preconfigured key", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=hello\n", "utf8");

    const result = await encryptEnvironmentFile(dir, "default");

    expect(result.status).toBe("ready");
    expect(existsSync(join(dir, ".env.keys"))).toBe(true);
    expect(readFileSync(join(dir, ".env.keys"), "utf8")).toContain("DOTENV_PRIVATE_KEY");
  });

  it("keeps ciphertext out of runtime values when a required key is missing", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "#/-------------------[DOTENV_PUBLIC_KEY]--------------------/\nDOTENV_PUBLIC_KEY=\"deadbeef\"\nAPP=encrypted:abc123\n", "utf8");

    const state = await composeDevelopmentEnvironment(dir);

    expect(state.variables.some((item) => item.key === "APP")).toBe(false);
    expect(state.diagnostics.some((item) => item.kind === "missing-required-key")).toBe(true);
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

    const snapshot = await composeDevelopmentEnvironment(dir);
    const currentContent = await readFile(join(dir, ".env"), "utf8");
    const currentRevision = createHash("sha1").update(currentContent).digest("hex");
    expect(snapshot.revision).toBe(currentRevision);

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

  it("rejects invalid mutation keys and preserves inline comments", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "A=1\nB=2 # keep me\n", "utf8");

    const currentContent = await readFile(join(dir, ".env"), "utf8");
    const currentRevision = createHash("sha1").update(currentContent).digest("hex");

    await expect(
      mutateEnvironmentFile(dir, { profile: "default", values: { "FOO BAR": "x" }, revision: currentRevision }),
    ).rejects.toThrow(/Invalid environment key name/);

    await expect(
      mutateEnvironmentFile(dir, { profile: "default", remove: ["BAD KEY"], revision: currentRevision }),
    ).rejects.toThrow(/Invalid environment key name/);

    const mutation = await mutateEnvironmentFile(dir, { profile: "default", values: { B: "updated" }, revision: currentRevision });
    expect(mutation.wrote).toBe(true);

    const nextContent = await readFile(join(dir, ".env"), "utf8");
    expect(nextContent).toContain('B="updated" # keep me');
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
