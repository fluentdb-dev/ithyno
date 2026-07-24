// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Install / uninstall the bundled ithy-opsx Claude Code slash-commands
 * and skills into the user's home Claude directory. Cross-platform
 * (Mac / Linux / Windows).
 *
 * Landed by unify-ithyno-slash-command-surface.
 *
 * Distribution shape:
 *   Bundled source lives at `<bundle>/commands/ithy-opsx/*.md` and
 *   `<bundle>/skills/ithy-opsx-*\/**`. The bundle root resolves to
 *   `<process.resourcesPath>/app/.claude` under packaged Electron, or
 *   `<repo>/.claude` when running from source.
 *
 *   Install target is `<os.homedir()>/.claude/commands/ithy-opsx/`
 *   and `<os.homedir()>/.claude/skills/ithy-opsx-*\/`. Files are COPIED
 *   (not symlinked) so Windows works without admin / developer-mode.
 *
 * Version tracking:
 *   `~/.claude/.ithyno-install-manifest.json` records the installed
 *   ithyno version, per-file sha256, and any files the user has
 *   hand-modified. On subsequent startups the installer compares the
 *   manifest against the currently bundled version and only re-copies
 *   when they differ (or when the caller passes `force: true`). User-
 *   modified files (sha256 mismatch vs. manifest) are SKIPPED with a
 *   warning — never overwritten.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve as pathResolve, sep as pathSep } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManifestEntry = {
  /** POSIX-form relative path (e.g. "commands/ithy-opsx/apply.md"). */
  path: string;
  /** sha256 of the file at install / last-check time. */
  sha256: string;
  /** Present when the installer detected a user modification and skipped. */
  status?: "user-modified" | "conflict";
};

export type InstallManifest = {
  installedVersion: string;
  installedAt: string;
  files: ManifestEntry[];
};

export type InstallReport = {
  installed: number;
  updated: number;
  skipped: number;
  userModified: number;
  removed: number;
  errors: string[];
  manifest: InstallManifest;
};

export type UninstallReport = {
  removed: number;
  alreadyGone: number;
  errors: string[];
};

export type IthyOpsxDoctor = {
  installed: boolean;
  installedVersion: string | null;
  bundledVersion: string;
  commandCount: number;
  skillCount: number;
  userModifiedFiles: string[];
  installError: string | null;
};

// ---------------------------------------------------------------------------
// Path resolution — cross-platform
// ---------------------------------------------------------------------------

/**
 * Resolve the directory containing the bundled `.claude/` tree.
 *
 * Precedence:
 *   1. `ITHYNO_BUNDLED_SKILLS` env override (test hook, absolute path).
 *   2. Packaged Electron — `process.resourcesPath` present AND
 *      `<resourcesPath>/app/.claude` exists.
 *   3. Dev / npm install — walk up from this module's directory looking
 *      for a parent that contains both `package.json` and `.claude/`.
 *   4. Throw with a diagnostic listing the paths that were tried.
 */
export function resolveBundledSkillsRoot(): string {
  const envOverride = process.env.ITHYNO_BUNDLED_SKILLS;
  if (envOverride) {
    if (!existsSync(envOverride)) {
      throw new Error(
        `ITHYNO_BUNDLED_SKILLS points at a non-existent path: ${envOverride}`,
      );
    }
    return envOverride;
  }

  const rp = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (rp) {
    const packaged = join(rp, "app", ".claude");
    if (existsSync(packaged)) return packaged;
  }

  const tried: string[] = [];
  let cursor: string;
  try {
    cursor = dirname(fileURLToPath(import.meta.url));
  } catch {
    cursor = process.cwd();
  }
  while (true) {
    const candidatePkg = join(cursor, "package.json");
    const candidateClaude = join(cursor, ".claude");
    if (existsSync(candidatePkg) && existsSync(candidateClaude)) {
      return candidateClaude;
    }
    tried.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  throw new Error(
    `resolveBundledSkillsRoot: could not locate a directory containing both package.json and .claude/. ` +
      `Tried (walking up from module): ${tried.join(", ")}. ` +
      `resourcesPath=${rp ?? "<unset>"}.`,
  );
}

/** Resolve the user's Claude config root — `$HOME/.claude` (POSIX) or
 *  `%USERPROFILE%\.claude` (Windows). `os.homedir()` handles both. */
export function resolveUserClaudeRoot(): string {
  return join(homedir(), ".claude");
}

/** Manifest lives outside the commands/ and skills/ trees so Claude Code
 *  does not try to parse it. */
export function resolveManifestPath(): string {
  return join(resolveUserClaudeRoot(), ".ithyno-install-manifest.json");
}

// ---------------------------------------------------------------------------
// Manifest helpers
// ---------------------------------------------------------------------------

export function readManifest(): InstallManifest | null {
  const p = resolveManifestPath();
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as InstallManifest;
    if (
      typeof parsed.installedVersion !== "string" ||
      typeof parsed.installedAt !== "string" ||
      !Array.isArray(parsed.files)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeManifestAtomic(m: InstallManifest): Promise<void> {
  const p = resolveManifestPath();
  await mkdir(dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  await writeFile(tmp, JSON.stringify(m, null, 2), "utf8");
  await rename(tmp, p);
}

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function readSha256(path: string): string | null {
  try {
    const buf = readFileSync(path);
    return sha256Buffer(buf);
  } catch {
    return null;
  }
}

async function walkFiles(root: string, rel: string = ""): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const childRel = rel ? posixJoin(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(root, childRel)));
    } else if (entry.isFile()) {
      out.push(childRel);
    }
  }
  return out;
}

