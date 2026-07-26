// SPDX-License-Identifier: GPL-3.0-or-later
// Scaffolded-target fixture generator for skill-e2e.
//
// Creates a fresh mkdtemp() directory, runs runInit() against it (the same
// entry point `ithyno init` uses), and seeds an initial commit so a default
// branch exists to merge into. Reused per flow — each flow gets its own
// scaffolded target so state does not leak between flows (D3).
//
// The fixture is regenerated per invocation on purpose (D6): a checked-in
// fixture would drift against templates/ and bin/init.js — the very things
// being tested. runInit() is ~1s (measured by add-init-scaffold-smoke-test).

import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { runInit } from "../../bin/init.js";
import { info } from "./log.mjs";

const execFile = promisify(execFileCb);

// Harness git identity — does NOT inherit developer's global config, so the
// harness can be run on any machine (including CI) without spurious
// `Please tell me who you are` failures. Documented in design.md Risks.
const HARNESS_GIT_USER = "ithyno-skill-e2e";
const HARNESS_GIT_EMAIL = "skill-e2e@ithyno.invalid";

/**
 * Create a fresh scaffolded target directory.
 *
 * @param {object} opts
 * @param {boolean} [opts.keepTmp=false] — if true, cleanup() is a no-op and
 *   the temp dir is left on disk for post-mortem inspection.
 * @param {string} [opts.label=""] — folder-name suffix for easier grepping
 *   (e.g. "flow-a", "flow-b").
 * @returns {Promise<{targetDir: string, cleanup: () => Promise<void>}>}
 */
export async function createScaffoldedTarget({ keepTmp = false, label = "" } = {}) {
  const prefix = label ? `ithyno-e2e-${label}-` : "ithyno-e2e-";
  const targetDir = await mkdtemp(join(tmpdir(), prefix));
  info(`fixture: mkdtemp ${targetDir}`);

  // runInit does its own preflight (git repo check with autoGitInit).
  const result = await runInit({
    targetDir,
    autoGitInit: true,
    quiet: true,
  });
  if (!result.ok) {
    throw new Error(`runInit failed against ${targetDir}: ${result.reason}`);
  }

  // Seed an initial commit so a default branch exists. Without this, `git
  // worktree add HEAD` fails because HEAD does not resolve.
  await gitInTarget(targetDir, ["add", "-A"]);
  await gitInTarget(targetDir, [
    "commit",
    "--allow-empty",
    "-m",
    "init: ithyno scaffold",
  ]);
  info(`fixture: initial commit landed in ${targetDir}`);

  // Ensure a stable default branch name — some git configs default to
  // `master`, others to `main`. Coerce to `main` so downstream flows can
  // reference it without probing.
  const currentBranch = (
    await gitInTarget(targetDir, ["rev-parse", "--abbrev-ref", "HEAD"])
  ).trim();
  if (currentBranch !== "main") {
    await gitInTarget(targetDir, ["branch", "-M", "main"]);
    info(`fixture: renamed default branch ${currentBranch} → main`);
  }

  const cleanup = async () => {
    if (keepTmp) {
      info(`fixture: --keep-tmp, leaving ${targetDir} on disk`);
      return;
    }
    try {
      await rm(targetDir, { recursive: true, force: true });
      info(`fixture: cleaned up ${targetDir}`);
    } catch (err) {
      // Non-fatal — tmp cleanup on next OS purge.
      // eslint-disable-next-line no-console
      console.warn(
        `[skill-e2e] fixture cleanup failed for ${targetDir}: ${err.message}`,
      );
    }
  };

  return { targetDir, cleanup };
}

/**
 * Run `git <args>` inside the target with the harness git identity,
 * returning stdout as a string. Throws on non-zero exit.
 */
export async function gitInTarget(targetDir, args) {
  const identityArgs = [
    "-c",
    `user.name=${HARNESS_GIT_USER}`,
    "-c",
    `user.email=${HARNESS_GIT_EMAIL}`,
    ...args,
  ];
  const { stdout } = await execFile("git", identityArgs, { cwd: targetDir });
  return stdout;
}

/**
 * Seed an in-flight OpenSpec change directory inside the scaffolded target.
 * Skips the openspec CLI — writes the files directly, since the tests only
 * care that the structural contract holds, not that `openspec new` was
 * invoked. Simpler + no CLI dependency.
 *
 * @param {string} targetDir
 * @param {object} opts
 * @param {string} opts.id — change id (folder name)
 * @param {string} [opts.phase] — current phase to write into .openspec.yaml
 *   (default "proposed")
 * @param {string} [opts.capability="dashboard"] — capability name for the
 *   delta spec
 * @param {string} [opts.deltaKind="ADDED"] — one of ADDED / MODIFIED / REMOVED
 * @param {string} [opts.requirementName] — requirement name in the delta
 */
