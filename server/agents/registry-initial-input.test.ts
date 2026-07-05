// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "./registry.js";

/**
 * Tests for the `initialInput` field: parse acceptance, template
 * substitution in `resolve()`, and rejection when the field type is
 * wrong. We reach into the private cache via `load()`-independent APIs
 * where possible; where we must inspect the parsed shape, we use
 * `publicConfig()`.
 */

function stubRegistry() {
  return new AgentRegistry("/tmp/nowhere-that-does-not-exist");
}

describe("AgentRegistry initialInput", () => {
  it("resolve substitutes template variables in initialInput", () => {
    const reg = stubRegistry();
    const def = {
      name: "claude",
      command: "claude",
      args: [],
      initialInput: "/opsx:apply ${change_id} on ${branch}",
      role: "coder",
      specialties: [],
      concurrency: 1,
    };
    const r = reg.resolve(def, {
      change_id: "add-foo",
      worktree_path: "/w/add-foo",
      branch: "agent/add-foo",
    });
    expect(r.initialInput).toBe("/opsx:apply add-foo on agent/add-foo");
  });

  it("resolve leaves initialInput undefined when the def has none", () => {
    const reg = stubRegistry();
    const def = {
      name: "no-input",
      command: "echo",
      args: ["hi"],
      role: "coder",
      specialties: [],
      concurrency: 1,
    };
    const r = reg.resolve(def, {
      change_id: "c",
      worktree_path: "/w",
      branch: "b",
    });
    expect(r.initialInput).toBeUndefined();
  });

  it("resolve does not modify args or env when initialInput is used", () => {
    const reg = stubRegistry();
    const def = {
      name: "claude",
      command: "claude",
      args: ["--dangerously-skip-permissions"],
      env: { HELLO: "${change_id}" },
      initialInput: "/opsx:apply ${change_id}",
      role: "coder",
      specialties: [],
      concurrency: 1,
    };
    const r = reg.resolve(def, {
      change_id: "add-bar",
      worktree_path: "/w",
      branch: "b",
    });
    expect(r.args).toEqual(["--dangerously-skip-permissions"]);
    expect(r.env).toEqual({ HELLO: "add-bar" });
    expect(r.initialInput).toBe("/opsx:apply add-bar");
  });
});

// Note: parse-side validation (rejecting a non-string initialInput) is
// exercised as part of the full-file load path; we test that behavior in
// the runner-initial-input suite alongside the write mechanics, since
// AgentRegistry.load requires a real file on disk and is exercised there.
