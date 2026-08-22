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
 * Capability tokens are expanded to Codex-friendly phrasing. Current
 * Codex Managers use collaboration tools for compatible native children and
 * retain AgentRunner for cross-CLI or configuration-incompatible workers.
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
      () => "invoke via Codex collaboration tools (`spawn_agent`, then `wait_agent`)",
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
  const command = source.manifest.namespace === "opsx" && source.manifest.command === "apply"
    ? "apply-change"
    : source.manifest.command;
  return `${prefix}-${command}`;
}

/** Codex does not use Claude's `/namespace:command` grammar. Translate
 * command references inside rendered portable skill bodies as well as the
 * prompt filename so a Codex Manager passes native names to child workers. */
function translateCommandReferences(body: string): string {
  return body.split(/(<!-- codex-preserve-start -->[\s\S]*?<!-- codex-preserve-end -->)/g)
    .map((part) => part.startsWith("<!-- codex-preserve-start -->")
      ? part.replace("<!-- codex-preserve-start -->", "").replace("<!-- codex-preserve-end -->", "")
      : part
        .replace(/\/opsx:apply\b/g, "openspec-apply-change")
        .replace(/\/opsx:([a-z0-9-]+)/g, "openspec-$1")
        .replace(/\/ithy-opsx:([a-z0-9-]+)/g, "ithy-opsx-$1"))
    .join("");
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

function singleDispatchSkill(source: SkillSource): RenderedFile {
  const metadata = yamlStringify({
    name: "ithy-opsx-dispatch",
    description: [
      "Dispatch one ithyno OpenSpec change through its code, review, and verify workers.",
      "Use when the user invokes `ithy-opsx-dispatch CHANGE_ID`, asks to dispatch a single change,",
      "or requests the manager-worker flow for one change. Do not substitute dispatch-multi unless",
      "the user explicitly supplies multiple change IDs.",
    ].join(" "),
  }, { lineWidth: 0 }).trimEnd();
  const body = [
    `---`,
    metadata,
    `---`,
    ``,
    generatedBanner(source),
    ``,
    `# Dispatch one change`,
    ``,
    `1. Treat the argument following \`ithy-opsx-dispatch\` as the single change ID.`,
    `2. Read \`.codex/prompts/ithy-opsx-dispatch.md\` completely.`,
    `3. Execute that prompt's workflow for the change ID without replacing it with`,
    `   \`ithy-opsx-dispatch-multi\`.`,
    `4. Use the multi-dispatch Skill only when the user explicitly requests multiple`,
    `   change IDs.`,
    ``,
  ].join("\n");
  return {
    path: ".codex/skills/ithy-opsx-dispatch/SKILL.md",
    content: body,
    mode: "create",
  };
}

export const codexRenderer: Renderer = {
  cli: "codex",
  render(source: SkillSource): RenderedFile[] {
    const path = `.codex/prompts/${codexCommandName(source)}.md`;
    const body = translateCommandReferences(
      expandTokens(fillPlaceholders(source.body.trimEnd(), source)),
    );
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    const files: RenderedFile[] = [{ path, content, mode: "create" }];
    if (source.id === "ithy-opsx-dispatch") {
      files.push(singleDispatchSkill(source));
    }
    return files;
  },
};
