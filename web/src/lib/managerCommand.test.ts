import { describe, expect, it } from "vitest";
import { CODEX_CODE_SCOPE_CONTRACT, commandForAgentRole, commandForManager, commandForManagerCommand, dispatchCommandForManager } from "./managerCommand";
import type { AgentPublic } from "../types";

function agent(command: string, roles: string[]): AgentPublic {
  return { name: command, command, roles, mode: "live-shell", hasEnv: false, role: roles[0] };
}

describe("dispatchCommandForManager", () => {
  it("uses Codex's flat command surface", () => {
    expect(dispatchCommandForManager([agent("codex", ["manager"])], "add-hello"))
      .toBe("ithy-opsx-dispatch add-hello");
  });

  it("preserves the slash command for non-Codex Managers", () => {
    expect(dispatchCommandForManager([agent("claude", ["manager"])], "add-hello"))
      .toBe("/ithy-opsx:dispatch add-hello");
  });
});

describe("commandForManager", () => {
  const codex = [agent("codex", ["manager"])];
  const claude = [agent("claude", ["manager"])];

  it.each([
    ["opsx", "propose", "'test function helloworld'", "openspec-propose 'test function helloworld'"],
    ["opsx", "apply", "add-hello", "openspec-apply-change add-hello"],
    ["ithy-opsx", "archive", "add-hello", "ithy-opsx-archive add-hello"],
    ["ithy-opsx", "merge", "add-hello", "ithy-opsx-merge add-hello"],
    ["ithy-opsx", "import", "/tmp/project", "ithy-opsx-import /tmp/project"],
  ] as const)("uses Codex command for %s:%s", (namespace, operation, args, expected) => {
    expect(commandForManager(codex, namespace, operation, args)).toBe(expected);
  });

  it("preserves slash commands for non-Codex and no Manager", () => {
    expect(commandForManager(claude, "opsx", "propose", "'hello'"))
      .toBe("/opsx:propose 'hello'");
    expect(commandForManager([], "ithy-opsx", "import", "/tmp/project"))
      .toBe("/ithy-opsx:import /tmp/project");
  });
});

describe("commandForManagerCommand", () => {
  it("is usable by server-side entry points without an Agent list", () => {
    expect(commandForManagerCommand("codex", "ithy-opsx", "import", "/tmp/project"))
      .toBe("ithy-opsx-import /tmp/project");
    expect(commandForManagerCommand(undefined, "ithy-opsx", "import", "/tmp/project"))
      .toBe("/ithy-opsx:import /tmp/project");
  });
});

describe("commandForAgentRole", () => {
  it.each([
    ["codex", "code", `openspec-apply-change \${change_id}\n\n${CODEX_CODE_SCOPE_CONTRACT}`],
    ["codex", "review", "ithy-opsx-review ${change_id}"],
    ["codex", "verify", "ithy-opsx-verify ${change_id}"],
    ["codex", "manager", "ithy-opsx-dispatch"],
    ["claude", "code", "/opsx:apply ${change_id}"],
    ["claude", "review", "/ithy-opsx:review ${change_id}"],
  ])("maps %s %s", (command, role, expected) => {
    expect(commandForAgentRole(command, role)).toBe(expected);
  });

  it("returns undefined for a custom role", () => {
    expect(commandForAgentRole("codex", "probe")).toBeUndefined();
  });
});
