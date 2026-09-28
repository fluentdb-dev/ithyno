// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type InitPackageSource =
  | { kind: "release" }
  | { kind: "bundled"; relativePath: string };

/**
 * Resolve the package installed by the New Project initialization chain.
 *
 * F5 development runs directly from the checkout. Installed VSIX builds use
 * the explicit manifest emitted by prepack: local/debug packages carry their
 * own tarball, while release packages resolve the matching GitHub asset in the
 * shared initialization chain.
 */
export function resolveInitPackageSpec(
  packageRoot: string,
  development: boolean,
): string | undefined {
  if (development) return packageRoot;

  const manifestPath = resolve(packageRoot, "init-package-source.json");
  if (!existsSync(manifestPath)) return undefined;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as InitPackageSource;
  if (manifest.kind === "release") return undefined;
  if (manifest.kind === "bundled" && typeof manifest.relativePath === "string") {
    const bundled = resolve(packageRoot, manifest.relativePath);
    if (!existsSync(bundled)) {
      throw new Error(`bundled init package is missing: ${bundled}`);
    }
    return bundled;
  }
  throw new Error(`unsupported init package source manifest: ${manifestPath}`);
}
