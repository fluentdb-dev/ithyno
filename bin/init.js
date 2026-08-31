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

import { readFile, writeFile, mkdir, readdir, stat, chmod } from "node:fs/promises";
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
const NOTIFY_TEMPLATE_NAMES = new Set([
  "scripts/notify-waiting.sh",
  "scripts/notify-waiting.ps1",
]);

/** Return the notification template for a host platform. */
export function platformNotifyScript(platform = process.platform) {
  if (platform === "darwin" || platform === "linux") {
    return { src: join(TEMPLATES_DIR, "scripts", "notify-waiting.sh"), destRel: ".ithyno/scripts/notify-waiting.sh" };
  }
  if (platform === "win32") {
    return { src: join(TEMPLATES_DIR, "scripts", "notify-waiting.ps1"), destRel: ".ithyno/scripts/notify-waiting.ps1" };
  }
  return null;
}

/** Copy the one host-specific notification script into a project. */
export async function scaffoldNotifyScript(projectRoot, force = false, { platform = process.platform, log = console.warn } = {}) {
  const selected = platformNotifyScript(platform);
  if (!selected) {
    log("notification hook: unsupported platform, skipping");
    return null;
  }
  const destAbs = join(projectRoot, selected.destRel);
  const action = await copyFile({ srcAbs: selected.src, destAbs, force });
  if (platform !== "win32") await chmod(destAbs, 0o755);
  return { ...selected, destAbs, action };
}

// JSONC parser kept dependency-free: comments are stripped with a small lexer,
// while quoted strings (including URLs) are left untouched. A warning is
// emitted by installClaudeNotifyHook when a comment was found because the
// JSON serializer cannot preserve their original placement.
function stripJsonComments(raw) {
  let out = "";
  let inString = false;
  let escaped = false;
  let hadComments = false;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    const n = raw[i + 1];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && n === "/") {
      hadComments = true;
      while (i < raw.length && raw[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }
    if (c === "/" && n === "*") {
      hadComments = true;
      i += 2;
      while (i < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    out += c;
  }
  return { text: out, hadComments };
}

function parseJsonc(raw) {
  const stripped = stripJsonComments(raw);
  // JSONC commonly uses trailing commas; tolerate those as well.
  const text = stripped.text.replace(/,\s*([}\]])/g, "$1");
  return { value: text.trim() ? JSON.parse(text) : {}, hadComments: stripped.hadComments };
}

function isIthynoHookEntry(entry, scriptAbsPath) {
  const matches = (value) => typeof value === "string" && (value === scriptAbsPath || value.startsWith(`${scriptAbsPath} `));
  if (entry?.type === "command" && (matches(entry.command) || matches(entry.bash) || matches(entry.powershell))) return true;
  return Array.isArray(entry?.hooks) && entry.hooks.some((h) => h?.type === "command" && (matches(h.command) || matches(h.bash) || matches(h.powershell)));
}

function shellArg(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function notificationCommand(scriptAbsPath, cliName, context, hostAppName) {
  if (!context || !["electron", "vscode", "cli"].includes(context)) return scriptAbsPath;
  const args = [scriptAbsPath, cliName, context];
  if (hostAppName) args.push(hostAppName);
  return args.map(shellArg).join(" ");
}

/** Merge the local notification hook into Claude Code's JSON settings. */
export async function installClaudeNotifyHook(projectRoot, scriptAbsPath, force = false, { log = console.warn, context, hostAppName } = {}) {
  const settingsPath = join(projectRoot, ".claude", "settings.json");
  let settings = {};
  let hadComments = false;
  if (existsSync(settingsPath)) {
    const parsed = parseJsonc(await readFile(settingsPath, "utf8"));
    settings = parsed.value;
    hadComments = parsed.hadComments;
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) settings.hooks = {};
  const entry = { matcher: "", hooks: [{ type: "command", command: notificationCommand(scriptAbsPath, "claude", context, hostAppName) }] };
  for (const event of ["Notification", "Stop"]) {
    const entries = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    const indexes = entries.reduce((all, item, index) => (isIthynoHookEntry(item, scriptAbsPath) ? [...all, index] : all), []);
    if (indexes.length === 0) entries.push(entry);
    else if (force) entries[indexes[0]] = entry;
    settings.hooks[event] = entries;
  }
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  if (hadComments) log("notification hook: JSONC comments may not be preserved in .claude/settings.json");
  return { settingsPath, changed: true, hadComments };
}

/** Remove only ithyno's notification entries, preserving user hooks. */
export async function removeClaudeNotifyHook(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return { settingsPath, changed: false };
  const parsed = parseJsonc(await readFile(settingsPath, "utf8"));
  const settings = parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value) ? parsed.value : {};
  let changed = false;
  if (settings.hooks && typeof settings.hooks === "object") {
    for (const event of ["Notification", "Stop"]) {
      const entries = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
      const filtered = entries.filter((entry) => !isIthynoHookEntry(entry, scriptAbsPath));
      if (filtered.length !== entries.length) changed = true;
      settings.hooks[event] = filtered;
    }
  }
  if (changed) await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { settingsPath, changed };
}

