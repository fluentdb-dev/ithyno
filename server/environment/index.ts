// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parse as parseDotenvx } from "@dotenvx/dotenvx";

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

const STATE_PATH = ".ithyno/environment.json";
const RESERVED_PREFIX = "ITHYNO_";

function toRelative(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).replace(/\\/g, "/");
}

function maskValue(value: string): string {
  if (value.length === 0) return "";
  return "*".repeat(Math.min(8, Math.max(1, value.length)));
}

function normalizeProfileName(profile: string): string {
  const trimmed = profile.trim();
  if (!trimmed) return "default";
  if (trimmed === "default") return "default";
  if (trimmed === "local") return "local";
  return trimmed.replace(/^\.env\./, "").replace(/^\.env$/, "default");
}

function resolveProfilePath(projectRoot: string, profile: string | null): string | null {
  if (!profile) return null;
  const normalized = normalizeProfileName(profile);
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
      selectedProfile: parsed.selectedProfile ?? null,
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
    selectedProfile: selection.selectedProfile ?? null,
    preferences: selection.preferences ?? {},
  };
  await writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function discoverDevelopmentProfiles(projectRoot: string): DevelopmentEnvironmentProfile[] {
  const root = resolve(projectRoot);
  const profiles: DevelopmentEnvironmentProfile[] = [];
  const files = existsSync(root) ? readdirSync(root, { withFileTypes: true }) : [];
  const seen = new Set<string>();

  const addProfile = (name: string, path: string, isBase: boolean): void => {
    if (seen.has(name)) return;
    seen.add(name);
    profiles.push({ name, path: toRelative(root, path), exists: existsSync(path), isBase, selected: false });
  };

  if (existsSync(join(root, ".env"))) {
    addProfile("default", join(root, ".env"), true);
  }
  if (existsSync(join(root, ".env.local"))) {
    addProfile("local", join(root, ".env.local"), false);
  }
  for (const entry of files) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith(".env.")) continue;
    const name = entry.name.slice(5);
    if (name === "local") continue;
    addProfile(name, join(root, entry.name), false);
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

async function collectResolvedEnvironment(
  projectRoot: string,
  selection: DevelopmentEnvironmentSelection,
): Promise<{
  orderedFiles: string[];
  env: Record<string, string>;
  diagnostics: EnvironmentDiagnostic[];
  variableEntries: DevelopmentEnvironmentVariable[];
  encryptionSources: string[];
  profiles: DevelopmentEnvironmentProfile[];
}> {
  const root = resolve(projectRoot);
  const profiles = discoverDevelopmentProfiles(root);
  const orderedFiles: string[] = [];
  const diagnostics: EnvironmentDiagnostic[] = [];
  const env: Record<string, string> = {};
  const variableEntries: DevelopmentEnvironmentVariable[] = [];
  const selectedProfile = selection.selectedProfile ? normalizeProfileName(selection.selectedProfile) : null;

  const addFile = (filePath: string): void => {
    if (!orderedFiles.includes(filePath)) orderedFiles.push(filePath);
  };

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

  for (const profile of profiles) {
    if (selectedProfile && profile.name === selectedProfile) {
      profile.selected = true;
    }
  }

  const encryptionSources: string[] = [];
  const encryptionKeys = [
    process.env.DOTENVX_KEY,
    process.env.DOTENVX_KEYS,
    process.env.DOTENVX_KEY_FILE,
  ].filter((value): value is string => Boolean(value));
  if (encryptionKeys.length > 0) {
    encryptionSources.push(...encryptionKeys);
  }

  for (const filePath of orderedFiles) {
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
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith(RESERVED_PREFIX)) continue;
        env[key] = value;
        variableEntries.push({
          key,
          maskedValue: maskValue(value),
          source: toRelative(root, filePath),
          sourcePath: filePath,
          reserved: false,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        kind: "unsupported-syntax",
        severity: "error",
        message: `Unable to parse ${toRelative(root, filePath)}: ${message}`,
        path: toRelative(root, filePath),
      });
    }
  }

  return { orderedFiles, env, diagnostics, variableEntries, encryptionSources, profiles };
}

export async function composeDevelopmentEnvironment(
  projectRoot: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<DevelopmentEnvironmentState> {
  void inheritedEnv;
  const root = resolve(projectRoot);
  const selection = await readEnvironmentSelection(root);
  const { orderedFiles, env, diagnostics, variableEntries, encryptionSources, profiles } = await collectResolvedEnvironment(root, selection);
  const resolvedEntries = Object.entries(env).sort(([a], [b]) => a.localeCompare(b));
  const state: DevelopmentEnvironmentState = {
    projectRoot: root,
    profiles,
    selection,
    orderedFiles: orderedFiles.map((filePath) => toRelative(root, filePath)),
    variables: resolvedEntries.map(([key, value]) => {
      const found = variableEntries.find((item) => item.key === key);
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
    revision: sha1(JSON.stringify({ selection, orderedFiles: orderedFiles.map((filePath) => toRelative(root, filePath)), env: resolvedEntries })),
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
  const { env } = await collectResolvedEnvironment(root, selection);
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

export async function mutateEnvironmentFile(
  projectRoot: string,
  payload: DevelopmentEnvironmentMutation,
): Promise<{ revision: string; path: string; wrote: boolean }> {
  const root = resolve(projectRoot);
  const profilePath = resolveProfilePath(root, payload.profile);
  if (!profilePath || !isInsideProjectRoot(root, profilePath)) {
    throw new Error("Invalid profile target");
  }
  const targetPath = profilePath;
  await mkdir(dirname(targetPath), { recursive: true });
  const exists = existsSync(targetPath);
  const currentContent = exists ? await readFile(targetPath, "utf8") : "";
  const currentRevision = sha1(currentContent);
  if (payload.revision && payload.revision !== currentRevision) {
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
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match) {
      nextLines.push(line);
      continue;
    }
    const key = match[1];
    if (removals.has(key)) continue;
    if (entries.has(key)) {
      const value = entries.get(key) ?? "";
      nextLines.push(`${key}=${value}`);
      entries.delete(key);
      continue;
    }
    nextLines.push(line);
  }

  for (const [key, value] of entries.entries()) {
    nextLines.push(`${key}=${value}`);
  }
  const nextContent = nextLines.join("\n");
  const tmpPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, nextContent, { encoding: "utf8", mode: 0o600 });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, targetPath);
  return { revision: sha1(nextContent), path: toRelative(root, targetPath), wrote: true };
}

export async function getEnvironmentSnapshot(
  projectRoot: string,
  inheritedEnv: NodeJS.ProcessEnv = process.env,
): Promise<DevelopmentEnvironmentState> {
  return composeDevelopmentEnvironment(projectRoot, inheritedEnv);
}
