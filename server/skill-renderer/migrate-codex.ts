// SPDX-License-Identifier: GPL-3.0-or-later
/** Convert ithyno's bundled Claude-authoritative commands to Codex prompts. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface CodexCommandCopyResult {
  copied: string[];
  skipped: Array<{ path: string; reason: string }>;
}

export function codexPromptContent(raw: string, command: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const sourceMeta = match ? parseYaml(match[1]) as Record<string, unknown> : {};
  const description = typeof sourceMeta.description === "string"
    ? sourceMeta.description
    : `ithy-opsx ${command} command`;
  const body = translateCommandBody(raw.slice(match?.[0].length ?? 0));
  const frontmatter = stringifyYaml({
    name: `ithy-opsx-${command}`,
    description,
    "argument-hint": "command arguments",
  }, { lineWidth: 0 }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${body.trimStart()}`;
}

const CODEX_WORKER_SKILL_COMMANDS = new Set(["review", "verify"]);

/** Build a thin catalog Skill for worker commands that are delivered to a
 * non-interactive Codex process by exact name. The full procedure remains in
 * `.codex/prompts/`; this entrypoint makes the name discoverable without
 * duplicating that procedure. */
export function codexWorkerSkillContent(command: string, description: string): string {
  const name = `ithy-opsx-${command}`;
  const promptPath = `.codex/prompts/${name}.md`;
  const frontmatter = stringifyYaml({
    name,
    description: `${description.replace(/\s+/g, " ").trim()} Use when a dispatcher invokes \`${name} CHANGE_ID\`.`,
  }, { lineWidth: 0 }).trimEnd();
  return [
    "---",
    frontmatter,
    "---",
    "",
    `# ${name} worker entrypoint`,
    "",
    `1. Treat the argument following \`${name}\` as the change ID.`,
    `2. Read \`${promptPath}\` completely. If it is missing, stop with an`,
    `   actionable error naming that exact path; do not invent a ${command} procedure.`,
    `3. Execute that Prompt for the supplied change ID.`,
    "4. If the dispatcher supplied an absolute artifact contract, write",
    "   `review.md` to that exact path. It overrides relative examples and",
    "   repository-level defaults.",
    "",
  ].join("\n");
}

export function codexWorkerSkillFromCommand(raw: string, command: string): string {
  const sourceMetaMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const sourceMeta = sourceMetaMatch
    ? parseYaml(sourceMetaMatch[1]) as Record<string, unknown>
    : {};
  const description = typeof sourceMeta.description === "string"
    ? sourceMeta.description
    : `ithy-opsx ${command} command`;
  return codexWorkerSkillContent(command, description);
}

function translateCommandBody(raw: string): string {
  return raw.split(/(<!-- codex-preserve-start -->[\s\S]*?<!-- codex-preserve-end -->)/g)
    .map((part) => part.startsWith("<!-- codex-preserve-start -->")
      ? part.replace("<!-- codex-preserve-start -->", "").replace("<!-- codex-preserve-end -->", "")
      : part
        .replace(/\/opsx:apply\b/g, "openspec-apply-change")
        .replace(/\/opsx:([a-z0-9-]+)/g, "openspec-$1")
        .replace(/\/ithy-opsx:([a-z0-9-]+)/g, "ithy-opsx-$1"))
    .join("");
}

export function translateSkillBody(raw: string): string {
  return raw
    .replace(/\/opsx:apply\b/g, "openspec-apply-change")
    .replace(/\/opsx:([a-z0-9-]+)/g, "openspec-$1")
    .replace(/\/ithy-opsx:([a-z0-9-]+)/g, "ithy-opsx-$1");
}

/**
 * Convert the bundled Claude command surface rather than maintaining another
 * body copy. This intentionally runs after universal-skill rendering so the
 * bundled Claude-authoritative command wins over a same-named portable pilot
 * skill. `projectRoot` is output-only: stale generated files in the consumer
 * project must never become renderer input.
 */
export async function copyClaudeIthyOpsxCommandsToCodex(
  canonicalRoot: string,
  projectRoot: string,
  opts: { dryRun?: boolean; rendererOwnedPaths?: ReadonlySet<string> } = {},
): Promise<CodexCommandCopyResult> {
  const sourceDir = join(canonicalRoot, ".claude", "commands", "ithy-opsx");
  const targetDir = join(projectRoot, ".codex", "prompts");
  const result: CodexCommandCopyResult = { copied: [], skipped: [] };
  let entries: string[];
  try {
    entries = await readdir(sourceDir);
  } catch {
    return result;
  }
  const names = entries.filter((entry) => /^[a-z0-9-]+\.md$/i.test(entry));
  if (names.length > 0 && !opts.dryRun) await mkdir(targetDir, { recursive: true });
  for (const name of names) {
    const command = name.slice(0, -3);
    const rel = posix.join(".codex", "prompts", `ithy-opsx-${command}.md`);
    if (opts.rendererOwnedPaths?.has(rel)) {
      result.skipped.push({ path: rel, reason: "renderer output is authoritative" });
      continue;
    }
    try {
      const raw = await readFile(join(sourceDir, name), "utf8");
      if (!opts.dryRun) {
        await writeFile(join(targetDir, `ithy-opsx-${command}.md`), codexPromptContent(raw, command), "utf8");
      }
      result.copied.push(rel);
      if (CODEX_WORKER_SKILL_COMMANDS.has(command)) {
        const skillRel = posix.join(".codex", "skills", `ithy-opsx-${command}`, "SKILL.md");
        if (opts.rendererOwnedPaths?.has(skillRel)) {
          result.skipped.push({ path: skillRel, reason: "renderer output is authoritative" });
          continue;
        }
        try {
          if (!opts.dryRun) {
            const skillDir = join(projectRoot, ".codex", "skills", `ithy-opsx-${command}`);
            await mkdir(skillDir, { recursive: true });
            await writeFile(
              join(skillDir, "SKILL.md"),
              codexWorkerSkillFromCommand(raw, command),
              "utf8",
            );
          }
          result.copied.push(skillRel);
        } catch (err) {
          result.skipped.push({
            path: skillRel,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      result.skipped.push({ path: rel, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // Existing Claude skill directories remain canonical and are mirrored to
  // Codex. The review/verify command exceptions above receive only thin
  // catalog entrypoints; their full procedure bodies remain Prompt files.
  const claudeSkills = join(canonicalRoot, ".claude", "skills");
  let skillEntries: string[];
  try {
    skillEntries = await readdir(claudeSkills);
  } catch {
    return result;
  }
  for (const skill of skillEntries.filter((name) => /^ithy-opsx-[a-z0-9-]+$/i.test(name))) {
    const source = join(claudeSkills, skill, "SKILL.md");
    const target = join(projectRoot, ".codex", "skills", skill, "SKILL.md");
    const rel = posix.join(".codex", "skills", skill, "SKILL.md");
    if (opts.rendererOwnedPaths?.has(rel)) {
      result.skipped.push({ path: rel, reason: "renderer output is authoritative" });
      continue;
    }
    try {
      const raw = await readFile(source, "utf8");
      if (!opts.dryRun) {
        await mkdir(join(projectRoot, ".codex", "skills", skill), { recursive: true });
        await writeFile(target, translateSkillBody(raw), "utf8");
      }
      result.copied.push(rel);
    } catch (err) {
      result.skipped.push({ path: rel, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}
