// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

  it("reveal returns actual values and mutations preserve revision checks", async () => {
    dir = mkdtempSync(join(tmpdir(), "ithyno-env-"));
    mkdirSync(join(dir, ".ithyno"), { recursive: true });
    writeFileSync(join(dir, ".env"), "A=1\n", "utf8");
    await writeEnvironmentSelection(dir, { selectedProfile: "default", preferences: {} });

    const actual = await resolveDevelopmentEnvironmentValues(dir);
    expect(actual.A).toBe("1");

    const initial = await readEnvironmentSelection(dir);
    expect(initial.selectedProfile).toBe("default");

    const mutation = await mutateEnvironmentFile(dir, { profile: "default", values: { B: "2" }, revision: "" });
    expect(mutation.wrote).toBe(true);
    expect(mutation.path).toBe(".env");
  });
});