export async function claudeNotifyHookStatus(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".claude", "settings.json");
  if (!existsSync(settingsPath)) return { supported: true, enabled: false, settingsPath };
  const parsed = parseJsonc(await readFile(settingsPath, "utf8"));
  const hooks = parsed.value?.hooks;
  const enabled = ["Notification", "Stop"].some((event) =>
    Array.isArray(hooks?.[event]) && hooks[event].some((entry) => isIthynoHookEntry(entry, scriptAbsPath)),
  );
  return { supported: true, enabled, settingsPath };
}

/** Merge the notification hook into Agy's project-local hooks.json. */
export async function installAgyNotifyHook(projectRoot, scriptAbsPath, force = false, { context, hostAppName } = {}) {
  const settingsPath = join(projectRoot, ".agent", "hooks.json");
  let settings = {};
  if (existsSync(settingsPath)) settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  // Agy Stop is a flat lifecycle event: handlers are placed directly in the
  // array. Grouped matcher/hooks entries are only valid for tool-use events.
  const entry = { type: "command", command: notificationCommand(scriptAbsPath, "agy", context, hostAppName), timeout: 10 };
  const events = settings["ithyno-notification"] ?? {};
  const existing = Array.isArray(events.Stop) ? events.Stop : [];
  const filtered = existing.filter((item) => !isIthynoHookEntry(item, scriptAbsPath));
  if (force || filtered.length === existing.length) filtered.push(entry);
  settings["ithyno-notification"] = { ...events, Stop: filtered };
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { supported: true, settingsPath, changed: true };
}

export async function removeAgyNotifyHook(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".agent", "hooks.json");
  if (!existsSync(settingsPath)) return { supported: true, settingsPath, changed: false };
  const settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  let changed = false;
  const block = settings?.["ithyno-notification"];
  if (block && typeof block === "object") {
    for (const event of Object.keys(block)) {
      if (!Array.isArray(block[event])) continue;
      const filtered = block[event].filter((item) => !isIthynoHookEntry(item, scriptAbsPath));
      if (filtered.length !== block[event].length) changed = true;
      block[event] = filtered;
    }
  }
  if (changed) await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { supported: true, settingsPath, changed };
}

export async function agyNotifyHookStatus(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".agent", "hooks.json");
  if (!existsSync(settingsPath)) return { supported: true, enabled: false, settingsPath };
  const settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  const block = settings?.["ithyno-notification"];
  const enabled = Object.values(block && typeof block === "object" ? block : {}).some((items) =>
    Array.isArray(items) && items.some((entry) => isIthynoHookEntry(entry, scriptAbsPath)),
  );
  return { supported: true, enabled, settingsPath };
}

/** Merge the notification hook into Codex's project-local hooks.json. */
export async function installCodexNotifyHook(projectRoot, scriptAbsPath, force = false, { context, hostAppName } = {}) {
  const settingsPath = join(projectRoot, ".codex", "hooks.json");
  let settings = {};
  if (existsSync(settingsPath)) settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) settings.hooks = {};
  const entry = { matcher: "", hooks: [{ type: "command", command: notificationCommand(scriptAbsPath, "codex", context, hostAppName), timeout: 10 }] };
  const existing = Array.isArray(settings.hooks.Stop) ? settings.hooks.Stop : [];
  const indexes = existing.reduce((all, item, index) => (isIthynoHookEntry(item, scriptAbsPath) ? [...all, index] : all), []);
  if (indexes.length === 0) settings.hooks.Stop = [...existing, entry];
  else if (force) settings.hooks.Stop = existing.map((item, index) => index === indexes[0] ? entry : item);
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { supported: true, settingsPath, changed: true };
}

