import { describe, it, expect } from "vitest";
import { parsePorcelain } from "./adopt-orphans.js";

const PROJECT = "/Users/dev/openspec-ui";

describe("parsePorcelain", () => {
  it("returns entries under .worktrees/ with matching agent/<id> branch", () => {
    const stdout = [
      "worktree /Users/dev/openspec-ui",
      "HEAD abc1234",
      "branch refs/heads/main",
      "",
      "worktree /Users/dev/openspec-ui/.worktrees/add-vscode-extension",
      "HEAD def5678",
      "branch refs/heads/agent/add-vscode-extension",
      "",
      "worktree /Users/dev/openspec-ui/.worktrees/add-electron-shell",
      "HEAD 111aaaa",
      "branch refs/heads/agent/add-electron-shell",
      "",
    ].join("\n");
    const res = parsePorcelain(stdout, PROJECT);
    expect(res).toEqual([
      {
        changeId: "add-vscode-extension",
        worktreePath: "/Users/dev/openspec-ui/.worktrees/add-vscode-extension",
        branch: "agent/add-vscode-extension",
      },
      {
        changeId: "add-electron-shell",
        worktreePath: "/Users/dev/openspec-ui/.worktrees/add-electron-shell",
        branch: "agent/add-electron-shell",
      },
    ]);
  });

  it("ignores worktrees outside .worktrees/", () => {
    const stdout = [
      "worktree /Users/dev/openspec-ui",
      "HEAD abc1234",
      "branch refs/heads/main",
      "",
      "worktree /Users/dev/other-place/agent-foo",
      "HEAD def5678",
      "branch refs/heads/agent/foo",
      "",
    ].join("\n");
    expect(parsePorcelain(stdout, PROJECT)).toEqual([]);
  });

  it("ignores worktrees whose branch does not match agent/<id>", () => {
    const stdout = [
      "worktree /Users/dev/openspec-ui/.worktrees/manual",
      "HEAD def5678",
      "branch refs/heads/feature/manual",
      "",
    ].join("\n");
    expect(parsePorcelain(stdout, PROJECT)).toEqual([]);
  });

  it("ignores entries where directory name does not match the branch id", () => {
    const stdout = [
      "worktree /Users/dev/openspec-ui/.worktrees/wrong-dir-name",
      "HEAD def5678",
      "branch refs/heads/agent/some-other-change",
      "",
    ].join("\n");
    expect(parsePorcelain(stdout, PROJECT)).toEqual([]);
  });

  it("survives malformed blocks", () => {
    const stdout = [
      "worktree /Users/dev/openspec-ui/.worktrees/add-good",
      "HEAD abc1234",
      "branch refs/heads/agent/add-good",
      "",
      "totally-bogus-line",
      "",
      "worktree /Users/dev/openspec-ui/.worktrees/add-second",
      "branch refs/heads/agent/add-second",
      "",
    ].join("\n");
    const res = parsePorcelain(stdout, PROJECT);
    expect(res.map((r) => r.changeId).sort()).toEqual(["add-good", "add-second"]);
  });

  it("handles a detached (branchless) record without crashing", () => {
    const stdout = [
      "worktree /Users/dev/openspec-ui/.worktrees/detached",
      "HEAD abc1234",
      "detached",
      "",
    ].join("\n");
    expect(parsePorcelain(stdout, PROJECT)).toEqual([]);
  });

  it("returns empty for empty input", () => {
    expect(parsePorcelain("", PROJECT)).toEqual([]);
  });
});
