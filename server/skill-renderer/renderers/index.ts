// SPDX-License-Identifier: GPL-3.0-or-later
import type { CliId, Renderer } from "../types.js";
import { claudeRenderer } from "./claude.js";

/**
 * Renderer registry. Adding a new CLI = add its renderer here.
 * Follow-up changes will register codex/antigravity/cursor/gemini/
 * copilot/opencode as their formats are researched (deferred to
 * separate changes per the propose).
 */
const REGISTRY: Partial<Record<CliId, Renderer>> = {
  claude: claudeRenderer,
};

export function getRenderer(cli: CliId): Renderer | undefined {
  return REGISTRY[cli];
}

export function knownRendererClis(): CliId[] {
  return Object.keys(REGISTRY) as CliId[];
}
