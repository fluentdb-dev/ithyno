#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Verify that produced release artifacts ship `/ithy-opsx:*` skills and
// commands ONLY under `templates/.claude/…` — never as bare
// `.claude/commands/ithy-opsx/` or `.claude/skills/ithy-opsx-*/` entries.
//
// Runs three checks in order:
//   1. npm tarball shape (always) — `npm pack` on repoRoot, extract, walk.
//   2. Electron bundle shape (per bundle actually produced under
//      electron/dist/; skipped if none present).
//   3. Init-from-bundle smoke (one bundle, prefer mac-arm64) — shell out to
//      the packaged `bin/ithyno init <tmp>` and byte-compare the scaffold
//      against the source repo's `templates/.claude/…`.
//
// Invoked by `scripts/release-build.mjs` before the artifact summary, or
// directly via `npm run release:verify-bundle` when iterating on
// electron-builder config without paying the full release chain's cost.
//
// See openspec/changes/archive/…-add-bundle-verification-script/ (Phase B of
// the 2026-07-26 comprehensive skill test plan) for context; and
// `distribute-ithy-opsx-via-init-templates` for the contract this script
// enforces.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

// Contract this script enforces. Referenced verbatim in every failure
// message so a reader can grep the archived change in one step.
const CONTRACT = "distribute-ithy-opsx-via-init-templates";

function log(msg) {
  console.log(`[verify-bundle] ${msg}`);
}

function warn(msg) {
  console.warn(`[verify-bundle] WARN: ${msg}`);
}

/**
 * Recursively walk `dir` and return every file path relative to `dir`
 * using forward slashes.
 */
function walkFiles(dir) {
  const out = [];
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile()) {
        out.push(relative(dir, abs).split(sep).join("/"));
      }
    }
  }
  walk(dir);
  out.sort();
  return out;
}

/**
 * Apply the two invariants to a walked bundle: every ithy-opsx path must
 * live under `<prefix>templates/.claude/…`, and no bare
 * `<prefix>.claude/commands/ithy-opsx` or `<prefix>.claude/skills/ithy-opsx-`
 * paths may exist.
 *
 * `paths` is the array of forward-slash relative paths. `prefix` is the
 * leading fragment (e.g., `"package/"` for the tarball, `""` for an already-
 * rooted bundle). `artifactLabel` is the human name of the artifact for the
 * error message.
 */
function assertNoBareIthyOpsx(paths, prefix, artifactLabel) {
  const bareCmdRe = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.claude/commands/ithy-opsx`,
  );
  const bareSkillRe = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.claude/skills/ithy-opsx-`,
  );
  const templatesPrefix = `${prefix}templates/.claude/`;

  for (const p of paths) {
    if (p.includes("ithy-opsx")) {
      if (!p.startsWith(templatesPrefix)) {
        throw new Error(
          `${artifactLabel}: ithy-opsx path lives outside templates/.claude/\n` +
            `  offending path: ${p}\n` +
            `  expected prefix: ${templatesPrefix}\n` +
            `  contract violated: ${CONTRACT}`,
        );
      }
    }
    if (bareCmdRe.test(p) || bareSkillRe.test(p)) {
      throw new Error(
        `${artifactLabel}: bare .claude/ ithy-opsx entry found\n` +
          `  offending path: ${p}\n` +
          `  contract violated: ${CONTRACT}`,
      );
    }
  }
}

/**
 * Check #1: unpack the npm tarball and assert its shape.
 */
