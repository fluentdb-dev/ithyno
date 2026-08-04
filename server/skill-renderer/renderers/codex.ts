// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Codex CLI renderer for the cross-CLI skill installer.
 *
 * Emits `.codex/prompts/<namespace>-<command>.md`. Codex discovers
 * prompts from `.codex/prompts/*.md` in the project root. This is a
 * project-local renderer convention; executable Codex discovery coverage is
 * required before it is represented as a guaranteed command surface. The
 * flattened filename (`namespace-command.md` rather than `namespace/
 * command.md`) mirrors Codex's flat prompts convention.
 *
 * Capability tokens are expanded to Codex-friendly phrasing (Codex
 * uses subprocess shells rather than a Task-tool subagent, so
 * `<capability:subagent_spawn>` maps to that shape).
 *
 * MVP scope — output fidelity is "the file lands, Codex discovers
 * it as a prompt, invoking it dispatches the ithy-opsx flow". Fuller
 * per-CLI polish (leveraging Codex's specific instruction verbs) is
 * follow-up.
 */
import { stringify as yamlStringify } from "yaml";
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via Codex's subprocess shell (or `codex exec ...` for a nested run)",
    )
    .replace(/<capability:file_write>/g, () => "write with your file-write tool")
    .replace(/<capability:bash>/g, () => "run via the shell");
}

function fillPlaceholders(body: string, source: SkillSource): string {
  const ns = source.manifest.namespace;
  const cmd = source.manifest.command;
  return body.replace(/\{\{namespace\}\}/g, () => ns).replace(/\{\{command\}\}/g, () => cmd);
}

function codexCommandName(source: SkillSource): string {
  const prefix = source.manifest.namespace === "opsx" ? "openspec" : "ithy-opsx";
  return `${prefix}-${source.manifest.command}`;
}

/** Codex does not expose Claude's `/namespace:command` grammar. Translate
 * command references inside rendered portable skill bodies as well as the
 * prompt filename so a Codex Manager passes native names to child workers. */
function translateCommandReferences(body: string): string {
  return body
    .replace(/\/opsx:([a-z0-9-]+)/g, "openspec-$1")
    .replace(/\/ithy-opsx:([a-z0-9-]+)/g, "ithy-opsx-$1");
}

function frontmatter(source: SkillSource): string {
  const doc: Record<string, unknown> = {
    name: codexCommandName(source),
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

export const codexRenderer: Renderer = {
  cli: "codex",
  render(source: SkillSource): RenderedFile[] {
    const path = `.codex/prompts/${codexCommandName(source)}.md`;
    const body = translateCommandReferences(
      expandTokens(fillPlaceholders(source.body.trimEnd(), source)),
    );
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
