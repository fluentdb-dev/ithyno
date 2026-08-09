// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Antigravity (agy) renderer for the cross-CLI skill installer.
 *
 * Emits `.agent/workflows/<namespace>/<command>.md` — agy reads
 * `.agent/workflows/` and derives the slash-command name from the
 * file's path shape:
 *   - flat `<name>.md`                → `/<name>`   (openspec's opsx-*)
 *   - nested `<namespace>/<cmd>.md`   → `/<namespace>:<cmd>`
 * ithy-opsx skills need the colon form (`/ithy-opsx:dispatch`), so
 * they go under a `<namespace>/` subdirectory. OpenSpec's own Agy adapter
 * emits flat `opsx-<id>.md` files under the same singular `.agent/` root;
 * that flat shape is what OpenSpec chose for its own commands. Frontmatter
 * shape (description only) matches OpenSpec's adapter.
 *
 * The `agy` CLI key from `server/doctor.ts::Cli` is aliased to
 * `antigravity` at the resolver level (see `renderers/index.ts`).
 * agents.yaml still writes `command: agy` — the alias only affects
 * renderer resolution.
 *
 * The dispatch skill additionally emits a project rule at
 * `.agent/rules/ithy-opsx-dispatch.md`. Agy loads rules more eagerly than
 * workflow bodies, so this small guard prevents the Manager from silently
 * implementing a selected worker stage itself instead of calling
 * `invoke_subagent`.
 */
import { stringify as yamlStringify } from "yaml";
import type { Renderer, RenderedFile, SkillSource } from "../types.js";

function expandTokens(body: string): string {
  return body
    .replace(
      /<capability:subagent_spawn>/g,
      () => "invoke via `invoke_subagent`",
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

function dispatchExecutionRule(source: SkillSource): RenderedFile {
  const content = [
    generatedBanner(source),
    "",
    "# Ithy OpenSpec Dispatch Execution Rules",
    "",
    "When performing `/ithy-opsx:dispatch` or evaluating",
    "`.agent/workflows/ithy-opsx/dispatch.md` as an Agy/Antigravity Manager:",
    "",
    "1. **Delegate selected Agy workers.** After the dispatcher selects a",
    "   single-prompt Agy/Antigravity worker from `agents.yaml`, you MUST call",
    "   `invoke_subagent`. Do not implement that worker stage in the Manager",
    "   session.",
    "2. **Preserve routing priority.** A configured `live-shell` agmsg worker",
    "   still uses the higher-priority agmsg branch. Cross-CLI workers and Agy",
    "   runtimes without `invoke_subagent` use the server AgentRunner branch.",
    "3. **Preserve the worker contract.** Set the tool's `TypeName` / `Role`",
    "   from the selected `agents.yaml` worker and stage (`code`, `review`, or",
    "   `verify`). Pass its full prompt and artifact contract, the exact",
    "   absolute execution root, and the configured model when one is present",
    "   in `agents.yaml`. Await the child result before judging the stage.",
    "4. **Do not bypass delegation.** Do not directly run `openspec-apply`, edit",
    "   implementation files, or perform the selected worker's role in the",
    "   Manager session unless `invoke_subagent` is unavailable or its call",
    "   explicitly fails. In that case, use the documented AgentRunner",
    "   fallback; do not assemble a direct `agy -p` subprocess.",
    "",
  ].join("\n");

  return {
    path: ".agent/rules/ithy-opsx-dispatch.md",
    content,
    mode: "create",
  };
}

export const antigravityRenderer: Renderer = {
  cli: "antigravity",
  render(source: SkillSource): RenderedFile[] {
    // Nested `<namespace>/<command>.md` shape → agy exposes it as
    // `/<namespace>:<command>` (colon-separated), which matches how
    // the ithy-opsx skills are referenced everywhere else in this
    // codebase (e.g. `/ithy-opsx:dispatch`).
    const path = `.agent/workflows/${source.manifest.namespace}/${source.manifest.command}.md`;
    const body = expandTokens(fillPlaceholders(source.body.trimEnd(), source));
    const content = [frontmatter(source), "", generatedBanner(source), "", body, ""].join("\n");
    const files: RenderedFile[] = [{ path, content, mode: "create" }];
    if (source.id === "ithy-opsx-dispatch") {
      files.push(dispatchExecutionRule(source));
    }
    return files;
  },
};