export async function removeCodexNotifyHook(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".codex", "hooks.json");
  if (!existsSync(settingsPath)) return { supported: true, settingsPath, changed: false };
  const settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  let changed = false;
  if (settings?.hooks && typeof settings.hooks === "object") {
    const entries = Array.isArray(settings.hooks.Stop) ? settings.hooks.Stop : [];
    const filtered = entries.filter((item) => !isIthynoHookEntry(item, scriptAbsPath));
    changed = filtered.length !== entries.length;
    settings.hooks.Stop = filtered;
  }
  if (changed) await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { supported: true, settingsPath, changed };
}

export async function codexNotifyHookStatus(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".codex", "hooks.json");
  if (!existsSync(settingsPath)) return { supported: true, enabled: false, settingsPath };
  const settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  const entries = settings?.hooks?.Stop;
  const enabled = Array.isArray(entries) && entries.some((entry) => isIthynoHookEntry(entry, scriptAbsPath));
  return { supported: true, enabled, settingsPath };
}

/** Install Copilot CLI's repository-level notification hook. */
export async function installCopilotNotifyHook(projectRoot, scriptAbsPath, force = false, { context } = {}) {
  const settingsPath = join(projectRoot, ".github", "hooks", "ithyno-notification.json");
  let settings = {};
  if (existsSync(settingsPath)) settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  if (settings.version !== 1) settings.version = 1;
  if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) settings.hooks = {};
  const bashPath = ".ithyno/scripts/notify-waiting.sh";
  const powershellPath = ".ithyno/scripts/notify-waiting.ps1";
  const entry = { type: "command", bash: bashPath, powershell: powershellPath, timeoutSec: 10 };
  const existing = Array.isArray(settings.hooks.notification) ? settings.hooks.notification : [];
  const isOwned = (item) => item?.type === "command" && (item.command === scriptAbsPath || item.bash === bashPath || item.powershell === powershellPath);
  const indexes = existing.reduce((all, item, index) => (isOwned(item) ? [...all, index] : all), []);
  if (indexes.length === 0) settings.hooks.notification = [...existing, entry];
  else if (force) settings.hooks.notification = existing.map((item, index) => index === indexes[0] ? entry : item);
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { supported: true, settingsPath, changed: true };
}

export async function removeCopilotNotifyHook(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".github", "hooks", "ithyno-notification.json");
  if (!existsSync(settingsPath)) return { supported: true, settingsPath, changed: false };
  const settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  const items = settings?.hooks?.notification;
  const bashPath = ".ithyno/scripts/notify-waiting.sh";
  const powershellPath = ".ithyno/scripts/notify-waiting.ps1";
  const isOwned = (item) => item?.type === "command" && (item.command === scriptAbsPath || item.bash === bashPath || item.powershell === powershellPath);
  const filtered = Array.isArray(items) ? items.filter((item) => !isOwned(item)) : items;
  const changed = Array.isArray(items) && filtered.length !== items.length;
  if (changed) {
    settings.hooks.notification = filtered;
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { supported: true, settingsPath, changed };
}

export async function copilotNotifyHookStatus(projectRoot, scriptAbsPath) {
  const settingsPath = join(projectRoot, ".github", "hooks", "ithyno-notification.json");
  if (!existsSync(settingsPath)) return { supported: true, enabled: false, settingsPath };
  const settings = parseJsonc(await readFile(settingsPath, "utf8")).value;
  const bashPath = ".ithyno/scripts/notify-waiting.sh";
  const powershellPath = ".ithyno/scripts/notify-waiting.ps1";
  const enabled = Array.isArray(settings?.hooks?.notification) && settings.hooks.notification.some((item) =>
    item?.type === "command" && (item.command === scriptAbsPath || item.bash === bashPath || item.powershell === powershellPath),
  );
  return { supported: true, enabled, settingsPath };
}

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
    if (NOTIFY_TEMPLATE_NAMES.has(relPath)) continue;
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

  // Init owns the host-specific notification script, but hook enablement is
  // an explicit Settings action and is never changed here.
  try {
    await scaffoldNotifyScript(target, force, { log });
  } catch (err) {
    if (!quiet) log(`notification script: ${err instanceof Error ? err.message : String(err)}`);
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
