// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { parse as parseDotenvx } from "@dotenvx/dotenvx";

const require = createRequire(import.meta.url);

export type EnvironmentDiagnostic = {
  kind:
    | "unreadable-file"
    | "unsupported-syntax"
    | "reserved-key"
    | "missing-required-key"
    | "encryption"
    | "git-tracked-secret"
    | "path-traversal"
    | "stale-revision";
  severity: "warning" | "error";
  message: string;
  path?: string;
  key?: string;
};

export type DevelopmentEnvironmentProfile = {
  name: string;
  path: string;
  exists: boolean;
  isBase: boolean;
  selected: boolean;
};

export type DevelopmentEnvironmentVariable = {
  key: string;
  maskedValue: string;
  source: string;
  sourcePath: string;
  reserved: boolean;
};

export type DevelopmentEnvironmentSelection = {
  selectedProfile: string | null;
  preferences: Record<string, unknown>;
};

export type DevelopmentEnvironmentState = {
  projectRoot: string;
  profiles: DevelopmentEnvironmentProfile[];
  selection: DevelopmentEnvironmentSelection;
  orderedFiles: string[];
  variables: DevelopmentEnvironmentVariable[];
  diagnostics: EnvironmentDiagnostic[];
  encryption: {
    ready: boolean;
    status: "ready" | "missing";
    sources: string[];
  };
  revision: string;
};

export type DevelopmentEnvironmentMutation = {
  profile: string;
  values?: Record<string, string>;
  remove?: string[];
  revision?: string;
};

export type DevelopmentEnvironmentEncryptionResult = {
  status: "ready" | "missing" | "failed";
  path: string;
  ready: boolean;
  revision: string;
  message?: string;
};

const STATE_PATH = ".ithyno/environment.json";
const RESERVED_PREFIX = "ITHYNO_";
const PROFILE_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_ASSIGNMENT_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function toRelative(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).replace(/\\/g, "/");
}

function maskValue(_value: string): string {
  return "********";
}

export function validateProfileName(profile: string | null | undefined): string | null {
  if (profile === null || profile === undefined) return null;
  const trimmed = profile.trim();
  if (!trimmed) return null;
  if (trimmed === "." || trimmed === "..") return null;
  if (!PROFILE_NAME_RE.test(trimmed)) return null;
  if (trimmed === "default") return "default";
  if (trimmed === "local") return "local";
  return trimmed.replace(/^\.env\./, "").replace(/^\.env$/, "default");
}

function resolveProfilePath(projectRoot: string, profile: string | null): string | null {
  if (!profile) return null;
  const normalized = validateProfileName(profile);
  if (!normalized) return null;
  if (normalized === "default") return join(projectRoot, ".env");
  if (normalized === "local") return join(projectRoot, ".env.local");
  return join(projectRoot, `.env.${normalized}`);
}

function isInsideProjectRoot(projectRoot: string, filePath: string): boolean {
  const root = resolve(projectRoot);
  const target = resolve(filePath);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function readTrackedState(projectRoot: string, filePaths: string[]): Set<string> {
  const tracked = new Set<string>();
  if (filePaths.length === 0) return tracked;
  const rels = filePaths.map((filePath) => toRelative(projectRoot, filePath));
  try {
    const output = execFileSync("git", ["ls-files", "--", ...rels], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString("utf8");
    for (const line of output.split(/\r?\n/)) {
      const rel = line.trim();
      if (rel) tracked.add(rel);
    }
  } catch {
    return tracked;
  }
  return tracked;
}

async function inspectFile(projectRoot: string, filePath: string): Promise<{ ok: boolean; realPath?: string; diagnostic?: EnvironmentDiagnostic }> {
  if (!existsSync(filePath)) {
    return { ok: false };
  }
  try {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      const realPath = realpathSync(filePath);
      if (!isInsideProjectRoot(projectRoot, realPath)) {
        return {
          ok: false,
          realPath,
          diagnostic: {
            kind: "path-traversal",
            severity: "error",
            message: `Symlink escapes project root: ${toRelative(projectRoot, filePath)}`,
            path: toRelative(projectRoot, filePath),
          },
        };
      }
    }
  } catch {
    // Fall through to the general read path.
  }
  return { ok: true };
}

export async function readEnvironmentSelection(projectRoot: string): Promise<DevelopmentEnvironmentSelection> {
  const statePath = join(projectRoot, STATE_PATH);
  if (!existsSync(statePath)) {
    return { selectedProfile: null, preferences: {} };
  }
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DevelopmentEnvironmentSelection> & {
      preferences?: Record<string, unknown>;
      selectedProfile?: string | null;
    };
    return {
      selectedProfile: validateProfileName(parsed.selectedProfile) ?? null,
      preferences: parsed.preferences ?? {},
    };
  } catch {
    return { selectedProfile: null, preferences: {} };
  }
}

