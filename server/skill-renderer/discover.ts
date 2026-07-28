// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Discover skill sources under `ithyno/skills/<name>/`.
 *
 * Each subdirectory containing `manifest.yaml` + `SKILL.md` becomes one
 * `SkillSource`. The manifest is parsed as YAML; validation against the
 * JSON schema happens in a separate pass (test / linter) so discovery
 * stays cheap.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SkillManifest, SkillSource } from "./types.js";

export async function discoverSkillSources(sourcesDir: string): Promise<SkillSource[]> {
  const out: SkillSource[] = [];
  let entries: string[];
  try {
    entries = await readdir(sourcesDir);
  } catch {
    return out;
  }
  for (const entry of entries.sort()) {
    const dir = join(sourcesDir, entry);
    if (!(await stat(dir)).isDirectory()) continue;
    const manifestPath = join(dir, "manifest.yaml");
    const skillMdPath = join(dir, "SKILL.md");
    let manifestRaw: string;
    let body: string;
    try {
      manifestRaw = await readFile(manifestPath, "utf-8");
      body = await readFile(skillMdPath, "utf-8");
    } catch {
      // Missing manifest.yaml or SKILL.md → not a complete skill; skip.
      continue;
    }
    const manifest = parseYaml(manifestRaw) as SkillManifest;
    if (!manifest || typeof manifest !== "object") continue;
    if (manifest.name !== entry) {
      throw new Error(
        `Skill manifest name mismatch at ${manifestPath}: manifest.name=${JSON.stringify(manifest.name)} but directory is ${JSON.stringify(entry)}`,
      );
    }
    out.push({ id: entry, sourceDir: dir, manifest, body });
  }
  return out;
}
