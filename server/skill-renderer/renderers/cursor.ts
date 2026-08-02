// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Cursor renderer for the cross-CLI skill installer.
 *
 * Emits `.cursor/commands/<namespace>-<command>.md` — matches
 * openspec's cursor adapter path convention. Cursor reads project
 * commands from `.cursor/commands/*.md`; `.cursor/rules/*.mdc` is a
 * DIFFERENT surface (auto-injected rules), not the commands slot.
 * Frontmatter shape (name/id/category/description) mirrors
 * openspec's cursor adapter.
 */
import { stringify as yamlStringify } from "yaml";
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via Cursor's agent tool",
    )
    .replace(/<capability:file_write>/g, () => "write with the file editor")
    .replace(/<capability:bash>/g, () => "run via the terminal tool");
}

function fillPlaceholders(body: string, source: SkillSource): string {
  const ns = source.manifest.namespace;
  const cmd = source.manifest.command;
  return body.replace(/\{\{namespace\}\}/g, () => ns).replace(/\{\{command\}\}/g, () => cmd);
}

function frontmatter(source: SkillSource): string {
  // Mirrors openspec's cursor adapter (name/id/category/description).
  const id = `${source.manifest.namespace}-${source.manifest.command}`;
  const doc: Record<string, unknown> = {
    name: `/${id}`,
    id,
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

export const cursorRenderer: Renderer = {
  cli: "cursor",
  render(source: SkillSource): RenderedFile[] {
    const path = `.cursor/commands/${source.manifest.namespace}-${source.manifest.command}.md`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