export async function writeEnvironmentSelection(
  projectRoot: string,
  selection: DevelopmentEnvironmentSelection,
): Promise<void> {
  const statePath = join(projectRoot, STATE_PATH);
  await mkdir(dirname(statePath), { recursive: true });
  const payload = {
    selectedProfile: validateProfileName(selection.selectedProfile) ?? null,
    preferences: selection.preferences ?? {},
  };
  await writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function discoverDevelopmentProfiles(projectRoot: string): Promise<{
  profiles: DevelopmentEnvironmentProfile[];
  diagnostics: EnvironmentDiagnostic[];
}> {
  const root = resolve(projectRoot);
  const profiles: DevelopmentEnvironmentProfile[] = [];
  const diagnostics: EnvironmentDiagnostic[] = [];
  const files = existsSync(root) ? readdirSync(root, { withFileTypes: true }) : [];
  const seen = new Set<string>();

  const addProfile = (name: string, path: string, isBase: boolean): void => {
    if (seen.has(name)) return;
    seen.add(name);
    profiles.push({ name, path: toRelative(root, path), exists: existsSync(path), isBase, selected: false });
  };

  const maybeAddProfile = async (name: string, path: string, isBase: boolean): Promise<void> => {
    const inspection = await inspectFile(root, path);
    if (inspection.diagnostic) {
      diagnostics.push(inspection.diagnostic);
      return;
    }
    addProfile(name, path, isBase);
  };

  if (existsSync(join(root, ".env"))) {
    await maybeAddProfile("default", join(root, ".env"), true);
  }
  if (existsSync(join(root, ".env.local"))) {
    await maybeAddProfile("local", join(root, ".env.local"), false);
  }
  for (const entry of files) {
    if (entry.isDirectory()) continue;
    if (!entry.name.startsWith(".env.")) continue;
    const name = entry.name.slice(5);
    if (name === "local") continue;
    await maybeAddProfile(name, join(root, entry.name), false);
  }
  return {
    profiles: profiles.sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics,
  };
}

async function collectResolvedEnvironment(
  projectRoot: string,
  selection: DevelopmentEnvironmentSelection,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<{
  orderedFiles: string[];
  env: Record<string, string>;
  diagnostics: EnvironmentDiagnostic[];
  variableEntries: DevelopmentEnvironmentVariable[];
  encryptionSources: string[];
  profiles: DevelopmentEnvironmentProfile[];
}> {
  const root = resolve(projectRoot);
  const { profiles, diagnostics: discoveredDiagnostics } = await discoverDevelopmentProfiles(root);
  const orderedFiles: string[] = [];
  const diagnostics: EnvironmentDiagnostic[] = [...discoveredDiagnostics];
  const env: Record<string, string> = {};
  const variableEntriesByKey = new Map<string, DevelopmentEnvironmentVariable>();
  const selectedProfile = validateProfileName(selection.selectedProfile) ?? null;

  const addFile = (filePath: string): void => {
    if (!orderedFiles.includes(filePath)) orderedFiles.push(filePath);
  };

  if (selectedProfile !== null) {
    if (existsSync(join(root, ".env"))) {
      addFile(join(root, ".env"));
    }
    if (existsSync(join(root, ".env.local"))) {
      addFile(join(root, ".env.local"));
    }
    if (selectedProfile && selectedProfile !== "default" && selectedProfile !== "local") {
      const profilePath = resolveProfilePath(root, selectedProfile);
      if (profilePath && existsSync(profilePath)) {
        addFile(profilePath);
      }
    } else if (selectedProfile === "local") {
      const profilePath = resolveProfilePath(root, "local");
      if (profilePath && existsSync(profilePath)) {
        addFile(profilePath);
      }
    }
  }

  for (const profile of profiles) {
    if (selectedProfile && profile.name === selectedProfile) {
      profile.selected = true;
    }
  }

  const encryptionSources: string[] = [];
  const encryptionKeys = [
    "DOTENVX_KEY",
    "DOTENV_KEY",
    "DOTENV_PRIVATE_KEY",
    "DOTENV_PUBLIC_KEY",
    "DOTENVX_KEYS",
    "DOTENVX_KEY_FILE",
  ].filter((key) => Boolean(inheritedEnv[key]));
  if (encryptionKeys.length > 0) {
    encryptionSources.push(...encryptionKeys);
  }

  const diagnosticFiles = new Set<string>(orderedFiles);
  for (const profile of profiles) {
    const profilePath = resolve(root, profile.path);
    if (existsSync(profilePath)) {
      diagnosticFiles.add(profilePath);
    }
  }

  const trackedFiles = readTrackedState(root, Array.from(diagnosticFiles));
  for (const filePath of Array.from(diagnosticFiles)) {
    const inspection = await inspectFile(root, filePath);
    if (inspection.diagnostic) {
      diagnostics.push(inspection.diagnostic);
      continue;
    }
    if (trackedFiles.has(toRelative(root, filePath))) {
      diagnostics.push({
        kind: "git-tracked-secret",
        severity: "warning",
        message: `Tracked file may contain secrets: ${toRelative(root, filePath)}`,
        path: toRelative(root, filePath),
      });
    }
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = parseDotenvx(raw) as Record<string, string>;
      const reservedKeys = Object.keys(parsed).filter((key) => key.startsWith(RESERVED_PREFIX));
      if (reservedKeys.length > 0) {
        diagnostics.push({
          kind: "reserved-key",
          severity: "warning",
          message: `Reserved keys were skipped from ${toRelative(root, filePath)}: ${reservedKeys.join(", ")}`,
          path: toRelative(root, filePath),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
      diagnostics.push({
        kind: code === "EACCES" || code === "EPERM" ? "unreadable-file" : "unsupported-syntax",
        severity: "error",
        message: `Unable to parse ${toRelative(root, filePath)}: ${message}`,
        path: toRelative(root, filePath),
      });
    }
  }

  for (const filePath of orderedFiles) {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = parseDotenvx(raw) as Record<string, string>;
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith(RESERVED_PREFIX)) continue;
        env[key] = value;
        variableEntriesByKey.set(key, {
          key,
          maskedValue: maskValue(value),
          source: toRelative(root, filePath),
          sourcePath: filePath,
          reserved: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code) : "";
      diagnostics.push({
        kind: code === "EACCES" || code === "EPERM" ? "unreadable-file" : "unsupported-syntax",
        severity: "error",
        message: `Unable to parse ${toRelative(root, filePath)}: ${message}`,
        path: toRelative(root, filePath),
      });
    }
  }

  return {
    orderedFiles,
    env,
    diagnostics,
    variableEntries: Array.from(variableEntriesByKey.values()),
    encryptionSources,
    profiles,
  };
}

export async function composeDevelopmentEnvironment(
  projectRoot: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<DevelopmentEnvironmentState> {
  void inheritedEnv;
  const root = resolve(projectRoot);
  const selection = await readEnvironmentSelection(root);
  const { orderedFiles, env, diagnostics, variableEntries, encryptionSources, profiles } = await collectResolvedEnvironment(root, selection, inheritedEnv);
  const resolvedEntries = Object.entries(env).sort(([a], [b]) => a.localeCompare(b));
  const targetProfile = selection.selectedProfile ?? "default";
  const targetPath = resolveProfilePath(root, targetProfile);
  const targetContent = targetPath && existsSync(targetPath) && lstatSync(targetPath).isFile()
    ? await readFile(targetPath, "utf8")
    : "";
  const variableMap = new Map(variableEntries.map((item) => [item.key, item]));
  const state: DevelopmentEnvironmentState = {
    projectRoot: root,
    profiles,
    selection,
    orderedFiles: orderedFiles.map((filePath) => toRelative(root, filePath)),
    variables: resolvedEntries.map(([key, value]) => {
      const found = variableMap.get(key);
      return {
        key,
        maskedValue: maskValue(value),
        source: found?.source ?? ".env",
        sourcePath: found?.sourcePath ?? join(root, ".env"),
        reserved: false,
      };
    }),
    diagnostics,
    encryption: {
      ready: encryptionSources.length > 0,
      status: encryptionSources.length > 0 ? "ready" : "missing",
      sources: encryptionSources,
    },
    revision: sha1(targetContent),
  };

  return state;
}

export async function resolveDevelopmentEnvironmentValues(
  projectRoot: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<Record<string, string>> {
  void inheritedEnv;
  const root = resolve(projectRoot);
  const selection = await readEnvironmentSelection(root);
  const { env } = await collectResolvedEnvironment(root, selection, inheritedEnv);
  return env;
}

export async function revealEnvironmentValue(
  projectRoot: string,
  key: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const values = await resolveDevelopmentEnvironmentValues(projectRoot, inheritedEnv);
  if (!Object.prototype.hasOwnProperty.call(values, key)) {
    throw new Error(`Unknown environment key "${key}"`);
  }
  return values[key];
}

function parseAssignmentLine(line: string): { key: string; valuePart: string; comment: string } | null {
  const match = line.match(ENV_ASSIGNMENT_RE);
  if (!match) return null;
  const key = match[1];
  const rawValuePart = match[2] ?? "";
  let comment = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  for (let index = 0; index < rawValuePart.length; index += 1) {
    const char = rawValuePart[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "#" && !inSingle && !inDouble) {
      const before = rawValuePart.slice(0, index);
      const whitespace = before.match(/\s*$/)?.[0] ?? "";
      if (whitespace) {
        comment = `${whitespace}${rawValuePart.slice(index)}`;
        break;
      }
    }
  }
  return { key, valuePart: rawValuePart, comment };
}

function assertValidMutationKeys(keys: Iterable<string>): void {
  for (const key of keys) {
    if (!key.trim()) continue;
    if (!ENV_KEY_RE.test(key)) {
      throw new Error(`Invalid environment key name "${key}"`);
    }
  }
}

export async function mutateEnvironmentFile(
  projectRoot: string,
  payload: DevelopmentEnvironmentMutation,
): Promise<{ revision: string; path: string; wrote: boolean }> {
  const root = resolve(projectRoot);
  const normalizedProfile = validateProfileName(payload.profile);
  if (!normalizedProfile) {
    throw new Error("Invalid profile target");
  }
  const profilePath = resolveProfilePath(root, normalizedProfile);
  if (!profilePath || !isInsideProjectRoot(root, profilePath)) {
    throw new Error("Invalid profile target");
  }
  assertValidMutationKeys(Object.keys(payload.values ?? {}));
  const reservedUpdates = Object.keys(payload.values ?? {}).filter((key) => key.startsWith(RESERVED_PREFIX));
  if (reservedUpdates.length > 0) {
    throw new Error("Reserved environment keys cannot be managed as project values");
  }
  for (const key of payload.remove ?? []) {
    if (!key.trim()) continue;
    if (!ENV_KEY_RE.test(key)) {
      throw new Error(`Invalid environment key name "${key}"`);
    }
  }
  const reservedRemovals = (payload.remove ?? []).filter((key) => key.trim().startsWith(RESERVED_PREFIX));
  if (reservedRemovals.length > 0) {
    throw new Error("Reserved environment keys cannot be managed as project values");
  }
  const targetPath = profilePath;
  await mkdir(dirname(targetPath), { recursive: true });
  const exists = existsSync(targetPath);
  const currentContent = exists ? await readFile(targetPath, "utf8") : "";
  const currentRevision = sha1(currentContent);
  if (exists && (!payload.revision || payload.revision.trim() === "")) {
    throw new Error("revision required");
  }
  if (exists && payload.revision && payload.revision !== currentRevision) {
    throw new Error("stale revision");
  }
  const entries = new Map<string, string>();
  const removals = new Set((payload.remove ?? []).map((item) => item.trim()).filter(Boolean));
  const updates = payload.values ?? {};
  for (const [key, value] of Object.entries(updates)) {
    if (!key.trim()) continue;
    entries.set(key, value);
  }

  const lines = currentContent.split(/\r?\n/);
  const nextLines: string[] = [];
  for (const line of lines) {
    const assignment = parseAssignmentLine(line);
    if (!assignment) {
      nextLines.push(line);
      continue;
    }
    const key = assignment.key;
    if (removals.has(key)) continue;
    if (entries.has(key)) {
      const value = entries.get(key) ?? "";
      nextLines.push(`${key}=${serializeEnvValue(value)}${assignment.comment}`);
      entries.delete(key);
      continue;
    }
    nextLines.push(line);
  }

  for (const [key, value] of entries.entries()) {
    nextLines.push(`${key}=${serializeEnvValue(value)}`);
  }
  const nextContent = nextLines.join("\n");
  const tmpPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, nextContent, { encoding: "utf8", mode: 0o600 });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, targetPath);
  return { revision: sha1(nextContent), path: toRelative(root, targetPath), wrote: true };
}

function serializeEnvValue(value: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error("Multiline values are not supported");
  }
  return JSON.stringify(value);
}

export async function encryptEnvironmentFile(
  projectRoot: string,
  profile: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<DevelopmentEnvironmentEncryptionResult> {
  const root = resolve(projectRoot);
  const normalizedProfile = validateProfileName(profile);
  if (!normalizedProfile) {
    throw new Error("Invalid profile target");
  }
  const profilePath = resolveProfilePath(root, normalizedProfile);
  if (!profilePath || !isInsideProjectRoot(root, profilePath)) {
    throw new Error("Invalid profile target");
  }
  const keyCandidates = [
    inheritedEnv.DOTENVX_KEY,
    inheritedEnv.DOTENV_KEY,
    inheritedEnv.DOTENV_PRIVATE_KEY,
    inheritedEnv.DOTENV_PUBLIC_KEY,
    inheritedEnv.DOTENVX_KEYS,
    inheritedEnv.DOTENVX_KEY_FILE,
  ].filter((value): value is string => Boolean(value));
  if (keyCandidates.length === 0) {
    return {
      status: "missing",
      path: toRelative(root, profilePath),
      ready: false,
      revision: sha1(""),
      message: "No dotenvx encryption keys are configured.",
    };
  }
  const cliPath = require.resolve("@dotenvx/dotenvx/src/cli/dotenvx.js");
  try {
    execFileSync(process.execPath, [cliPath, "encrypt", "-f", profilePath], {
      cwd: root,
      env: { ...process.env, ...inheritedEnv },
      stdio: "pipe",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      path: toRelative(root, profilePath),
      ready: false,
      revision: sha1(""),
      message,
    };
  }
  const nextContent = existsSync(profilePath) ? await readFile(profilePath, "utf8") : "";
  return {
    status: "ready",
    path: toRelative(root, profilePath),
    ready: true,
    revision: sha1(nextContent),
  };
}

export async function getEnvironmentSnapshot(
  projectRoot: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<DevelopmentEnvironmentState> {
  return composeDevelopmentEnvironment(projectRoot, inheritedEnv);
}
