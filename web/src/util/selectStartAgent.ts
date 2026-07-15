// SPDX-License-Identifier: GPL-3.0-or-later
import type { AgentPublic } from "../types";

export type StartAgentSelection =
  | { kind: "none" }
  | { kind: "auto"; agent: AgentPublic }
  | { kind: "pick"; candidates: AgentPublic[] }
  | { kind: "fallback-manager"; agent: AgentPublic };

/**
 * Decide which agent the Kanban / ChangeDetail Start button should spawn.
 *
 * Rules (restoring pre-multi-agent UX where an unambiguous single agent
 * runs without a picker):
 *   - 0 code agents + 0 manager     → "none" (caller shows an error)
 *   - 1 code agent                  → "auto" (spawn it, no picker)
 *   - >1 code agents                → "pick" (show picker among code agents only)
 *   - 0 code agents + >=1 manager   → "fallback-manager" (first manager)
 */
export function selectStartAgent(agents: AgentPublic[]): StartAgentSelection {
  const codeAgents = agents.filter((a) => (a.roles ?? []).includes("code"));
  if (codeAgents.length === 1) return { kind: "auto", agent: codeAgents[0] };
  if (codeAgents.length > 1) return { kind: "pick", candidates: codeAgents };
  const manager = agents.find((a) => (a.roles ?? []).includes("manager"));
  if (manager) return { kind: "fallback-manager", agent: manager };
  return { kind: "none" };
}