function assertTarballShape() {
  log("check 1/3: npm tarball shape");
  const stagingDir = mkdtempSync(join(tmpdir(), "verify-bundle-tarball-"));
  try {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const stdout = execFileSync(
      npmCmd,
      ["pack", "--pack-destination", stagingDir],
      { cwd: repoRoot, encoding: "utf8", shell: true },
    );
    // `npm pack` prints one .tgz filename per package to stdout; ours is a
    // single-package pack so the last non-empty line is the produced file.
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const tgzName = lines[lines.length - 1];
    if (!tgzName || !tgzName.endsWith(".tgz")) {
      throw new Error(
        `npm pack did not print a .tgz filename on its last stdout line\n` +
          `  stdout tail: ${JSON.stringify(lines.slice(-3))}`,
      );
    }
    const tgzPath = join(stagingDir, tgzName);
    if (!existsSync(tgzPath)) {
      throw new Error(
        `npm pack claimed to write ${tgzName} but ${tgzPath} does not exist`,
      );
    }

    execFileSync("tar", ["-xzf", tgzPath, "-C", stagingDir], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    const packageDir = join(stagingDir, "package");
    if (!existsSync(packageDir)) {
      throw new Error(
        `tar extraction did not produce ${packageDir}\n` +
          `  staging dir: ${stagingDir}`,
      );
    }

    const paths = walkFiles(packageDir).map((p) => `package/${p}`);
    assertNoBareIthyOpsx(paths, "package/", "npm tarball");
    log(`  ✓ ${paths.length} files scanned in ${tgzName}`);
  } finally {
    try {
      rmSync(stagingDir, { recursive: true, force: true });
    } catch (err) {
      warn(`tarball staging cleanup failed (${stagingDir}): ${err.message}`);
    }
  }
}

/**
 * Locate every candidate Electron bundle root under `electron/dist/`.
 * Returns an array of `{ appDir, binPath, label, kind }` records where:
 *   - appDir : the `.../app/` directory to walk
 *   - binPath: path to the packaged `ithyno` bin (used by check #3)
 *   - label  : human-readable bundle name (e.g., "mac-arm64")
 *   - kind   : one of "mac" | "win" (used to pick the bin path shape)
 * Missing bundles are simply absent from the array — this is the intended
 * behavior for the single-OS host build path (see design.md D3).
 */
function findElectronBundles() {
  const distDir = resolve(repoRoot, "electron", "dist");
  const bundles = [];
  if (!existsSync(distDir)) return bundles;

  // Mac: dist/mac/, dist/mac-arm64/, dist/mac-x64/ each contain ithyno.app/.
  // electron-builder names the folder based on the arch requested.
  let macCandidates;
  try {
    macCandidates = readdirSync(distDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("mac"))
      .map((e) => e.name);
  } catch {
    macCandidates = [];
  }
  for (const name of macCandidates) {
    const appRoot = join(distDir, name, "ithyno.app", "Contents", "Resources", "app");
    if (existsSync(appRoot)) {
      bundles.push({
        appDir: appRoot,
        binPath: join(appRoot, "bin", "ithyno.js"),
        label: name,
        kind: "mac",
      });
    }
  }

  // Windows unpacked NSIS staging.
  const winApp = join(distDir, "win-unpacked", "resources", "app");
  if (existsSync(winApp)) {
    bundles.push({
      appDir: winApp,
      binPath: join(winApp, "bin", "ithyno.js"),
      label: "win-unpacked",
      kind: "win",
    });
  }

  // Linux AppImage: skipped in this change (see design.md D3). Extraction
  // would require `--appimage-extract` or `unsquashfs`; the coverage gain
  // is small relative to the added dependency, since mac / win unpacked
  // roots share the same extraResources-derived shape.
  return bundles;
}

/**
 * Check #2: shape-check each produced Electron bundle.
 */
function assertElectronBundleShape(bundles) {
  log("check 2/3: electron bundle shape");
  if (bundles.length === 0) {
    log(
      "  no electron bundle produced under electron/dist/ — skipping bundle shape check",
    );
    log(
      "  (Linux AppImage is intentionally skipped in this change — see openspec design.md D3)",
    );
    return;
  }
  for (const b of bundles) {
    const paths = walkFiles(b.appDir);
    assertNoBareIthyOpsx(paths, "", `electron bundle (${b.label})`);
    log(`  ✓ ${paths.length} files scanned in ${b.label}`);
  }
  log(
    "  (Linux AppImage bundle contents are intentionally skipped — see openspec design.md D3)",
  );
}

/**
 * Pick one bundle to exercise for check #3. Preference order:
 *   mac-arm64 → mac-x64 → mac (any) → win-unpacked.
 * Returns undefined if none present.
 */
function pickInitBundle(bundles) {
  const byLabel = (label) => bundles.find((b) => b.label === label);
  return (
    byLabel("mac-arm64") ??
    byLabel("mac-x64") ??
    bundles.find((b) => b.kind === "mac") ??
    byLabel("win-unpacked")
  );
}

/**
 * Compare every file under a source root against the same path under a
 * target root; throw on the first mismatch or missing file. `srcRoot` is
 * walked; `targetRoot` supplies the expected files. `label` identifies the
 * source tree in error messages; `bundleLabel` names which bundle's bin
 * produced the target.
 */
function assertTreeMatches({ srcRoot, targetRoot, label, bundleLabel }) {
  const files = walkFiles(srcRoot);
  for (const rel of files) {
    const srcAbs = join(srcRoot, rel);
    const targetAbs = join(targetRoot, rel);
    if (!existsSync(targetAbs)) {
      throw new Error(
        `init-from-bundle smoke (${bundleLabel}): expected scaffold path missing\n` +
          `  missing: ${rel}\n` +
          `  source tree: ${label}\n` +
          `  contract violated: ${CONTRACT}\n` +
          `  hint: check bin/init.js walkTemplates() and the bundle's extraResources`,
      );
    }
    const srcBuf = readFileSync(srcAbs);
    const targetBuf = readFileSync(targetAbs);
    if (!srcBuf.equals(targetBuf)) {
      throw new Error(
        `init-from-bundle smoke (${bundleLabel}): scaffold file diverges from source\n` +
          `  diverging: ${rel}\n` +
          `  source tree: ${label}\n` +
          `  contract violated: ${CONTRACT}\n` +
          `  hint: bundled bin resolved templates/ but produced non-byte-identical output`,
      );
    }
  }
}

/**
 * Check #3: shell out to the packaged bin's `init` subcommand against a
 * fresh tmpdir, then byte-compare every `templates/.claude/…` file the
 * distribute-ithy-opsx contract promises.
 */
function runInitFromBundle(bundles) {
  log("check 3/3: init-from-bundle smoke");
  if (bundles.length === 0) {
    log("  no electron bundle produced — skipping init-from-bundle smoke");
    return;
  }
  const bundle = pickInitBundle(bundles);
  if (!bundle) {
    log("  no compatible bundle for init smoke — skipping");
    return;
  }
  if (!existsSync(bundle.binPath)) {
    throw new Error(
      `init-from-bundle smoke (${bundle.label}): bundled bin not found\n` +
        `  expected: ${bundle.binPath}\n` +
        `  hint: check electron/package.json extraResources for the "app/bin" entry`,
    );
  }

  const targetDir = mkdtempSync(join(tmpdir(), "verify-bundle-init-"));
  try {
    // `git init` first — runInit() requires a git working tree.
    execFileSync("git", ["init", "--quiet", targetDir], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    // Invoke the packaged bin. Both mac and win bundles ship a `.js` entry;
    // executing via the host `node` avoids needing the packaged Electron
    // runtime, which the smoke does not care about.
    execFileSync(process.execPath, [bundle.binPath, "init", targetDir, "--quiet"], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    // Byte-compare every ithy-opsx command + skill from the SOURCE repo's
    // templates/.claude/ against what landed in the tmpdir. If the bundle
    // has drifted from source, this fails — which is exactly the point.
    const templatesRoot = resolve(repoRoot, "templates");
    const commandsSrc = join(templatesRoot, ".claude", "commands", "ithy-opsx");
    const commandsTarget = join(targetDir, ".claude", "commands", "ithy-opsx");
    if (existsSync(commandsSrc)) {
      assertTreeMatches({
        srcRoot: commandsSrc,
        targetRoot: commandsTarget,
        label: "templates/.claude/commands/ithy-opsx/",
        bundleLabel: bundle.label,
      });
    }

    const skillsRoot = join(templatesRoot, ".claude", "skills");
    if (existsSync(skillsRoot)) {
      const skillDirs = readdirSync(skillsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("ithy-opsx-"))
        .map((e) => e.name);
      for (const skill of skillDirs) {
        assertTreeMatches({
          srcRoot: join(skillsRoot, skill),
          targetRoot: join(targetDir, ".claude", "skills", skill),
          label: `templates/.claude/skills/${skill}/`,
          bundleLabel: bundle.label,
        });
      }
    }
    log(`  ✓ init from ${bundle.label} produced a byte-identical ithy-opsx scaffold`);
  } finally {
    try {
      rmSync(targetDir, { recursive: true, force: true });
    } catch (err) {
      warn(`init target cleanup failed (${targetDir}): ${err.message}`);
    }
  }
}

async function main() {
  log(`repo root: ${repoRoot}`);
  assertTarballShape();
  const bundles = findElectronBundles();
  assertElectronBundleShape(bundles);
  runInitFromBundle(bundles);
  log("all checks passed");
}

try {
  await main();
} catch (err) {
  console.error(`[verify-bundle] FAIL\n${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    // Print the stack tail so a reviewer can pinpoint the throwing helper
    // without wading through the whole trace.
    const tail = err.stack.split("\n").slice(0, 4).join("\n");
    console.error(tail);
  }
  process.exit(1);
}
