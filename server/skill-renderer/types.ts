// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Types shared across the cross-CLI skill installer
 * (generalize-skills-cross-cli).
 *
 * A `SkillSource` is one skill directory under `ithyno/skills/<name>/`
 * (parsed manifest + raw SKILL.md body). A `Renderer` turns one source
 * into `RenderedFile[]` for its target CLI. `installSkills()` composes
 * discovery + rendering + writing.
 */
export type CliId =
  | "claude"
  | "codex"
  | "antigravity"
  | "cursor"
  | "gemini"
  | "copilot"
  | "opencode";

export const KNOWN_CLIS: readonly CliId[] = [
  "claude",
  "codex",
  "antigravity",
  "cursor",
  "gemini",
  "copilot",
  "opencode",
];

/** Capability tokens the v1 vocabulary understands. */
export type Capability = "subagent_spawn" | "file_write" | "bash";

export interface SkillManifest {
  name: string;
  namespace: string;
  command: string;
  description: string;
  supports: CliId[];
  capabilities_required: Capability[];
  per_cli?: Record<string, Record<string, unknown>>;
}

export interface SkillSource {
  /** Skill id — must match directory name. */
  id: string;
  /** Absolute path to the skill's source directory. */
  sourceDir: string;
  /** Parsed manifest.yaml. */
  manifest: SkillManifest;
  /** Raw SKILL.md body (portable markdown + capability tokens). */
  body: string;
}

/** How the installer should treat this generated file. */
export type WriteMode =
  /** Create-or-overwrite as a whole file. */
  | "create"
  /**
   * Merge into an existing file at `path` using delimited fragments
   * (e.g. Copilot's `.github/copilot-instructions.md`). Renderer is
   * responsible for stable delimiters — the installer wraps
   * `content` in a fragment block keyed by `fragmentKey`.
   */
  | "fragment-merge";

export interface RenderedFile {
  /** Path relative to project root. */
  path: string;
  content: string;
  mode: WriteMode;
  /** Only when mode === "fragment-merge". Delimits this skill's block. */
  fragmentKey?: string;
}

export interface RenderContext {
  /** The project root the installer will write into. */
  projectRoot: string;
  /** The CLI this renderer is targeting. */
  cli: CliId;
}

export interface Renderer {
  /** CLI this renderer emits for. Must match one of KNOWN_CLIS. */
  cli: CliId;
  /**
   * Render one source into zero or more files. Returning [] is legal
   * (e.g., the CLI can't satisfy a required capability — soft-skip
   * with a log line at the caller).
   */
  render(source: SkillSource, ctx: RenderContext): RenderedFile[];
}

export interface InstallOptions {
  projectRoot: string;
  /** CLIs to install for. Others are skipped entirely. */
  selectedClis: CliId[];
  /** Absolute path to the ithyno/skills/ directory to install from. */
  sourcesDir: string;
  /** When true, compute the plan but do not write. */
  dryRun?: boolean;
  /** When true, log per-file diffs against on-disk state. */
  diff?: boolean;
}

export interface InstallResult {
  /**
   * Files the installer wrote or would write. Each entry carries UTF-8
   * `bytes` (not UTF-16 code units). Under `dryRun + diff`, entries for
   * paths whose content differs from disk include a non-empty `diff`
   * string; entries without `diff` are "would create" or "byte-identical
   * no-op." Consumers wanting a hard status discriminant (created /
   * updated / unchanged) are the domain of the wire-into-init follow-up.
   */
  written: Array<{ cli: CliId; path: string; bytes: number; diff?: string }>;
  skipped: Array<{ cli: CliId; skill: string; reason: string }>;
  errors: Array<{ cli: CliId; skill?: string; message: string }>;
  /**
   * One entry per CLI whose install triggered a legacy-directory
   * migration. Emitted regardless of whether files actually moved —
   * an empty `moved`/`skipped` pair distinguishes "ran and found
   * nothing" from "did not run for this CLI." Currently only the
   * antigravity CLI has a migration (legacy `.agent/workflows/` →
   * `.agents/workflows/` — openspec's own antigravity adapter still
   * writes to the stale `.agent/`).
   */
  migrations: Array<{
    cli: CliId;
    moved: string[];
    skipped: Array<{ path: string; reason: string }>;
  }>;
}
