// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Cross-CLI skill installer (generalize-skills-cross-cli).
 *
 * Discovers universal skill sources under `ithyno/skills/`, runs the
 * per-CLI renderer for each user-selected CLI, and writes the emitted
 * files under `<projectRoot>/`.
 *
 * v1 scope: `claude` renderer only. Other CLIs (codex, antigravity,
 * cursor, gemini, copilot, opencode) are deferred to follow-up changes
 * per the propose's rollout plan.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { discoverSkillSourcesDetailed } from "./discover.js";
import { copyClaudeIthyOpsxCommandsToAgents, migrateLegacyAntigravityDir } from "./migrate-agy.js";
import { getRenderer, knownRendererClis } from "./renderers/index.js";
import type { CliId, InstallOptions, InstallResult, SkillSource } from "./types.js";
export type { CliId, InstallOptions, InstallResult, SkillSource } from "./types.js";
export { KNOWN_CLIS } from "./types.js";
export { discoverSkillSources, discoverSkillSourcesDetailed } from "./discover.js";
export { knownRendererClis, getRenderer, mapDoctorCliToRendererCli } from "./renderers/index.js";

function supportsSkill(source: SkillSource, cli: CliId): boolean {
  return source.manifest.supports.includes(cli);
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

export async function installSkills(opts: InstallOptions): Promise<InstallResult> {
  const result: InstallResult = { written: [], skipped: [], errors: [], migrations: [] };

  // Per-CLI legacy-path migrations run BEFORE the render loop so that
  // any files rescued from the wrong dir land at the correct target
  // before the renderer's own writes; conflict-detection in the
  // migration then correctly sees "target absent" vs "target present."
  // Currently only antigravity has a migration.
  if (opts.selectedClis.includes("antigravity")) {
    // MOVE: legacy `.agent/workflows/*.md` → `.agents/workflows/`
    try {
      const migration = await migrateLegacyAntigravityDir(opts.projectRoot, {
        dryRun: opts.dryRun,
      });
      result.migrations.push({ cli: "antigravity", kind: "move", ...migration });
    } catch (err) {
      result.errors.push({
        cli: "antigravity",
        message: `migration failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // COPY: `.claude/commands/ithy-opsx/*.md` → `.agents/workflows/ithy-opsx/`
    // Non-destructive — source .claude/ preserved for Claude users.
    // Runs BEFORE the render loop so a same-run renderer write at the
    // target correctly takes precedence via target-exists skip.
    try {
      const copy = await copyClaudeIthyOpsxCommandsToAgents(opts.projectRoot, {
        dryRun: opts.dryRun,
      });
      result.migrations.push({ cli: "antigravity", kind: "copy", ...copy });
    } catch (err) {
      result.errors.push({
        cli: "antigravity",
        message: `claude-commands copy failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Discover with per-entry error routing (one bad skill directory
  // does NOT block installing every healthy one).
  const { sources, errors: discoverErrors } = await discoverSkillSourcesDetailed(opts.sourcesDir);
  for (const de of discoverErrors) {
    result.errors.push({
      // Discovery errors are not tied to a specific CLI — attribute
      // to the first selected CLI so structured consumers still see
      // them; the `skill` field pinpoints the broken source.
      cli: opts.selectedClis[0] ?? ("claude" as CliId),
      skill: de.skill,
      message: `discover: ${de.message}`,
    });
  }

  for (const cli of opts.selectedClis) {
    const renderer = getRenderer(cli);
    if (!renderer) {
      result.errors.push({
        cli,
        message: `no renderer registered for CLI "${cli}" (available: ${knownRendererClis().join(", ")})`,
      });
      continue;
    }
    for (const source of sources) {
      if (!supportsSkill(source, cli)) {
        result.skipped.push({
          cli,
          skill: source.id,
          reason: `manifest.supports does not include "${cli}"`,
        });
        continue;
      }
      let files;
      try {
        files = renderer.render(source, { projectRoot: opts.projectRoot, cli });
      } catch (err) {
        result.errors.push({
          cli,
          skill: source.id,
          message: `renderer threw: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }
      for (const file of files) {
        const abs = join(opts.projectRoot, file.path);
        if (file.mode !== "create") {
          result.errors.push({
            cli,
            skill: source.id,
            message: `write mode "${file.mode}" not yet supported in v1 installer (deferred to fragment-merge follow-up)`,
          });
          continue;
        }
        const contentBytes = utf8Bytes(file.content);
        if (opts.dryRun) {
          const existing = await readIfExists(abs);
          if (opts.diff && existing !== null && existing !== file.content) {
            // Diff surfacing: report to written with a `diff` note
            // rather than result.errors (a pending update is not an
            // error). Consumers gating on `errors.length === 0`
            // should stay clean under dry-run + diff.
            result.written.push({
              cli,
              path: file.path,
              bytes: contentBytes,
              diff: `would update: ${utf8Bytes(existing)} → ${contentBytes} bytes`,
            });
          } else {
            result.written.push({ cli, path: file.path, bytes: contentBytes });
          }
          continue;
        }
        // Byte-identical no-op: skip mtime touch.
        const existing = await readIfExists(abs);
        if (existing === file.content) {
          result.written.push({ cli, path: file.path, bytes: contentBytes });
          continue;
        }
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, file.content, "utf-8");
        result.written.push({ cli, path: file.path, bytes: contentBytes });
      }
    }
  }

  return result;
}
