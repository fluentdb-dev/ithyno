// SPDX-License-Identifier: GPL-3.0-or-later
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { config as resolveDotenvxConfig } from "@dotenvx/dotenvx";

const require = createRequire(import.meta.url);

export type EnvironmentDiagnostic = {
  kind:
    | "unreadable-file"
    | "unsupported-syntax"
    | "reserved-key"
    | "missing-required-key"
    | "decryption-failed"
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

function isDotenvCredentialName(name: string): boolean {
  const upper = name.toUpperCase();
  return upper === "DOTENVX_KEY"
    || upper === "DOTENV_KEY"
    || upper === "DOTENV_PRIVATE_KEY"
    || upper === "DOTENV_PUBLIC_KEY"
    || upper === "DOTENVX_KEYS"
    || upper === "DOTENVX_KEY_FILE"
    || upper.startsWith("DOTENV_PRIVATE_KEY_")
    || upper.startsWith("DOTENV_PUBLIC_KEY_");
}

function isDotenvRuntimeKey(name: string): boolean {
  const upper = name.toUpperCase();
  return upper.startsWith("DOTENV_") || upper.startsWith("DOTENVX_");
}

function collectDotenvKeySources(inheritedEnv: NodeJS.ProcessEnv, projectRoot: string): string[] {
  const combined = new Set<string>();
  for (const [key] of Object.entries(inheritedEnv ?? {})) {
    if (isDotenvCredentialName(key)) {
      combined.add(key);
    }
  }

  const keyFile = join(projectRoot, ".env.keys");
  if (!existsSync(keyFile)) return Array.from(combined);

  try {
    const stat = lstatSync(keyFile);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return Array.from(combined);
    }
    const raw = readFileSync(keyFile, "utf8");
    const matches = raw.matchAll(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm);
    for (const match of matches) {
      const key = match[1];
      if (isDotenvCredentialName(key)) {
        combined.add(key);
      }
    }
  } catch {
    // Ignore unreadable/unsafe key files; diagnostics will surface separately.
  }

  return Array.from(combined);
}

function getCredentialProcessEnv(inheritedEnv: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(inheritedEnv ?? {})
      .filter(([key, value]) => isDotenvCredentialName(key) && typeof value === "string"),
  ) as Record<string, string>;
}

function getSanitizedProcessEnv(inheritedEnv: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(inheritedEnv ?? {})
      .filter(([key, value]) => !isDotenvCredentialName(key) && typeof value === "string"),
  ) as Record<string, string>;
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

