// Init handler for `openspec-ui init [dir]`. Pure JS (no tsx) so it runs
// directly via `npx openspec-ui init` once the package is published.
//
// The implementation is split:
//   - `runInit` is the pure orchestrator (filesystem effects via fs/promises)
//   - `walkTemplates`, `copyFile`, `updateGitignore` are individually testable
//
// Templates ship under <package_root>/templates/ and are resolved relative
// to this file via import.meta.url.

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
 * Append `.worktrees/` to .gitignore if (and only if) it is missing. Returns
 * one of: "appended", "already-present", "created", "skipped" (when disabled),
 * or "untouched" when the file existed but didn't need a change.
 */
export async function updateGitignore(projectRoot, { disabled = false } = {}) {
  if (disabled) return "skipped";
  const path = join(projectRoot, ".gitignore");
  if (!existsSync(path)) {
    await writeFile(path, `${WORKTREES_LINE}\n`);
    return "created";
  }
  const raw = await readFile(path, "utf8");
  const hasLine = raw.split(/\r?\n/).some((line) => line.trim() === WORKTREES_LINE);
  if (hasLine) return "already-present";
  const sep = raw.endsWith("\n") ? "" : "\n";
  await writeFile(path, `${raw}${sep}${WORKTREES_LINE}\n`);
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
  log = console.log,
} = {}) {
  const target = resolve(targetDir ?? process.cwd());

  // Preflight: target exists?
  try {
    const s = await stat(target);
    if (!s.isDirectory()) throw new Error("not a directory");
  } catch {
    return {
      ok: false,
      exitCode: 2,
      reason: `Target directory does not exist: ${target}`,
    };
  }

  // Preflight: git repo?
  if (!(await isGitRepo(target))) {
    return {
      ok: false,
      exitCode: 2,
      reason: `${target} is not a git repository. Run \`git init\` first — OpenSpec UI's agent runner needs a git working tree.`,
    };
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
    log("  openspec-ui      # start the dashboard at http://localhost:4321");
  }

  return {
    ok: true,
    exitCode: 0,
    target,
    actions,
    gitignoreResult,
    summary: { created, overwritten, skipped },
    openspecMissing,
  };
}
