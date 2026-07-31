// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Antigravity (agy) renderer for the cross-CLI skill installer.
 *
 * Emits `.antigravity/skills/<namespace>-<command>/SKILL.md`.
 * Antigravity is Google's Gemini-based coding assistant; per
 * openspec's `--tools antigravity` scaffold, per-project skill
 * discovery lives under `.antigravity/`. The nested directory shape
 * (`<skill-id>/SKILL.md`) mirrors what Antigravity's onboarding docs
 * describe as its skill layout.
 *
 * The `agy` CLI key from `server/doctor.ts::Cli` is aliased to
 * `antigravity` at the resolver level (see `renderers/index.ts`).
 * agents.yaml still writes `command: agy` — the alias only affects
 * renderer resolution.
 *
 * MVP scope — path may need adjustment when Antigravity's official
 * discovery convention is confirmed (docs are still evolving as of
 * 2026-07). The output format is portable markdown so the file is
 * readable regardless of exact discovery mechanism.
 */
import { stringify as yamlStringify } from "yaml";
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via `agy exec` for a nested run",
    )
    .replace(/<capability:file_write>/g, () => "write with your file tools")
    .replace(/<capability:bash>/g, () => "run via the shell");
}

function fillPlaceholders(body: string, source: SkillSource): string {
  const ns = source.manifest.namespace;
  const cmd = source.manifest.command;
  return body.replace(/\{\{namespace\}\}/g, () => ns).replace(/\{\{command\}\}/g, () => cmd);
}

function frontmatter(source: SkillSource): string {
  const doc: Record<string, unknown> = {
    name: `${source.manifest.namespace}:${source.manifest.command}`,
    description: source.manifest.description.replace(/\s+/g, " ").trim(),
  };
  const yaml = yamlStringify(doc, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---`;
}

function generatedBanner(source: SkillSource): string {
  return [
    "<!--",
    `  GENERATED FILE — do not hand-edit.`,
    `  Source: ithyno/skills/${source.id}/{SKILL.md, manifest.yaml}`,
    `  Regenerate: openspec init --skills-only`,
    "-->",
  ].join("\n");
}

export const antigravityRenderer: Renderer = {
  cli: "antigravity",
  render(source: SkillSource): RenderedFile[] {
    const skillId = `${source.manifest.namespace}-${source.manifest.command}`;
    const path = `.antigravity/skills/${skillId}/SKILL.md`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
