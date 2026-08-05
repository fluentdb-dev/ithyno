// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { AgentRegistry, builtInPromptForAgent } from "./registry.js";

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
  // For live-shell agents, initialInput carries the resolved prompt (typed
  // into PTY). For single-prompt agents, initialInput stays undefined and
  // the receiving CLI's native non-interactive args carry the prompt.

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
    // Worker live-shell = stdin delivery (no PTY). Manager PTY handling
    // lives in attachPtyToSocket and never reaches resolve(). Even if a
    // caller wires a Manager through resolve() by hand, the return
    // value now says "stdin" — the semantic is "prompt delivered via
    // stdin write" rather than "runner opens a PTY".
    expect(r.initialInputMode).toBe("stdin");
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

  it.each([
    ["code", "openspec-apply add-native"],
    ["review", "ithy-opsx-review add-native"],
    ["verify", "ithy-opsx-verify add-native"],
  ])("delivers Codex %s through codex exec", (role, prompt) => {
    const reg = stubRegistry();
    const def = {
      name: "codex-worker",
      command: "codex",
      args: ["--sandbox", "workspace-write"],
      mode: "single-prompt" as const,
      roles: ["code", "review", "verify"],
      role: "code",
    };
    const r = reg.resolve(
      def,
      { change_id: "add-native", worktree_path: "/w", branch: "b" },
      role,
    );
    expect(r.args).toEqual(["--sandbox", "workspace-write", "exec", prompt]);
  });

  it("delivers a Claude built-in through -p and preserves its slash command", () => {
    const reg = stubRegistry();
    const def = {
      name: "claude-worker",
      command: "claude",
      args: ["--dangerously-skip-permissions"],
      mode: "single-prompt" as const,
      roles: ["review"],
      role: "review",
    };
    const r = reg.resolve(
      def,
      { change_id: "add-native", worktree_path: "/w", branch: "b" },
      "review",
    );
    expect(r.args).toEqual([
      "--dangerously-skip-permissions",
      "-p",
      "/ithy-opsx:review add-native",
    ]);
  });

  it("does not duplicate a hand-authored Codex prompt", () => {
    const reg = stubRegistry();
    const def = {
      name: "codex-worker",
      command: "codex",
      args: ["exec", "openspec-apply ${change_id}"],
      mode: "single-prompt" as const,
      roles: ["code"],
      role: "code",
    };
    const r = reg.resolve(
      def,
      { change_id: "add-native", worktree_path: "/w", branch: "b" },
      "code",
    );
    expect(r.args).toEqual(["exec", "openspec-apply add-native"]);
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

describe("builtInPromptForAgent — receiving CLI mapping", () => {
  it.each([
    ["code", "openspec-apply ${change_id}"],
    ["review", "ithy-opsx-review ${change_id}"],
    ["verify", "ithy-opsx-verify ${change_id}"],
    ["manager", "ithy-opsx-dispatch"],
  ])("maps Codex %s", (role, expected) => {
    expect(builtInPromptForAgent("codex", role)).toBe(expected);
  });

  it("preserves Claude and unknown CLI built-ins", () => {
    expect(builtInPromptForAgent("claude", "review")).toBe("/ithy-opsx:review ${change_id}");
    expect(builtInPromptForAgent("gemini", "code")).toBe("/opsx:apply ${change_id}");
  });

  it("resolves the requested role rather than the Agent's first role", () => {
    const reg = stubRegistry();
    const def = {
      name: "codex-all",
      command: "codex",
      args: [],
      mode: "live-shell" as const,
      roles: ["code", "review", "verify"],
      role: "code",
    };
    const resolved = reg.resolve(
      def,
      { change_id: "add-role-map", worktree_path: "/w", branch: "b" },
      "verify",
    );
    expect(resolved.initialInput).toBe("ithy-opsx-verify add-role-map");
  });

  it("does not rewrite explicit Codex prompt overrides", () => {
    const reg = stubRegistry();
    const def = {
      name: "codex-custom",
      command: "codex",
      args: [],
      mode: "live-shell" as const,
      roles: ["review"],
      role: "review",
      prompts: { review: "custom reviewer ${change_id}" },
    };
    const resolved = reg.resolve(
      def,
      { change_id: "add-custom", worktree_path: "/w", branch: "b" },
      "review",
    );
    expect(resolved.initialInput).toBe("custom reviewer add-custom");
  });
});
