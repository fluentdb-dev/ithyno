// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Antigravity (agy) renderer for the cross-CLI skill installer.
 *
 * Emits `.agents/workflows/<namespace>/<command>.md` — agy reads
 * `.agents/workflows/` and derives the slash-command name from the
 * file's path shape:
 *   - flat `<name>.md`                → `/<name>`   (openspec's opsx-*)
 *   - nested `<namespace>/<cmd>.md`   → `/<namespace>:<cmd>`
 * ithy-opsx skills need the colon form (`/ithy-opsx:dispatch`), so
 * they go under a `<namespace>/` subdirectory. NOTE: openspec's own
 * antigravity adapter is still on the legacy `.agent/workflows/`
 * (out of date as of openspec 0.x in this repo) and emits flat
 * `opsx-<id>.md`; that flat shape is what openspec chose for its
 * own commands. Migrating that legacy `.agent/` output is tracked
 * separately. Frontmatter shape (description only) matches openspec's
 * adapter.
 *
 * The `agy` CLI key from `server/doctor.ts::Cli` is aliased to
 * `antigravity` at the resolver level (see `renderers/index.ts`).
 * agents.yaml still writes `command: agy` — the alias only affects
 * renderer resolution.
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
  // openspec's antigravity adapter emits only `description:` — mirror it.
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

export const antigravityRenderer: Renderer = {
  cli: "antigravity",
  render(source: SkillSource): RenderedFile[] {
    // Nested `<namespace>/<command>.md` shape → agy exposes it as
    // `/<namespace>:<command>` (colon-separated), which matches how
    // the ithy-opsx skills are referenced everywhere else in this
    // codebase (e.g. `/ithy-opsx:dispatch`).
    const path = `.agents/workflows/${source.manifest.namespace}/${source.manifest.command}.md`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    return [{ path, content, mode: "create" }];
  },
};
