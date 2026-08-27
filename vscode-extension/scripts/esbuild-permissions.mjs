// SPDX-License-Identifier: GPL-3.0-or-later
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ESBUILD_SCOPE_PATHS = [
  ["@esbuild"],
  ["esbuild", "node_modules", "@esbuild"],
];

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
