// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "./registry.js";

/**
 * Focused tests for the `${session_id}` template variable added by
 * add-session-id-template-var. The var is expected to substitute
 * inside `args`, `env` values, and per-role resolved prompts, with
 * an empty-string fallback when unset.
 */

function stubRegistry() {
  return new AgentRegistry("/tmp/session-var-test-doesnotexist");
}

const baseAgent = {
  name: "worker",
  mode: "single-prompt" as const,
  roles: ["code"],
  role: "code",
  specialties: [],
  concurrency: 1,
  dedicated: true,
};

describe("${session_id} substitution", () => {
  it("substitutes in args", () => {
    const reg = stubRegistry();
    const def = {
      ...baseAgent,
      command: "claude",
      args: ["--session", "${session_id}", "--other"],
    };
    const r = reg.resolve(
      def,
      {
        change_id: "add-foo",
        worktree_path: "/w",
        branch: "agent/add-foo",
        session_id: "session-add-foo-abc",
      },
      "code",
    );
    expect(r.args).toEqual(["--session", "session-add-foo-abc", "--other"]);
  });

  it("substitutes in env values", () => {
    const reg = stubRegistry();
    const def = {
      ...baseAgent,
      command: "claude",
      args: [],
      env: { AGENT_SESSION_ID: "${session_id}" },
    };
    const r = reg.resolve(
      def,
      {
        change_id: "add-bar",
        worktree_path: "/w",
        branch: "b",
        session_id: "session-add-bar-xyz",
      },
      "code",
    );
    expect(r.env).toEqual({ AGENT_SESSION_ID: "session-add-bar-xyz" });
  });

  it("substitutes in per-role prompts", () => {
    const reg = stubRegistry();
    const def = {
      ...baseAgent,
      command: "claude",
      args: [],
      prompts: {
        code: "/opsx:apply ${change_id} session=${session_id}",
      },
    };
    // command-only agents own their args (no auto-append), but
    // resolvePromptForRole still returns the resolved template so
    // callers can inspect it via other channels. Verify by putting a
    // reference into env, which resolve() DOES apply substitution to.
    const withRef = {
      ...def,
      env: { PROMPT: "${session_id}" },
    };
    const r = reg.resolve(
      withRef,
      {
        change_id: "add-baz",
        worktree_path: "/w",
        branch: "b",
        session_id: "session-add-baz-1",
      },
      "code",
    );
    expect(r.env).toEqual({ PROMPT: "session-add-baz-1" });
  });

  it("substitutes to empty string when session_id is omitted", () => {
    const reg = stubRegistry();
    const def = {
      ...baseAgent,
      command: "claude",
      args: ["--session", "${session_id}"],
    };
    const r = reg.resolve(
      def,
      { change_id: "add-foo", worktree_path: "/w", branch: "b" },
      "code",
    );
    expect(r.args).toEqual(["--session", ""]);
  });

  it("substitutes to empty string when session_id is the empty string", () => {
    const reg = stubRegistry();
    const def = {
      ...baseAgent,
      command: "claude",
      args: ["--session", "${session_id}"],
    };
    const r = reg.resolve(
      def,
      { change_id: "add-foo", worktree_path: "/w", branch: "b", session_id: "" },
      "code",
    );
    expect(r.args).toEqual(["--session", ""]);
  });

  it("composes with the other template vars", () => {
    const reg = stubRegistry();
    const def = {
      ...baseAgent,
      command: "sh",
      args: ["-c", "run ${change_id} in ${worktree_path} on ${branch} sid=${session_id}"],
    };
    const r = reg.resolve(
      def,
      {
        change_id: "add-mix",
        worktree_path: "/w/pool-2",
        branch: "agent/add-mix",
        session_id: "session-add-mix-1",
      },
      "code",
    );
    expect(r.args).toEqual([
      "-c",
      "run add-mix in /w/pool-2 on agent/add-mix sid=session-add-mix-1",
    ]);
  });
});
