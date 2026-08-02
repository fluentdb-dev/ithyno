// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * opencode renderer for the cross-CLI skill installer.
 *
 * Emits `.opencode/commands/<namespace>-<command>.md` — matches
 * openspec's opencode adapter. The dir is `commands/`, NOT
 * `prompts/`. Frontmatter shape (description only) mirrors
 * openspec's adapter.
 */
import { stringify as yamlStringify } from "yaml";
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via `opencode run` for a nested run",
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
  // openspec's opencode adapter emits only `description:`.
  const doc: Record<string, unknown> = {
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

export const opencodeRenderer: Renderer = {
  cli: "opencode",
  render(source: SkillSource): RenderedFile[] {
    const path = `.opencode/commands/${source.manifest.namespace}-${source.manifest.command}.md`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