function buildOrderedProfilePaths(projectRoot: string, selectedProfile: string | null): string[] {
  const root = resolve(projectRoot);
  const ordered: string[] = [];
  const basePath = join(root, ".env");
  const localPath = join(root, ".env.local");

  if (selectedProfile === null || selectedProfile === undefined) {
    if (existsSync(basePath)) ordered.push(basePath);
    return ordered;
  }

  const normalized = validateProfileName(selectedProfile);
  if (!normalized) {
    if (existsSync(basePath)) ordered.push(basePath);
    return ordered;
  }

  if (normalized === "default") {
    if (existsSync(basePath)) ordered.push(basePath);
    return ordered;
  }

  if (normalized === "local") {
    if (existsSync(localPath)) ordered.push(localPath);
    if (existsSync(basePath)) ordered.push(basePath);
    return ordered;
  }

  const selectedPath = resolveProfilePath(root, normalized);
  const selectedLocalPath = join(root, `.env.${normalized}.local`);
  if (selectedLocalPath && existsSync(selectedLocalPath)) ordered.push(selectedLocalPath);
  if (selectedPath && existsSync(selectedPath)) ordered.push(selectedPath);
  if (existsSync(localPath)) ordered.push(localPath);
  if (existsSync(basePath)) ordered.push(basePath);

  return ordered;
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
      return {
        ok: false,
        realPath,
        diagnostic: {
          kind: "path-traversal",
          severity: "error",
          message: `Unsafe symlinked project file: ${toRelative(projectRoot, filePath)}`,
          path: toRelative(projectRoot, filePath),
        },
      };
    }
    if (stat.isFile()) {
      try {
        await readFile(filePath, "utf8");
      } catch {
        return {
          ok: false,
          diagnostic: {
            kind: "unreadable-file",
            severity: "error",
            message: `File is not readable: ${toRelative(projectRoot, filePath)}`,
            path: toRelative(projectRoot, filePath),
          },
        };
      }
    } else {
      return {
        ok: false,
        diagnostic: {
          kind: "unsupported-syntax",
          severity: "error",
          message: `Expected a regular file: ${toRelative(projectRoot, filePath)}`,
          path: toRelative(projectRoot, filePath),
        },
      };
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
    if (entry.name === ".env.keys") continue;
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
  const selectedProfile = validateProfileName(selection.selectedProfile) ?? null;
  const orderedFiles = buildOrderedProfilePaths(root, selectedProfile);
  const diagnostics: EnvironmentDiagnostic[] = [...discoveredDiagnostics];
  const env: Record<string, string> = {};
  const variableEntriesByKey = new Map<string, DevelopmentEnvironmentVariable>();
  const keySourceByKey = new Map<string, string>();

  for (const profile of profiles) {
    if (selectedProfile && profile.name === selectedProfile) {
      profile.selected = true;
    }
  }

  const encryptionSources = collectDotenvKeySources(inheritedEnv, root);

  const diagnosticFiles = new Set<string>(orderedFiles);
  const resolvableFiles = new Set<string>();
  const keyFilePath = join(root, ".env.keys");
  if (existsSync(keyFilePath)) {
    diagnosticFiles.add(keyFilePath);
  }
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
    if (orderedFiles.includes(filePath)) {
      resolvableFiles.add(filePath);
    }
    if (trackedFiles.has(toRelative(root, filePath))) {
      diagnostics.push({
        kind: "git-tracked-secret",
        severity: "warning",
        message: `Tracked file may contain secrets: ${toRelative(root, filePath)}`,
        path: toRelative(root, filePath),
      });
    }

    if (filePath === keyFilePath) continue;

    try {
      const raw = await readFile(filePath, "utf8");
      const reservedKeys = Array.from(raw.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm))
        .map((match) => match[1])
        .filter((key) => key.startsWith(RESERVED_PREFIX));
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

  const safeOrderedFiles = orderedFiles.filter((filePath) => resolvableFiles.has(filePath));
  for (const filePath of safeOrderedFiles) {
    try {
      const raw = await readFile(filePath, "utf8");
      const matches = Array.from(raw.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/gm));
      for (const match of matches) {
        const key = match[1];
        if (key.startsWith(RESERVED_PREFIX) || isDotenvRuntimeKey(key)) continue;
        if (!keySourceByKey.has(key)) {
          keySourceByKey.set(key, filePath);
        }
      }
    } catch {
      // Ignore file-scope source detection for unreadable files; diagnostics already reported.
    }
  }

  if (safeOrderedFiles.length > 0) {
    const resolved = resolveDotenvxConfig({
      path: safeOrderedFiles,
      envKeysFile: keyFilePath,
      processEnv: {
        ...getSanitizedProcessEnv(inheritedEnv),
        ...getCredentialProcessEnv(inheritedEnv),
      },
      noNative: inheritedEnv.DOTENVX_NO_NATIVE === "1" || inheritedEnv.DOTENVX_NO_NATIVE === "true",
      quiet: true,
      strict: false,
      ignore: [],
    });
    const configError = resolved && typeof resolved === "object" && "error" in resolved ? resolved.error : undefined;
    const configErrorCode = configError && typeof configError === "object"
      ? String((configError as { code?: string }).code ?? "")
      : "";
    const shouldRejectConfig = ["MISSING_PRIVATE_KEY", "DECRYPTION_FAILED"].includes(configErrorCode);
    if (shouldRejectConfig) {
      diagnostics.push({
        kind: configErrorCode === "DECRYPTION_FAILED" ? "decryption-failed" : "missing-required-key",
        severity: "error",
        message: configErrorCode === "DECRYPTION_FAILED"
          ? "The available dotenvx private key could not decrypt the selected encrypted profile."
          : "A matching dotenvx private key is required for the selected encrypted profile.",
        path: ".env.keys",
      });
    }

    if (shouldRejectConfig) {
      return {
        orderedFiles,
        env: {},
        diagnostics,
        variableEntries: [],
        encryptionSources,
        profiles,
      };
    }

    const parsed = resolved && typeof resolved === "object" && "parsed" in resolved && resolved.parsed && typeof resolved.parsed === "object"
      ? (resolved.parsed as Record<string, string>)
      : {};

    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith(RESERVED_PREFIX) || isDotenvRuntimeKey(key)) continue;
      env[key] = String(value);
      const sourcePath = keySourceByKey.get(key) ?? safeOrderedFiles[0];
      variableEntriesByKey.set(key, {
        key,
        maskedValue: maskValue(String(value)),
        source: toRelative(root, sourcePath),
        sourcePath,
        reserved: false,
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

  const keyFilePath = join(root, ".env.keys");
  if (!isInsideProjectRoot(root, keyFilePath)) {
    throw new Error("Unsafe dotenvx key file path");
  }
  if (existsSync(keyFilePath)) {
    const keyStat = lstatSync(keyFilePath);
    if (keyStat.isSymbolicLink()) {
      throw new Error("Unsafe dotenvx key file: .env.keys is a symlink");
    }
    if (!keyStat.isFile()) {
      throw new Error("Unsafe dotenvx key file: .env.keys is not a regular file");
    }
    const tracked = readTrackedState(root, [keyFilePath]);
    if (tracked.has(".env.keys")) {
      throw new Error("Refusing to encrypt using a tracked .env.keys file");
    }
  }

  const gitignorePath = join(root, ".gitignore");
  const originalProfileExists = existsSync(profilePath);
  const originalKeyExists = existsSync(keyFilePath);
  const originalGitignoreExists = existsSync(gitignorePath);
  const originalProfile = originalProfileExists ? await readFile(profilePath, "utf8").catch(() => null) : null;
  const originalKeyFile = originalKeyExists ? await readFile(keyFilePath, "utf8").catch(() => null) : null;
  const originalGitignore = originalGitignoreExists ? await readFile(gitignorePath, "utf8").catch(() => null) : null;
  const originalProfileMode = originalProfileExists ? lstatSync(profilePath).mode & 0o777 : null;
  const originalKeyMode = originalKeyExists ? lstatSync(keyFilePath).mode & 0o777 : null;
  const originalGitignoreMode = originalGitignoreExists ? lstatSync(gitignorePath).mode & 0o777 : null;
  const ignoreLine = ".env.keys";
  const gitignoreDirty = originalGitignore ? !originalGitignore.split(/\r?\n/).includes(ignoreLine) : true;

  const rollback = async (): Promise<void> => {
    const restoreFile = async (
      path: string,
      content: string | null,
      mode: number | null,
      existedBefore: boolean,
    ): Promise<void> => {
      if (content === null && existedBefore) {
        if (mode !== null) {
          await chmod(path, mode);
        }
        return;
      }
      if (content === null) {
        if (existsSync(path)) {
          await rm(path, { force: true });
        }
        return;
      }
      await writeFile(path, content, "utf8");
      if (mode !== null) {
        await chmod(path, mode);
      }
    };

    await restoreFile(profilePath, originalProfile, originalProfileMode, originalProfileExists);
    await restoreFile(keyFilePath, originalKeyFile, originalKeyMode, originalKeyExists);
    await restoreFile(gitignorePath, originalGitignore, originalGitignoreMode, originalGitignoreExists);
  };

  try {
    if (gitignoreDirty) {
      const nextIgnore = `${originalGitignore ?? ""}${originalGitignore && !originalGitignore.endsWith("\n") ? "\n" : ""}${ignoreLine}\n`;
      await writeFile(gitignorePath, nextIgnore, "utf8");
    }

    const cliEntry = require.resolve("@dotenvx/dotenvx/package.json");
    const cliPath = join(dirname(cliEntry), "src", "cli", "dotenvx.js");
    const childEnv = { ...process.env, ...inheritedEnv };
    for (const key of Object.keys(childEnv)) {
      if (isDotenvCredentialName(key) || isDotenvRuntimeKey(key)) {
        delete childEnv[key];
      }
    }
    if (inheritedEnv.DOTENVX_NO_NATIVE === "1" || inheritedEnv.DOTENVX_NO_NATIVE === "true") {
      execFileSync(process.execPath, [cliPath, "encrypt", "-f", profilePath, "-fk", keyFilePath, "--no-native"], {
        cwd: root,
        env: childEnv,
        stdio: "pipe",
      });
    } else {
      execFileSync(process.execPath, [cliPath, "encrypt", "-f", profilePath, "-fk", keyFilePath], {
        cwd: root,
        env: childEnv,
        stdio: "pipe",
      });
    }
  } catch (err) {
    await rollback();
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      path: toRelative(root, profilePath),
      ready: false,
      revision: sha1(""),
      message,
    };
  }

  if (existsSync(keyFilePath)) {
    await chmod(keyFilePath, 0o600);
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
