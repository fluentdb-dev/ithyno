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
import { discoverSkillSources } from "./discover.js";
import { getRenderer } from "./renderers/index.js";
import type { CliId, InstallOptions, InstallResult, SkillSource } from "./types.js";
export type { CliId, InstallOptions, InstallResult, SkillSource } from "./types.js";
export { KNOWN_CLIS } from "./types.js";
export { discoverSkillSources } from "./discover.js";
export { knownRendererClis, getRenderer } from "./renderers/index.js";

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

export async function installSkills(opts: InstallOptions): Promise<InstallResult> {
  const result: InstallResult = { written: [], skipped: [], errors: [] };
  const sources = await discoverSkillSources(opts.sourcesDir);

  for (const cli of opts.selectedClis) {
    const renderer = getRenderer(cli);
    if (!renderer) {
      result.errors.push({
        cli,
        message: `no renderer registered for CLI "${cli}" (v1 supports: ${["claude"].join(", ")})`,
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
        if (opts.dryRun) {
          const existing = await readIfExists(abs);
          if (opts.diff && existing !== null && existing !== file.content) {
            result.errors.push({
              cli,
              skill: source.id,
              message: `[dry-run diff] ${file.path} differs from on-disk content (${existing.length} → ${file.content.length} bytes)`,
            });
          }
          result.written.push({ cli, path: file.path, bytes: file.content.length });
          continue;
        }
        // Byte-identical no-op: skip mtime touch.
        const existing = await readIfExists(abs);
        if (existing === file.content) {
          result.written.push({ cli, path: file.path, bytes: file.content.length });
          continue;
        }
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, file.content, "utf-8");
        result.written.push({ cli, path: file.path, bytes: file.content.length });
      }
    }
  }

  return result;
}
