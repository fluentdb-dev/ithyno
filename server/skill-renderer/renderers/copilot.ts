// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * GitHub Copilot renderer for the cross-CLI skill installer.
 *
 * Emits `.github/prompts/<namespace>-<command>.md`. GitHub Copilot
 * for VS Code and JetBrains reads custom prompts from
 * `.github/prompts/` (per Copilot's project-scoped prompt docs);
 * some clients also honor `.github/copilot-instructions.md` as a
 * general instruction fragment, but per-command discovery lives in
 * `.github/prompts/*.md`.
 *
 * For fragment-merge into `.github/copilot-instructions.md`
 * (deferred): the renderer contract's fragment support would be a
 * cleaner fit, but for MVP one-file-per-skill under `.github/prompts/`
 * is discoverable and does not require merging into a shared file.
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

function frontmatter(source: SkillSource): string {
  const doc: Record<string, unknown> = {
    name: `${source.manifest.namespace}-${source.manifest.command}`,
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

export const copilotRenderer: Renderer = {
  cli: "copilot",
  render(source: SkillSource): RenderedFile[] {
    const path = `.github/prompts/${source.manifest.namespace}-${source.manifest.command}.md`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
