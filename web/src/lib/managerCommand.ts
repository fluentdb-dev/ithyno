import type { AgentPublic } from "../types";

export type SkillNamespace = "opsx" | "ithy-opsx";

/** Resolve a project skill command for the Manager that will receive it. */
export function commandForManager(
  agents: readonly AgentPublic[],
  namespace: SkillNamespace,
  operation: string,
  args = "",
): string {
  const manager = agents.find((agent) => agent.roles.includes("manager"));
  const prefix = manager?.command === "codex"
    ? namespace === "opsx" ? "openspec-" : "ithy-opsx-"
    : `/${namespace}:`;
  return `${prefix}${operation}${args ? ` ${args}` : ""}`;
}

/** Return the command a Manager prompt surface understands for dispatch. */
export function dispatchCommandForManager(agents: readonly AgentPublic[], changeId: string): string {
  return commandForManager(agents, "ithy-opsx", "dispatch", changeId);
}