/** POSIX-form path join — always uses `/` on every platform for stable
 *  manifest keys and bundle-relative labels. Distinct from `path.join`. */
function posixJoin(...parts: string[]): string {
  return parts.filter(Boolean).join("/");
}

/** Convert a POSIX-form relative path to the native form for fs calls. */
function toNativePath(root: string, posixRel: string): string {
  return join(root, ...posixRel.split("/"));
}

// ---------------------------------------------------------------------------
// Bundle enumeration
// ---------------------------------------------------------------------------

function readBundledVersion(bundleRoot: string): string {
  let cursor = dirname(bundleRoot);
  while (true) {
    const pkgPath = join(cursor, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        /* fall through */
      }
    }
    const up = dirname(cursor);
    if (up === cursor) break;
    cursor = up;
  }
  return "0.0.0-unknown";
}

/** List every bundled file we install, as POSIX-form paths relative to the
 *  bundle root. Covers `commands/ithy-opsx/*.md` and `skills/ithy-opsx-*\/**`. */
async function listBundledFiles(bundleRoot: string): Promise<string[]> {
  const out: string[] = [];

  const cmdDir = join(bundleRoot, "commands", "ithy-opsx");
  if (existsSync(cmdDir)) {
    const files = await walkFiles(cmdDir);
    for (const f of files) out.push(posixJoin("commands", "ithy-opsx", f));
  }

  const skillsDir = join(bundleRoot, "skills");
  if (existsSync(skillsDir)) {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await readdir(skillsDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("ithy-opsx-")) continue;
      const files = await walkFiles(join(skillsDir, entry.name));
      for (const f of files) out.push(posixJoin("skills", entry.name, f));
    }
  }

  return out.sort();
}

// ---------------------------------------------------------------------------
// Installer
// ---------------------------------------------------------------------------

/**
 * Install (or update, or verify) the bundled ithy-opsx slash-commands
 * and skills into the user's Claude config.
 *
 * Idempotent: re-running at the same version is a no-op. Version bumps
 * overwrite unmodified files. User-modified files are preserved with a
 * warning. Files present in the old manifest but absent from the current
 * bundle are removed as part of the install (version-down cleanup).
 */
export async function installIthyOpsxSkills(
  opts: { force?: boolean } = {},
): Promise<InstallReport> {
  const errors: string[] = [];
  const bundleRoot = resolveBundledSkillsRoot();
  const userRoot = resolveUserClaudeRoot();
  const bundledVersion = readBundledVersion(bundleRoot);

  const oldManifest = readManifest();
  const bundledFiles = await listBundledFiles(bundleRoot);

  // Fast-path: same version + manifest complete + no force → no-op.
  if (
    !opts.force &&
    oldManifest &&
    oldManifest.installedVersion === bundledVersion
  ) {
    const complete = oldManifest.files.every((entry) =>
      existsSync(toNativePath(userRoot, entry.path)),
    );
    if (complete) {
      return {
        installed: 0,
        updated: 0,
        skipped: 0,
        userModified: oldManifest.files.filter((e) => e.status === "user-modified").length,
        removed: 0,
        errors,
        manifest: oldManifest,
      };
    }
  }

  const newEntries: ManifestEntry[] = [];
  let installed = 0;
  let updated = 0;
  let skipped = 0;
  let userModified = 0;

  const oldByPath = new Map<string, ManifestEntry>();
  if (oldManifest) {
    for (const e of oldManifest.files) oldByPath.set(e.path, e);
  }

  for (const rel of bundledFiles) {
    const src = toNativePath(bundleRoot, rel);
    const dst = toNativePath(userRoot, rel);
    let srcHash: string;
    try {
      srcHash = sha256Buffer(readFileSync(src));
    } catch (err) {
      errors.push(`read-src ${rel}: ${errorMessage(err)}`);
      continue;
    }

    let dstStat;
    try {
      dstStat = await stat(dst);
    } catch {
      dstStat = null;
    }

    if (dstStat && !dstStat.isFile()) {
      console.warn(`[install-skills] conflict: ${rel} exists at target as non-file`);
      newEntries.push({ path: rel, sha256: srcHash, status: "conflict" });
      skipped++;
      continue;
    }

    if (dstStat) {
      const dstHash = readSha256(dst);
      const prior = oldByPath.get(rel);
      const priorIsUserModified = prior?.status === "user-modified";
      const matchesManifest = prior && dstHash === prior.sha256;

      if (dstHash === srcHash && !priorIsUserModified) {
        newEntries.push({ path: rel, sha256: srcHash });
        continue;
      }

      if (matchesManifest) {
        try {
          await mkdir(dirname(dst), { recursive: true });
          await copyFile(src, dst);
          newEntries.push({ path: rel, sha256: srcHash });
          updated++;
        } catch (err) {
          errors.push(`update ${rel}: ${errorMessage(err)}`);
        }
      } else {
        console.warn(`[install-skills] skipped (user-modified): ${rel}`);
        newEntries.push({
          path: rel,
          sha256: dstHash ?? srcHash,
          status: "user-modified",
        });
        userModified++;
      }
      continue;
    }

    try {
      await mkdir(dirname(dst), { recursive: true });
      await copyFile(src, dst);
      newEntries.push({ path: rel, sha256: srcHash });
      installed++;
    } catch (err) {
      errors.push(`install ${rel}: ${errorMessage(err)}`);
    }
  }

  let removed = 0;
  const currentSet = new Set(bundledFiles);
  if (oldManifest) {
    for (const entry of oldManifest.files) {
      if (currentSet.has(entry.path)) continue;
      const target = toNativePath(userRoot, entry.path);
      try {
        if (existsSync(target)) {
          await rm(target);
          removed++;
        }
      } catch (err) {
        errors.push(`cleanup ${entry.path}: ${errorMessage(err)}`);
      }
    }
    await tryRemoveEmptyDirs(userRoot);
  }

  const manifest: InstallManifest = {
    installedVersion: bundledVersion,
    installedAt: new Date().toISOString(),
    files: newEntries,
  };
  try {
    await writeManifestAtomic(manifest);
  } catch (err) {
    errors.push(`manifest-write: ${errorMessage(err)}`);
  }

  return { installed, updated, skipped, userModified, removed, errors, manifest };
}

