#!/usr/bin/env node
// Scans ithyno/skills/**/SKILL.md for <capability:*> tokens and rejects
// any not in the v1 vocabulary (docs/skill-capabilities.md).
//
// Also invocable as a vitest via install-skills.test.ts.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const KNOWN_TOKENS = new Set(["subagent_spawn", "file_write", "bash"]);

const TOKEN_RE = /<capability:([a-z_][a-z0-9_]*)>/g;

export async function lintSkillsDir(skillsDir) {
  const offenders = [];
  for (const skillId of await readdir(skillsDir)) {
    const skillPath = join(skillsDir, skillId);
    if (!(await stat(skillPath)).isDirectory()) continue;
    const skillMd = join(skillPath, "SKILL.md");
    let content;
    try {
      content = await readFile(skillMd, "utf-8");
    } catch {
      continue; // no SKILL.md — probably a partial scaffold; skip.
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(TOKEN_RE)) {
        const token = match[1];
        if (!KNOWN_TOKENS.has(token)) {
          offenders.push({
            skill: skillId,
            file: skillMd,
            line: i + 1,
            token,
            context: lines[i].trim().slice(0, 100),
          });
        }
      }
    }
  }
  return offenders;
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const skillsDir = join(REPO, "ithyno", "skills");
  const offenders = await lintSkillsDir(skillsDir);
  if (offenders.length === 0) {
    console.log("skills lint: 0 offenders (known tokens:", [...KNOWN_TOKENS].join(", ") + ")");
    process.exit(0);
  }
  console.error(`skills lint: ${offenders.length} unknown capability token(s):`);
  for (const o of offenders) {
    console.error(`  ${o.file}:${o.line}  <capability:${o.token}>`);
    console.error(`    ${o.context}`);
  }
  console.error(`\nKnown tokens: ${[...KNOWN_TOKENS].join(", ")}`);
  console.error("To add a new token, update docs/skill-capabilities.md + schemas/skill-manifest.schema.json + scripts/lint-skill-tokens.mjs (KNOWN_TOKENS) + each renderer.");
  process.exit(1);
}
