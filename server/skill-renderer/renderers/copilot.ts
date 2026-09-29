// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * GitHub Copilot renderer for the cross-CLI skill installer.
 *
 * Emits both Copilot surfaces used by OpenSpec's default `both`
 * delivery mode:
 *
 * - `.github/skills/<skill-id>/SKILL.md` for native skill discovery.
 * - `.github/prompts/<namespace>-<command>.prompt.md` for explicit
 *   command invocation and compatibility with existing projects.
 *
 * The native Skill uses name + description frontmatter. The Prompt
 * keeps OpenSpec's description-only prompt frontmatter.
 */
import { stringify as yamlStringify } from "yaml";
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via a subprocess (Copilot lacks a subagent tool)",
    )
    .replace(/<capability:file_write>/g, () => "use Copilot's file editor")
    .replace(/<capability:bash>/g, () => "run via the terminal");
}

function fillPlaceholders(body: string, source: SkillSource): string {
  const ns = source.manifest.namespace;
  const cmd = source.manifest.command;
  return body.replace(/\{\{namespace\}\}/g, () => ns).replace(/\{\{command\}\}/g, () => cmd);
}

function promptFrontmatter(source: SkillSource): string {
  const doc: Record<string, unknown> = {
    description: source.manifest.description.replace(/\s+/g, " ").trim(),
  };
  const yaml = yamlStringify(doc, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---`;
}

function skillFrontmatter(source: SkillSource): string {
  const doc: Record<string, unknown> = {
    name: source.manifest.name,
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

function renderFile(path: string, frontmatter: string, source: SkillSource): RenderedFile {
  const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
  const content = [frontmatter, "", generatedBanner(source), "", body, ""].join("\n");
  return { path, content, mode: "create" };
}

export const copilotRenderer: Renderer = {
  cli: "copilot",
  render(source: SkillSource): RenderedFile[] {
    return [
      renderFile(
        `.github/skills/${source.id}/SKILL.md`,
        skillFrontmatter(source),
        source,
      ),
      renderFile(
        `.github/prompts/${source.manifest.namespace}-${source.manifest.command}.prompt.md`,
        promptFrontmatter(source),
        source,
      ),
    ];
  },
};
