// SPDX-License-Identifier: GPL-3.0-or-later

export type SkillNamespace = "opsx" | "ithy-opsx";
export type ManagerLike = { command?: string; roles: readonly string[] };

const ROLE_OPERATIONS: Readonly<Record<string, [SkillNamespace, string]>> = {
  propose: ["opsx", "propose"],
  code: ["opsx", "apply"],
  coder: ["opsx", "apply"],
  review: ["ithy-opsx", "review"],
  verify: ["ithy-opsx", "verify"],
  manager: ["ithy-opsx", "dispatch"],
};

/** Resolve one operation for the CLI that receives it. */
export function commandForManagerCommand(
  managerCommand: string | undefined,
  namespace: SkillNamespace,
  operation: string,
  args = "",
): string {
  const prefix = managerCommand === "codex"
    ? namespace === "opsx" ? "openspec-" : "ithy-opsx-"
    : `/${namespace}:`;
  return `${prefix}${operation}${args ? ` ${args}` : ""}`;
}

/** Resolve a built-in role prompt for the worker/Manager CLI receiving it. */
export function commandForAgentRole(
  command: string | undefined,
  role: string,
  changeIdTemplate = "${change_id}",
): string | undefined {
  const mapping = ROLE_OPERATIONS[role];
  if (!mapping) return undefined;
  const [namespace, operation] = mapping;
  return commandForManagerCommand(
    command,
    namespace,
    operation,
    role === "manager" ? "" : changeIdTemplate,
  );
}

/** Resolve a project command using the active Manager entry, if present. */
export function commandForManager(
  agents: readonly ManagerLike[],
  namespace: SkillNamespace,
  operation: string,
  args = "",
): string {
  const manager = agents.find((agent) => agent.roles.includes("manager"));
  return commandForManagerCommand(manager?.command, namespace, operation, args);
}

export function dispatchCommandForManager(
  agents: readonly ManagerLike[],
  changeId: string,
): string {
  return commandForManager(agents, "ithy-opsx", "dispatch", changeId);
}
