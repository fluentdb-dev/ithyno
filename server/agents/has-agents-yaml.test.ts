// SPDX-License-Identifier: GPL-3.0-or-later
// Tests for the `hasAgentsYaml` helper added by
// guard-terminal-autolaunch-on-agents-yaml.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasAgentsYaml } from "./registry.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-has-agents-yaml-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("hasAgentsYaml", () => {
  it("returns true when agents.yaml exists as a regular file", () => {
    writeFileSync(join(dir, "agents.yaml"), "agents: []\n");
    expect(hasAgentsYaml(dir)).toBe(true);
  });

  it("returns false when agents.yaml is absent", () => {
    expect(hasAgentsYaml(dir)).toBe(false);
  });

  it("returns false when agents.yaml is a directory", () => {
    mkdirSync(join(dir, "agents.yaml"));
    expect(hasAgentsYaml(dir)).toBe(false);
  });

  it("returns false when projectRoot does not exist", () => {
    expect(hasAgentsYaml(join(dir, "nonexistent"))).toBe(false);
  });

  it("returns true when agents.yaml is a symlink pointing to a file", () => {
    const target = join(dir, "agents-real.yaml");
    writeFileSync(target, "agents: []\n");
    symlinkSync(target, join(dir, "agents.yaml"));
    expect(hasAgentsYaml(dir)).toBe(true);
  });

  it("returns false when agents.yaml is a symlink pointing to a directory", () => {
    const targetDir = join(dir, "agents-dir");
    mkdirSync(targetDir);
    symlinkSync(targetDir, join(dir, "agents.yaml"));
    expect(hasAgentsYaml(dir)).toBe(false);
  });
});
