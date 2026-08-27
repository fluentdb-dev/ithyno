// SPDX-License-Identifier: GPL-3.0-or-later
import { chmodSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export const PLATFORM_ESBUILD_PACKAGES = [
  "@esbuild/darwin-arm64",
  "@esbuild/darwin-x64",
  "@esbuild/linux-x64",
  "@esbuild/linux-arm64",
  "@esbuild/win32-x64",
  "@esbuild/win32-arm64",
];

const ESBUILD_SCOPE_PATHS = [
  ["@esbuild"],
  ["esbuild", "node_modules", "@esbuild"],
];

function readPackageVersion(packageJsonPath, packageName) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(
      `cannot read ${packageName} version at ${packageJsonPath}; install repository dependencies before packaging: ${error.message}`,
    );
  }

  if (typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error(`${packageName} at ${packageJsonPath} has no valid version`);
  }
  return parsed.version;
}

export function resolveAuthoritativeEsbuildVersion(repoRoot) {
  return readPackageVersion(
    resolve(repoRoot, "node_modules", "esbuild", "package.json"),
    "the lockfile-backed root esbuild package",
  );
}

export function createEsbuildRuntimeDependencies(version) {
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("an authoritative esbuild version is required");
  }

  return Object.fromEntries([
    ["esbuild", version],
    ...PLATFORM_ESBUILD_PACKAGES.map((packageName) => [packageName, version]),
  ]);
}

export function assertEsbuildRuntimeVersions(nodeModulesDir, expectedVersion) {
  const packageNames = ["esbuild", ...PLATFORM_ESBUILD_PACKAGES];

  for (const packageName of packageNames) {
    const packageJsonPath = resolve(nodeModulesDir, ...packageName.split("/"), "package.json");
    const actualVersion = readPackageVersion(packageJsonPath, packageName);
    if (actualVersion !== expectedVersion) {
      throw new Error(
        `${packageName} version ${actualVersion} does not match expected esbuild version ${expectedVersion}`,
      );
    }
  }

  return packageNames;
}

/**
 * Restore executable modes that npm can omit for packages installed for a
 * platform other than the packaging host. VSIX preserves these modes in its
 * ZIP metadata, so this must run before `vsce package`.
 */
export function normalizeEsbuildBinaryPermissions(nodeModulesDir) {
  const normalized = [];

  for (const segments of ESBUILD_SCOPE_PATHS) {
    const scopeDir = resolve(nodeModulesDir, ...segments);
    if (!existsSync(scopeDir)) continue;

    for (const packageName of readdirSync(scopeDir)) {
      const binary = resolve(scopeDir, packageName, "bin", "esbuild");
      if (!existsSync(binary)) continue;

      chmodSync(binary, 0o755);
      normalized.push(binary);
    }
  }

  return normalized;
}
