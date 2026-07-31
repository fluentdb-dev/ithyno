// SPDX-License-Identifier: GPL-3.0-or-later
// Init handler for `ithyno init [dir]`. Pure JS (no tsx) so it runs
// directly via `npx ithyno init` once the package is published.
//
// The implementation is split:
//   - `runInit` is the pure orchestrator (filesystem effects via fs/promises)
//   - `walkTemplates`, `copyFile`, `updateGitignore` are individually testable
//
// Templates ship under <package_root>/templates/ and are resolved relative
// to this file via import.meta.url. Notable scaffold targets: `openspec-flow`
// (the project's spec-driven workflow skill) and every `ithy-opsx-*` skill +
// `commands/ithy-opsx/*` command backing the `/ithy-opsx:*` slash surface —
// ithyno's own commands travel with Init rather than being installed globally
// (see distribute-ithy-opsx-via-init-templates).

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "..");
const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");

const WORKTREES_LINE = ".worktrees/";
const ITHYNO_LINE = ".ithyno/";
const REQUIRED_LINES = [WORKTREES_LINE, ITHYNO_LINE];

/**
 * Recursively walk a directory and yield every file's path **relative** to
 * the root. Empty `.gitkeep` files are preserved so target directories survive
 * `git add`.
 */
export async function walkTemplates(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.isFile()) {
        out.push(relative(rootDir, abs).split(sep).join(sep));
      }
    }
  }
  await walk(rootDir);
  return out.sort();
}

/**
 * Copy one template file into the target. Returns the action taken:
 *   - "create"   : file did not exist, written
 *   - "skip"     : file existed, --force not set
 *   - "overwrite": file existed and --force set, replaced
 */
export async function copyFile({ srcAbs, destAbs, force }) {
  if (existsSync(destAbs) && !force) return "skip";
  await mkdir(dirname(destAbs), { recursive: true });
  const content = await readFile(srcAbs);
  await writeFile(destAbs, content);
  return existsSync(destAbs) && force ? "overwrite" : "create";
}

/**
 * Ensure `.worktrees/` and `.ithyno/` are both present in .gitignore.
 * Per-line append-only-if-missing — adding one line doesn't remove
 * or reorder the other. Landed by pty-startup-uses-project-session-id.
 *
 * Returns one of:
 * - "created"        — file didn't exist, wrote both lines
 * - "appended"       — file existed, added at least one missing line
 * - "already-present"— file existed with both lines
 * - "skipped"        — `disabled: true`
 */
