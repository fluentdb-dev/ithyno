// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Claude Code renderer for the cross-CLI skill installer.
 *
 * Emits `.claude/commands/<namespace>/<command>.md` — a slash-command
 * wrapper that Claude Code discovers automatically. The wrapper's body
 * comes from the skill's universal SKILL.md with capability tokens
 * expanded into Claude-native phrasing (Task tool, etc.).
 *
 * A future revision may also emit `.claude/skills/<skill-id>/SKILL.md`
 * when the manifest opts in (some flows benefit from having both a
 * slash-command wrapper and a discoverable skill). For v1 we emit only
 * the command wrapper — matches how existing ithy-opsx commands work.
 */
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

/** Render capability tokens into Claude-native phrasing. */
function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      "invoke via the Task tool (or /ithy-opsx:dispatch for a live-shell worker)",
    )
    .replace(/<capability:file_write>/g, "use the Edit or Write tool")
    .replace(/<capability:bash>/g, "run via the Bash tool");
}

/** Fill `{{namespace}}` / `{{command}}` placeholders that skill bodies use. */
function fillPlaceholders(body: string, source: SkillSource): string {
  return body
    .replace(/\{\{namespace\}\}/g, source.manifest.namespace)
    .replace(/\{\{command\}\}/g, source.manifest.command);
}

function frontmatter(source: SkillSource): string {
  const claudeOverrides = (source.manifest.per_cli?.claude ?? {}) as {
    category?: string;
    tags?: string[];
  };
  const displayName = `${source.manifest.namespace.toUpperCase()}: ${
    source.manifest.command.charAt(0).toUpperCase() + source.manifest.command.slice(1)
  }`;
  const lines = [
    "---",
    `name: "${displayName}"`,
    `description: ${source.manifest.description.replace(/\s+/g, " ").trim()}`,
    ...(claudeOverrides.category ? [`category: ${claudeOverrides.category}`] : []),
    ...(claudeOverrides.tags && claudeOverrides.tags.length > 0
      ? [`tags: [${claudeOverrides.tags.join(", ")}]`]
      : []),
    "---",
  ];
  return lines.join("\n");
}

function generatedBanner(source: SkillSource): string {
  return [
    "<!--",
    `  GENERATED FILE — do not hand-edit.`,
    `  Source: ithyno/skills/${source.id}/{SKILL.md, manifest.yaml}`,
    `  Regenerate: openspec init --skills-only  (part of generalize-skills-cross-cli)`,
    "-->",
  ].join("\n");
}

export const claudeRenderer: Renderer = {
  cli: "claude",
  render(source: SkillSource): RenderedFile[] {
    const path = `.claude/commands/${source.manifest.namespace}/${source.manifest.command}.md`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
