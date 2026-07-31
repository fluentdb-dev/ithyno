// SPDX-License-Identifier: GPL-3.0-or-later
import type { CliId, Renderer } from "../types.js";
import { claudeRenderer } from "./claude.js";
import { codexRenderer } from "./codex.js";
import { antigravityRenderer } from "./antigravity.js";
import { cursorRenderer } from "./cursor.js";
import { geminiRenderer } from "./gemini.js";
import { copilotRenderer } from "./copilot.js";
import { opencodeRenderer } from "./opencode.js";

/**
 * Renderer registry. All 7 known CLIs registered
 * (scaffold-ithy-opsx-skills-per-cli). Non-Claude renderers are
 * MVP — output paths follow the most-common convention per CLI's
 * public docs / openspec's own `--tools <t>` scaffold; per-CLI
 * content polish is follow-up.
 */
const REGISTRY: Partial<Record<CliId, Renderer>> = {
  claude: claudeRenderer,
  codex: codexRenderer,
  antigravity: antigravityRenderer,
  cursor: cursorRenderer,
  gemini: geminiRenderer,
  copilot: copilotRenderer,
  opencode: opencodeRenderer,
};

/**
 * Ithyno's `Cli` type (from `server/doctor.ts`) uses `agy` as the
 * CLI key for Antigravity — the actual binary name users install.
 * The skill-renderer subsystem uses `antigravity` as the format
 * identifier (aligns with openspec's own `--tools antigravity` and
 * with Antigravity's official product name). This map bridges the
 * two so `mapDoctorCliToRendererCli("agy")` returns `"antigravity"`.
 *
 * Callers that already have a `CliId` (skill-renderer's own enum)
 * can call `getRenderer(cli)` directly; callers holding an ithyno
 * `Cli` value should first pass it through this map.
 */
const DOCTOR_TO_RENDERER: Record<string, CliId> = {
  claude: "claude",
  codex: "codex",
  agy: "antigravity",
  antigravity: "antigravity",
  cursor: "cursor",
  gemini: "gemini",
  copilot: "copilot",
  opencode: "opencode",
};

export function mapDoctorCliToRendererCli(cli: string): CliId | undefined {
  return DOCTOR_TO_RENDERER[cli];
}

export function getRenderer(cli: CliId): Renderer | undefined {
  return REGISTRY[cli];
}

export function knownRendererClis(): CliId[] {
  return Object.keys(REGISTRY) as CliId[];
}