export async function updateGitignore(projectRoot, { disabled = false } = {}) {
  if (disabled) return "skipped";
  const path = join(projectRoot, ".gitignore");
  if (!existsSync(path)) {
    await writeFile(path, REQUIRED_LINES.map((l) => `${l}\n`).join(""));
    return "created";
  }
  const raw = await readFile(path, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const missing = REQUIRED_LINES.filter((req) => !lines.includes(req));
  if (missing.length === 0) return "already-present";
  const sep = raw.endsWith("\n") ? "" : "\n";
  await writeFile(path, `${raw}${sep}${missing.map((l) => `${l}\n`).join("")}`);
  return "appended";
}

async function isGitRepo(dir) {
  try {
    await execFile("git", ["rev-parse", "--git-dir"], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

function hasOpenspec(dir) {
  return existsSync(join(dir, "openspec", "config.yaml"));
}

/**
 * Main orchestrator. Returns a structured report so callers (CLI + tests) can
 * format or assert on it.
 */
export async function runInit({
  targetDir,
  force = false,
  skipGitignore = false,
  quiet = false,
  autoCreateDir = false,
  autoGitInit = false,
  log = console.log,
  // Manager CLI the user picked in the onboarding picker. Reserved
  // for wiring the per-CLI skill renderer (task 3 in
  // scaffold-ithy-opsx-skills-per-cli). Undefined → renderer step
  // defaults to `"claude"` at the invocation site so the bare
  // `bin/ithyno init <target>` CLI workflow keeps working without a
  // --manager flag. Accepted here so the option flows through all
  // callers (server /api/init, /api/init/stream, runNewProjectChain)
  // without further signature churn when the renderer step lands.
  managerCli = undefined,
} = {}) {
  // Currently unused at the walkTemplates level — task 3 will invoke
  // `renderSkillsForCli(managerCli, target)` after the copy step.
  // Reference the arg so lint doesn't flag it as unused; the renderer
  // wiring in task 3 replaces this with a real call.
  void managerCli;
  const target = resolve(targetDir ?? process.cwd());

  // Preflight: target exists? (with optional autoCreateDir recovery)
  let targetExists = false;
  try {
    const s = await stat(target);
    if (!s.isDirectory()) throw new Error("not a directory");
    targetExists = true;
  } catch {
    // fall through
  }
  if (!targetExists) {
    if (!autoCreateDir) {
      return {
        ok: false,
        exitCode: 2,
        reason: `Target directory does not exist: ${target}`,
      };
    }
    await mkdir(target, { recursive: true });
  }

  // Preflight: git repo? (with optional autoGitInit recovery)
  let gitInitPerformed = false;
  if (!(await isGitRepo(target))) {
    if (!autoGitInit) {
      return {
        ok: false,
        exitCode: 2,
        reason: `${target} is not a git repository. Run \`git init\` first — ithyno's agent runner needs a git working tree.`,
      };
    }
    try {
      await execFile("git", ["init"], { cwd: target });
      gitInitPerformed = true;
    } catch (err) {
      return {
        ok: false,
        exitCode: 2,
        reason: `git init failed in ${target}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Preflight (non-fatal): openspec/ initialized?
  const openspecMissing = !hasOpenspec(target);

  // Walk templates and copy.
  const templates = await walkTemplates(TEMPLATES_DIR);
  const actions = [];
  for (const relPath of templates) {
    const srcAbs = join(TEMPLATES_DIR, relPath);
    const destAbs = join(target, relPath);
    const existed = existsSync(destAbs);
    const action = await copyFile({ srcAbs, destAbs, force });
    actions.push({ path: relPath, action });
    if (!quiet) {
      const prefix =
        action === "skip" ? "skip:     " :
        action === "overwrite" ? "overwrite:" :
        "create:   ";
      log(`${prefix} ${relPath}${existed && action === "skip" ? "" : ""}`);
    }
  }

  // .gitignore handling.
  const gitignoreResult = await updateGitignore(target, { disabled: skipGitignore });
  if (!quiet) {
    if (gitignoreResult === "created") log("create:    .gitignore (with .worktrees/)");
    else if (gitignoreResult === "appended") log("update:    .gitignore (+ .worktrees/)");
    else if (gitignoreResult === "already-present") log("skip:      .gitignore (.worktrees/ already present)");
    else if (gitignoreResult === "skipped") log("skip:      .gitignore (--no-gitignore)");
  }

  // Summary.
  const created = actions.filter((a) => a.action === "create").length;
  const overwritten = actions.filter((a) => a.action === "overwrite").length;
  const skipped = actions.filter((a) => a.action === "skip").length;
  if (!quiet) {
    log("");
    log(`Created ${created}${overwritten ? ` · Overwritten ${overwritten}` : ""} · Skipped ${skipped}.`);
    log("");
    log("Next steps:");
    if (openspecMissing) {
      log("  # OpenSpec is not yet initialized in this project:");
      log("  npx -y -p @fission-ai/openspec@latest openspec init . --tools claude");
      log("");
    }
    log("  ithyno            # start the dashboard at http://localhost:4321");
  }

  return {
    ok: true,
    exitCode: 0,
    target,
    gitInitPerformed,
    actions,
    gitignoreResult,
    summary: { created, overwritten, skipped },
    openspecMissing,
  };
}
