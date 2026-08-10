// SPDX-License-Identifier: GPL-3.0-or-later
/** Convert project-local Claude ithy-opsx commands to Codex flat prompts. */
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
 * Copy the existing Claude command surface rather than maintaining another
 * body copy. This intentionally runs after universal-skill rendering: the
 * project command is the authoritative content for the equivalent Codex
 * prompt as well.
 */
export async function copyClaudeIthyOpsxCommandsToCodex(
  projectRoot: string,
  opts: { dryRun?: boolean } = {},
): Promise<CodexCommandCopyResult> {
  const sourceDir = join(projectRoot, ".claude", "commands", "ithy-opsx");
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
    try {
      const raw = await readFile(join(sourceDir, name), "utf8");
      if (!opts.dryRun) {
        await writeFile(join(targetDir, `ithy-opsx-${command}.md`), codexPromptContent(raw, command), "utf8");
      }
      result.copied.push(rel);
    } catch (err) {
      result.skipped.push({ path: rel, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  // Skills remain skills: existing Claude skill directories are canonical
  // and are mirrored to Codex. Command files above are deliberately NOT
  // promoted into this directory.
  const claudeSkills = join(projectRoot, ".claude", "skills");
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
