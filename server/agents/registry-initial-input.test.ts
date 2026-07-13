// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "./registry.js";

/**
 * Tests for prompt resolution and template substitution in `resolve()`.
 *
 * Post reshape-agents-yaml-mode-roles: prompts are per-role via the
 * `prompts` map (agent → runtime → built-in default). `initialInput` on
 * AgentPublic / AgentDef is retained as a read-alias populated from
 * `prompts[roles[0]]` after normalization, but `resolve()` itself reads
 * from the `prompts` map plus built-in defaults.
 */

function stubRegistry() {
  return new AgentRegistry("/tmp/nowhere-that-does-not-exist");
}

describe("AgentRegistry resolve — per-role prompts", () => {
  // NOTE: post reshape, command-only agents "own" their args — resolve()
  // does NOT auto-append `-p <prompt>` for them. The prompt for a
  // command-only single-prompt agent lives in args (user hand-authored).
  // Only agents that reference a runtime get automatic prompt-injection.
  //
  // For live-shell agents, initialInput carries the resolved prompt (typed
  // into PTY). For single-prompt command-only agents, initialInput stays
  // undefined — args are the source of truth.

  it("live-shell agent gets resolved prompt in initialInput (PTY delivery)", () => {
    const reg = stubRegistry();
    const def = {
      name: "claude-mgr",
      command: "claude",
      args: ["--continue"],
      mode: "live-shell" as const,
      roles: ["manager"],
      role: "manager",
      prompts: { manager: "/opsx:manage ${change_id}" },
      specialties: [],
      concurrency: 1,
      dedicated: true,
    };
    const r = reg.resolve(
      def,
      { change_id: "add-foo", worktree_path: "/w", branch: "b" },
      "manager",
    );
    expect(r.initialInput).toBe("/opsx:manage add-foo");
    expect(r.initialInputMode).toBe("pty");
    expect(r.args).toEqual(["--continue"]);
  });

  it("command-only single-prompt agent leaves args untouched (user owns them)", () => {
    const reg = stubRegistry();
    const def = {
      name: "claude",
      command: "claude",
      args: ["--dangerously-skip-permissions", "-p", "/opsx:apply ${change_id}"],
      mode: "single-prompt" as const,
      roles: ["code"],
      role: "code",
      specialties: [],
      concurrency: 1,
      dedicated: true,
    };
    const r = reg.resolve(
      def,
      { change_id: "add-bar", worktree_path: "/w", branch: "b" },
      "code",
    );
    expect(r.args).toEqual([
      "--dangerously-skip-permissions",
      "-p",
      "/opsx:apply add-bar",
    ]);
    expect(r.initialInput).toBeUndefined();
    expect(r.initialInputMode).toBe("cli-arg");
  });

  it("substitutes template variables in env independently", () => {
    const reg = stubRegistry();
    const def = {
      name: "claude",
      command: "claude",
      args: [],
      env: { HELLO: "${change_id}" },
      mode: "single-prompt" as const,
      roles: ["code"],
      role: "code",
      specialties: [],
      concurrency: 1,
      dedicated: true,
    };
    const r = reg.resolve(
      def,
      { change_id: "add-x", worktree_path: "/w", branch: "b" },
      "code",
    );
    expect(r.env).toEqual({ HELLO: "add-x" });
  });
});

