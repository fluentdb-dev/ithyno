// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Discover skill sources under `ithyno/skills/<name>/`.
 *
 * Each subdirectory containing `manifest.yaml` + `SKILL.md` becomes one
 * `SkillSource`. The manifest is parsed as YAML; validation against the
 * JSON schema happens in a separate pass (test / linter) so discovery
 * stays cheap.
 *
 * Failures on individual entries (bad symlink, malformed YAML,
 * manifest.name mismatch) are surfaced per-entry in `errors` so one
 * broken skill directory does not block installing every healthy one.
 * Matches the design intent that renderer / installer failures are
 * per-CLI soft-fails (server/skill-renderer/index.ts).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SkillManifest, SkillSource } from "./types.js";

export interface DiscoverError {
  skill: string;
  message: string;
}

export interface DiscoverResult {
  sources: SkillSource[];
  errors: DiscoverError[];
}

export async function discoverSkillSources(sourcesDir: string): Promise<SkillSource[]> {
  return (await discoverSkillSourcesDetailed(sourcesDir)).sources;
}

export async function discoverSkillSourcesDetailed(sourcesDir: string): Promise<DiscoverResult> {
  const sources: SkillSource[] = [];
  const errors: DiscoverError[] = [];

  let entries: string[];
  try {
    entries = await readdir(sourcesDir);
  } catch {
    return { sources, errors };
  }

  for (const entry of entries.sort()) {
    const dir = join(sourcesDir, entry);

    let isDir = false;
    try {
      isDir = (await stat(dir)).isDirectory();
    } catch (err) {
      errors.push({
        skill: entry,
        message: `stat failed: ${errMessage(err)}`,
      });
      continue;
    }
    if (!isDir) continue;

    const manifestPath = join(dir, "manifest.yaml");
    const skillMdPath = join(dir, "SKILL.md");

    let manifestRaw: string;
    let body: string;
    try {
      manifestRaw = await readFile(manifestPath, "utf-8");
      body = await readFile(skillMdPath, "utf-8");
    } catch {
      // Missing manifest.yaml or SKILL.md → not a complete skill; silent
      // skip (partial scaffold or unrelated dir).
      continue;
    }

    let manifest: SkillManifest;
    try {
      manifest = parseYaml(manifestRaw) as SkillManifest;
    } catch (err) {
      errors.push({
        skill: entry,
        message: `manifest.yaml parse failed: ${errMessage(err)}`,
      });
      continue;
    }

    if (!manifest || typeof manifest !== "object") {
      errors.push({
        skill: entry,
        message: `manifest.yaml did not parse to an object`,
      });
      continue;
    }

    if (manifest.name !== entry) {
      errors.push({
        skill: entry,
        message: `manifest.name=${JSON.stringify(manifest.name)} does not match directory name ${JSON.stringify(entry)}`,
      });
      continue;
    }

    sources.push({ id: entry, sourceDir: dir, manifest, body });
  }

  return { sources, errors };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
