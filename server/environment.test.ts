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

const getDotenvxCliPath = (): string => join(dirname(require.resolve("@dotenvx/dotenvx/package.json")), "src", "cli", "dotenvx.js");

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
    execFileSync(process.execPath, [
      getDotenvxCliPath(),
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

  it("handles repeated encryption and existing/new profile-specific keys without leaking secrets", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=base\n", "utf8");
    writeFileSync(join(dir, ".env.development"), "APP=development\nFEATURE=enabled\n", "utf8");

    const first = await encryptEnvironmentFile(dir, "default");
    const second = await encryptEnvironmentFile(dir, "development");
    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");

    const keyFile = readFileSync(join(dir, ".env.keys"), "utf8");
    expect(keyFile).toContain("DOTENV_PRIVATE_KEY=");
    expect(keyFile).toContain("DOTENV_PRIVATE_KEY_DEVELOPMENT=");

    const value = await composeDevelopmentEnvironment(dir, {
      DOTENV_PRIVATE_KEY: /DOTENV_PRIVATE_KEY=(.*)/.exec(keyFile)?.[1]?.trim() ?? "",
      DOTENV_PRIVATE_KEY_DEVELOPMENT: /DOTENV_PRIVATE_KEY_DEVELOPMENT=(.*)/.exec(keyFile)?.[1]?.trim() ?? "",
    });
    expect(value.variables.some((item) => item.key === "APP")).toBe(true);
    expect(value.variables.some((item) => item.key === "DOTENV_PRIVATE_KEY")).toBe(false);
    expect(value.variables.some((item) => item.key === "DOTENV_PRIVATE_KEY_DEVELOPMENT")).toBe(false);
  });

  it("uses inherited standard and suffixed private keys without exposing them as runtime values", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=base\n", "utf8");
    writeFileSync(join(dir, ".env.development"), "APP=development\nFEATURE=enabled\n", "utf8");
    execFileSync(process.execPath, [
      getDotenvxCliPath(),
      "encrypt",
      "-f",
      join(dir, ".env"),
      "-f",
      join(dir, ".env.development"),
      "-fk",
      join(dir, ".env.keys"),
      "--no-native",
    ], { cwd: dir, stdio: "ignore" });

    const keyFile = readFileSync(join(dir, ".env.keys"), "utf8");
    const standardKey = /DOTENV_PRIVATE_KEY=(.*)/.exec(keyFile)?.[1]?.trim();
    const developmentKey = /DOTENV_PRIVATE_KEY_DEVELOPMENT=(.*)/.exec(keyFile)?.[1]?.trim();

    const inheritedEnv = {
      DOTENV_PRIVATE_KEY: standardKey,
      DOTENV_PRIVATE_KEY_DEVELOPMENT: developmentKey,
    } as NodeJS.ProcessEnv;
    await writeEnvironmentSelection(dir, { selectedProfile: "development", preferences: {} });

    const state = await composeDevelopmentEnvironment(dir, inheritedEnv);
    expect(state.variables.some((item) => item.key === "APP")).toBe(true);
    expect(state.variables.some((item) => item.key === "DOTENV_PRIVATE_KEY")).toBe(false);
    expect(state.variables.some((item) => item.key === "DOTENV_PRIVATE_KEY_DEVELOPMENT")).toBe(false);
    expect(state.variables.find((item) => item.key === "APP")?.source).toBe(".env.development");
  });

  it("creates a default .env.keys key file on first-time encryption without a preconfigured key", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=hello\n", "utf8");

    const result = await encryptEnvironmentFile(dir, "default");

    expect(result.status).toBe("ready");
    expect(existsSync(join(dir, ".env.keys"))).toBe(true);
    expect(readFileSync(join(dir, ".env.keys"), "utf8")).toContain("DOTENV_PRIVATE_KEY");
  });

  it("restores .env, .env.keys, and .gitignore when encryption fails", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    mkdirSync(join(dir, ".env"), { recursive: true });
    writeFileSync(join(dir, ".gitignore"), "# existing\n", "utf8");

    const result = await encryptEnvironmentFile(dir, "default");

    expect(result.status).toBe("failed");
    expect(existsSync(join(dir, ".env"))).toBe(true);
    expect(existsSync(join(dir, ".env.keys"))).toBe(false);
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("# existing\n");
  });

  it("distinguishes missing and wrong keys without ever exposing a secret value", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=base\n", "utf8");

    execFileSync(process.execPath, [
      getDotenvxCliPath(),
      "encrypt",
      "-f",
      join(dir, ".env"),
      "-fk",
      join(dir, ".env.keys"),
      "--no-native",
    ], { cwd: dir, stdio: "ignore" });
    rmSync(join(dir, ".env.keys"), { force: true });

    const missing = await composeDevelopmentEnvironment(dir, {});
    expect(missing.diagnostics.some((diag) => diag.kind === "missing-required-key")).toBe(true);
    expect(missing.diagnostics.some((diag) => diag.message.includes("DOTENV_PRIVATE_KEY"))).toBe(true);
    expect(missing.diagnostics.some((diag) => diag.message.includes("APP=base"))).toBe(false);

    const wrongKeyDir = mkdtempSync(join(tmpdir(), "ithyno-env-wrong-"));
    writeFileSync(join(wrongKeyDir, ".env"), "APP=other\n", "utf8");
    execFileSync(process.execPath, [
      getDotenvxCliPath(),
      "encrypt",
      "-f",
      join(wrongKeyDir, ".env"),
      "-fk",
      join(wrongKeyDir, ".env.keys"),
      "--no-native",
    ], { cwd: wrongKeyDir, stdio: "ignore" });
    const wrongKey = readFileSync(join(wrongKeyDir, ".env.keys"), "utf8").match(/DOTENV_PRIVATE_KEY=(.*)/)?.[1]?.trim();
    writeFileSync(join(dir, ".env.keys"), `DOTENV_PRIVATE_KEY=${wrongKey ?? "wrong"}\n`, "utf8");

    const wrong = await composeDevelopmentEnvironment(dir, { DOTENV_PRIVATE_KEY: wrongKey ?? "wrong" });
    expect(wrong.variables.some((item) => item.key === "APP")).toBe(false);
    expect(wrong.diagnostics.some((item) => item.kind === "decryption-failed")).toBe(true);
    expect(wrong.diagnostics.some((item) => item.message.includes("could not decrypt"))).toBe(true);
    expect(wrong.diagnostics.some((item) => item.message.includes(wrongKey ?? "wrong"))).toBe(false);
  });

  it("rejects tracked or symlinked .env.keys before any mutation", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=one\n", "utf8");
    await encryptEnvironmentFile(dir, "default");

    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    execFileSync("git", ["add", "-f", ".env.keys"], { cwd: dir });
    await expect(encryptEnvironmentFile(dir, "default")).rejects.toThrow(/tracked/);

    const symlinkDir = mkdtempSync(join(tmpdir(), "ithyno-env-link-"));
    writeFileSync(join(symlinkDir, ".env"), "APP=two\n", "utf8");
    const target = join(symlinkDir, "secret.keys");
    writeFileSync(target, "DOTENV_PRIVATE_KEY=abc\n", "utf8");
    symlinkSync(target, join(symlinkDir, ".env.keys"));
    await expect(encryptEnvironmentFile(symlinkDir, "default")).rejects.toThrow(/symlink/);
  });

  it("reports unreadable key-file state for a blocked .env.keys", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env"), "APP=three\n", "utf8");
    writeFileSync(join(dir, ".env.keys"), "DOTENV_PRIVATE_KEY=deadbeef\n", "utf8");
    const mode = 0o000;
    const keyPath = join(dir, ".env.keys");
    await import("node:fs/promises").then(({ chmod: chmodAsync }) => chmodAsync(keyPath, mode));

    const state = await composeDevelopmentEnvironment(dir, { DOTENV_PRIVATE_KEY: "deadbeef" });
    expect(state.diagnostics.some((diag) => diag.kind === "unreadable-file" || diag.kind === "missing-required-key")).toBe(true);
  });

  it("keeps orphaned .env.keys entries out of runtime values and marks the source as key-file-based", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    writeFileSync(join(dir, ".env.keys"), "DOTENV_PRIVATE_KEY=deadbeef\n", "utf8");
    const state = await composeDevelopmentEnvironment(dir, { DOTENV_PRIVATE_KEY: "deadbeef" });
    expect(state.encryption.sources).toContain("DOTENV_PRIVATE_KEY");
    expect(state.variables.some((item) => item.key === "DOTENV_PRIVATE_KEY")).toBe(false);
    expect(state.variables.some((item) => item.key === "APP")).toBe(false);
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
