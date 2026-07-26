// SPDX-License-Identifier: GPL-3.0-or-later
// Shared assertion helpers for skill-e2e.
//
// The harness catches specific failure modes named in the spec's scenarios:
// - "command not found" / "skill not resolved" (resolution regression)
// - "parseable-frontmatter" error naming $REVIEW_MD_PATH (contract regression)
// These helpers produce error messages that match those shapes so failure
// diagnosis is one glance, not a bisection.

import { existsSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Assert a path exists; throw a rich error naming it if not. */
export function assertExists(path, label = path) {
  if (!existsSync(path)) {
    const err = new Error(`missing artifact: ${label} (path: ${path})`);
    err.code = "MISSING_ARTIFACT";
    err.path = path;
    throw err;
  }
  return true;
}

/** Assert a file exists AND is a regular file (not a dir). */
export function assertFile(path, label = path) {
  assertExists(path, label);
  const s = statSync(path);
  if (!s.isFile()) {
    throw new Error(`expected file but got ${s.isDirectory() ? "directory" : "other"}: ${path}`);
  }
  return true;
}

/**
 * Read the frontmatter block from a markdown file (lines between the first
 * two `---` markers) and parse the simple `key: value` pairs. Returns the
 * parsed object or throws a named "parseable-frontmatter" error.
 *
 * Not a full YAML parser — enough for verdict: pass / needs-rework and
 * similar. Matches the shape ithy-opsx review workers write.
 */
export async function readFrontmatter(path) {
  assertFile(path, `review artifact at ${path}`);
  const raw = await readFile(path, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    const err = new Error(
      `parseable-frontmatter failure at ${path}: no --- delimited frontmatter block found`,
    );
    err.code = "FRONTMATTER_MISSING";
    err.path = path;
    throw err;
  }
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!kv) continue;
    fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return { frontmatter: fm, raw };
}

/** Assert the review.md at `path` has a `verdict:` frontmatter entry with an expected value. */
export async function assertVerdict(path, expected) {
  const { frontmatter } = await readFrontmatter(path);
  if (!("verdict" in frontmatter)) {
    const err = new Error(
      `parseable-frontmatter failure at ${path}: missing \`verdict:\` key. Available keys: ${Object.keys(frontmatter).join(", ") || "(none)"}`,
    );
    err.code = "VERDICT_MISSING";
    err.path = path;
    throw err;
  }
  if (expected && frontmatter.verdict !== expected) {
    throw new Error(
      `verdict mismatch at ${path}: expected \`${expected}\`, got \`${frontmatter.verdict}\``,
    );
  }
  return frontmatter.verdict;
}

/**
 * Assert the scaffolded target has the specific `/ithy-opsx:<name>` command
 * file — the resolution invariant. Throws a "skill not resolved" error
 * naming the missing surface, matching the spec scenario.
 */
export async function assertIthyOpsxCommandResolves(targetDir, name) {
  const path = join(targetDir, ".claude", "commands", "ithy-opsx", `${name}.md`);
  if (!existsSync(path)) {
    // Additional context: list what IS present so the diagnosis is one glance.
    const dir = join(targetDir, ".claude", "commands", "ithy-opsx");
    let listing = "(directory missing)";
    try {
      const entries = await readdir(dir);
      listing = entries.join(", ") || "(empty)";
    } catch {
      // dir itself missing
    }
    const err = new Error(
      `skill not resolved: /ithy-opsx:${name} — expected file at ${path} but it does not exist. .claude/commands/ithy-opsx/ contains: ${listing}`,
    );
    err.code = "SKILL_UNRESOLVED";
    err.skill = name;
    err.path = path;
    throw err;
  }
  return path;
}

/** Assert the scaffolded target has the backing `ithy-opsx-<name>` skill directory. */
export async function assertIthyOpsxSkillResolves(targetDir, name) {
  const dir = join(targetDir, ".claude", "skills", `ithy-opsx-${name}`);
  if (!existsSync(dir)) {
    const err = new Error(
      `skill not resolved: ithy-opsx-${name} — expected directory at ${dir} but it does not exist`,
    );
    err.code = "SKILL_DIR_MISSING";
    err.skill = name;
    err.path = dir;
    throw err;
  }
  return dir;
}