// ---------------------------------------------------------------------------
// Uninstaller
// ---------------------------------------------------------------------------

export async function uninstallIthyOpsxSkills(): Promise<UninstallReport> {
  const errors: string[] = [];
  const userRoot = resolveUserClaudeRoot();
  const manifest = readManifest();

  if (!manifest) {
    return { removed: 0, alreadyGone: 0, errors };
  }

  let removed = 0;
  let alreadyGone = 0;
  for (const entry of manifest.files) {
    const target = toNativePath(userRoot, entry.path);
    if (!existsSync(target)) {
      alreadyGone++;
      continue;
    }
    try {
      await rm(target);
      removed++;
    } catch (err) {
      errors.push(`remove ${entry.path}: ${errorMessage(err)}`);
    }
  }

  await tryRemoveEmptyDirs(userRoot);

  try {
    const mp = resolveManifestPath();
    if (existsSync(mp)) await rm(mp);
  } catch (err) {
    errors.push(`manifest-remove: ${errorMessage(err)}`);
  }

  return { removed, alreadyGone, errors };
}

async function tryRemoveEmptyDirs(userRoot: string): Promise<void> {
  const candidates: string[] = [];
  candidates.push(join(userRoot, "commands", "ithy-opsx"));
  const skillsDir = join(userRoot, "skills");
  if (existsSync(skillsDir)) {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await readdir(skillsDir, { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("ithy-opsx-")) {
        candidates.push(join(skillsDir, entry.name));
      }
    }
  }

  for (const dir of candidates) {
    await tryRmdirIfEmptyRecursive(dir);
  }
}

async function tryRmdirIfEmptyRecursive(dir: string): Promise<void> {
  if (!existsSync(dir)) return;
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      await tryRmdirIfEmptyRecursive(join(dir, e.name));
    }
  }
  try {
    const after = await readdir(dir);
    if (after.length === 0) await rmdir(dir);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Doctor helper — snapshot for /api/doctor
// ---------------------------------------------------------------------------

export async function checkIthyOpsxInstall(): Promise<IthyOpsxDoctor> {
  let bundleRoot: string;
  try {
    bundleRoot = resolveBundledSkillsRoot();
  } catch (err) {
    return {
      installed: false,
      installedVersion: null,
      bundledVersion: "0.0.0-unknown",
      commandCount: 0,
      skillCount: 0,
      userModifiedFiles: [],
      installError: errorMessage(err),
    };
  }

  const userRoot = resolveUserClaudeRoot();
  const bundledVersion = readBundledVersion(bundleRoot);
  const bundledFiles = await listBundledFiles(bundleRoot);
  const commandCount = bundledFiles.filter((p) => p.startsWith("commands/")).length;
  const skillCount = new Set(
    bundledFiles.filter((p) => p.startsWith("skills/")).map((p) => p.split("/")[1]),
  ).size;

  const manifest = readManifest();
  const userModifiedFiles = (manifest?.files ?? [])
    .filter((e) => e.status === "user-modified")
    .map((e) => e.path);

  const allPresent = bundledFiles.every((rel) =>
    existsSync(toNativePath(userRoot, rel)),
  );

  return {
    installed: !!manifest && allPresent,
    installedVersion: manifest?.installedVersion ?? null,
    bundledVersion,
    commandCount,
    skillCount,
    userModifiedFiles,
    installError: null,
  };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const NATIVE_PATH_SEP = pathSep;

export function resolveAbs(...segments: string[]): string {
  return pathResolve(...segments);
}