export async function seedInFlightChange(
  targetDir,
  {
    id,
    phase = "proposed",
    capability = "dashboard",
    deltaKind = "ADDED",
    requirementName = "Test requirement seeded by skill-e2e",
  },
) {
  const changeDir = join(targetDir, "openspec", "changes", id);
  await mkdir(changeDir, { recursive: true });
  await mkdir(join(changeDir, "specs", capability), { recursive: true });

  const proposal = `## Why

Fixture change seeded by skill-e2e harness for id \`${id}\`.

## What Changes

Adds a trivial requirement to \`${capability}\` for round-trip validation.

## Impact

- Modified specs: \`${capability}\`
`;

  const tasks = `# Tasks

## 1. Trivial

- [x] 1.1 Seed the fixture (already done by the harness).
`;

  // OpenSpec expects the ADDED delta format: `## ADDED Requirements` header
  // followed by `### Requirement:` headings. Each requirement needs at least
  // one `#### Scenario:` bullet with GIVEN/WHEN/THEN.
  const specDelta = `## ${deltaKind} Requirements

### Requirement: ${requirementName}
The system SHALL satisfy the trivial fixture behavior for round-trip validation.

#### Scenario: Fixture round-trip
- **GIVEN** the fixture change \`${id}\` seeded by skill-e2e
- **WHEN** the harness runs a dispatch or archive flow against it
- **THEN** the flow completes without error
`;

  const openspecYaml = `phase: ${phase}\n`;

  await writeFile(join(changeDir, "proposal.md"), proposal);
  await writeFile(join(changeDir, "tasks.md"), tasks);
  await writeFile(join(changeDir, "specs", capability, "spec.md"), specDelta);
  await writeFile(join(changeDir, ".openspec.yaml"), openspecYaml);

  return changeDir;
}

/**
 * Seed a completed / archived change in the target's archive directory.
 * Used by Flow C (revert) to have a Case α target to point at.
 */
export async function seedArchivedChange(
  targetDir,
  { id, date = new Date().toISOString().slice(0, 10), capability = "dashboard" },
) {
  const archiveName = `${date}-${id}`;
  const archiveDir = join(
    targetDir,
    "openspec",
    "changes",
    "archive",
    archiveName,
  );
  await mkdir(archiveDir, { recursive: true });
  await mkdir(join(archiveDir, "specs", capability), { recursive: true });

  const proposal = `## Why

Archived fixture change seeded by skill-e2e for revert-flow validation.

## What Changes

Adds a trivial requirement that a subsequent revert change will remove.

## Impact

- Modified specs: \`${capability}\`
`;

  const specDelta = `## ADDED Requirements

### Requirement: Fixture requirement to be reverted
The system SHALL satisfy the trivial reverted-target behavior.

#### Scenario: Reverted-target smoke
- **GIVEN** the archived fixture change \`${id}\`
- **WHEN** a revert change targets this archive
- **THEN** the archive proposal gains a REVERTED annotation
`;

  await writeFile(join(archiveDir, "proposal.md"), proposal);
  await writeFile(join(archiveDir, "specs", capability, "spec.md"), specDelta);

  // Also seed the current spec so the revert has something to remove.
  const currentSpecPath = join(
    targetDir,
    "openspec",
    "specs",
    capability,
    "spec.md",
  );
  const currentSpec = existsSync(currentSpecPath)
    ? await readFile(currentSpecPath, "utf8")
    : `# ${capability} Specification\n\n## Requirements\n\n`;
  const requirementBlock = `### Requirement: Fixture requirement to be reverted
The system SHALL satisfy the trivial reverted-target behavior.

#### Scenario: Reverted-target smoke
- **WHEN** exercised
- **THEN** it passes
`;
  await mkdir(join(targetDir, "openspec", "specs", capability), {
    recursive: true,
  });
  await writeFile(
    currentSpecPath,
    currentSpec.trimEnd() + "\n\n" + requirementBlock + "\n",
  );

  return archiveDir;
}

/**
 * Patch agents.yaml in the scaffolded target — sets maxReworkRounds so the
 * code ↔ review loop converges in one iteration (per design.md Risks). If
 * the file was scaffolded from the .tmpl and still contains {{...}}
 * placeholders, replace MANAGER_COMMAND with "claude" as a sensible default.
 */
export async function patchAgentsYaml(
  targetDir,
  { maxReworkRounds = 1, managerCommand = "claude" } = {},
) {
  const path = join(targetDir, "agents.yaml");
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    // Init writes agents.yaml.tmpl → agents.yaml with placeholder substitution.
    // If neither exists, fall back to reading the .tmpl and stripping placeholders.
    const tmpl = await readFile(join(targetDir, "agents.yaml.tmpl"), "utf8");
    content = tmpl;
  }
  content = content.replace(/\{\{MANAGER_COMMAND\}\}/g, managerCommand);
  if (!/^maxReworkRounds:/m.test(content)) {
    content = `maxReworkRounds: ${maxReworkRounds}\n` + content;
  } else {
    content = content.replace(
      /^maxReworkRounds:.*$/m,
      `maxReworkRounds: ${maxReworkRounds}`,
    );
  }
  await writeFile(path, content);
  return path;
}
