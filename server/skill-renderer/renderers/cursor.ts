// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Cursor renderer for the cross-CLI skill installer.
 *
 * Emits `.cursor/rules/<namespace>-<command>.mdc`. Cursor's project
 * rules convention (`.cursor/rules/*.mdc`) is well-established —
 * `.mdc` files are markdown-with-directives that Cursor auto-loads
 * as project-scoped rules. `alwaysApply: false` makes the rule
 * agent-triggerable rather than always-injected.
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
  const doc: Record<string, unknown> = {
    description: source.manifest.description.replace(/\s+/g, " ").trim(),
    alwaysApply: false,
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
    const path = `.cursor/rules/${source.manifest.namespace}-${source.manifest.command}.mdc`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
