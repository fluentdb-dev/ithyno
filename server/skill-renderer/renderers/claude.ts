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
import { stringify as yamlStringify } from "yaml";
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

/** Render capability tokens into Claude-native phrasing.
 *
 *  Uses the function form of `String.replace` so any `$&`, `$'`, `$1`
 *  in the source body cannot re-splice matched text into the output.
 *  (The `body` argument itself is trusted markdown, but this keeps the
 *  code shape uniform with placeholder fill, which does handle
 *  manifest-supplied values.)
 */
function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via the Task tool (or /ithy-opsx:dispatch for a live-shell worker)",
    )
    .replace(/<capability:file_write>/g, () => "use the Edit or Write tool")
    .replace(/<capability:bash>/g, () => "run via the Bash tool");
}

/** Fill `{{namespace}}` / `{{command}}` placeholders that skill bodies use.
 *
 *  Uses the function form of `String.replace` so a manifest value
 *  containing `$&`, `$'`, or `$1..$9` cannot re-splice the placeholder
 *  or leak surrounding text into the output. The JSON schema patterns
 *  already forbid such characters in `namespace`/`command`, but the
 *  schema is not enforced at runtime yet (Ajv deferred), so we defend
 *  in depth.
 */
function fillPlaceholders(body: string, source: SkillSource): string {
  const ns = source.manifest.namespace;
  const cmd = source.manifest.command;
  return body.replace(/\{\{namespace\}\}/g, () => ns).replace(/\{\{command\}\}/g, () => cmd);
}

/** Serialize the Claude command frontmatter via `yaml.stringify` so any
 *  scalar containing `: `, a leading `#`/`[`/`>`/`&`, an unbalanced
 *  quote, or a backslash is quoted/escaped correctly. Hand-rolling
 *  `key: ${value}` breaks the moment a description happens to contain
 *  a colon-space. */
function frontmatter(source: SkillSource): string {
  const claudeOverrides = (source.manifest.per_cli?.claude ?? {}) as {
    category?: string;
    tags?: string[];
  };
  const displayName = `${source.manifest.namespace.toUpperCase()}: ${
    source.manifest.command.charAt(0).toUpperCase() + source.manifest.command.slice(1)
  }`;
  const doc: Record<string, unknown> = {
    name: displayName,
    description: source.manifest.description.replace(/\s+/g, " ").trim(),
  };
  if (claudeOverrides.category) doc.category = claudeOverrides.category;
  if (claudeOverrides.tags && claudeOverrides.tags.length > 0) doc.tags = claudeOverrides.tags;
  const yaml = yamlStringify(doc, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---`;
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
