// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Surgical edit for the proposal's YAML frontmatter. Two entry points:
 *   - setExecutionInFrontmatter(source, mode) — insert/update the
 *     `execution: <mode>` line inside the existing frontmatter block, or
 *     prepend a minimal frontmatter block if none exists.
 *   - readFrontmatterBlock(source) — helper used by tests.
 *
 * The rewrite preserves every other line byte-for-byte, honoring the "no
 * whole-file re-serialization" principle we already apply to tasks.md.
 */

const FRONTMATTER_START = /^---\s*$/;
const FRONTMATTER_END = /^---\s*$/;
const EXECUTION_LINE = /^execution\s*:/;

export type ExecutionMode = "worktree" | "terminal";

/**
 * Insert or update `execution: <mode>` inside the source's frontmatter. If
 * the source has no frontmatter block, prepend a minimal one.
 */
export function setExecutionInFrontmatter(source: string, mode: ExecutionMode): string {
  const lines = source.split("\n");

  // No frontmatter: prepend a minimal block. Preserve the original body via
  // string concat so trailing bytes remain unchanged.
  if (!lines[0] || !FRONTMATTER_START.test(lines[0])) {
    return `---\nexecution: ${mode}\n---\n\n${source}`;
  }

  // Find the closing `---` line index. If missing, the frontmatter is
  // malformed — refuse to write and return the source untouched.
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_END.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end < 0) return source;

  // Scan the frontmatter body for an existing execution line.
  for (let i = 1; i < end; i++) {
    if (EXECUTION_LINE.test(lines[i])) {
      lines[i] = `execution: ${mode}`;
      return lines.join("\n");
    }
  }

  // Insert just before the closing `---`.
  lines.splice(end, 0, `execution: ${mode}`);
  return lines.join("\n");
}

/** Test helper — returns the raw frontmatter body between the `---` lines,
 *  or null when the source has no valid frontmatter block. */
export function readFrontmatterBlock(source: string): string | null {
  const lines = source.split("\n");
  if (!lines[0] || !FRONTMATTER_START.test(lines[0])) return null;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_END.test(lines[i])) {
      return lines.slice(1, i).join("\n");
    }
  }
  return null;
}
