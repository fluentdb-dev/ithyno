// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shared About constants and pure derivation logic.
 *
 * This module contains NO Node.js-specific imports so it can be consumed by
 * any surface (HTTP server, Electron main, VS Code extension) that can read a
 * parsed package.json object.
 *
 * UPDATE ALL PARALLEL COPIES when changing SPONSORS or LICENSE_URL:
 *   - server/about-config.ts       ← this file (server / web surface)
 *   - electron/src/about-config.ts ← Electron shell
 *   - vscode-extension/src/about-config.ts ← VS Code extension
 */

export type SponsorLink = {
  label: string;
  url: string;
};

export type AboutInfo = {
  name: string;
  version: string;
  license: string;
  description: string;
  repositoryUrl: string;
  issuesUrl: string;
  releasesUrl: string;
  licenseUrl: string;
  sponsors: SponsorLink[];
};

/**
 * Sponsor entries rendered on all About surfaces.
 * Append new entries here — no per-surface client change needed.
 */
export const SPONSORS: SponsorLink[] = [
  { label: "Ko-fi", url: "https://ko-fi.com/hamnbeans" },
];

export const LICENSE_URL = "https://www.gnu.org/licenses/gpl-3.0.html";

/** Fallback repository URL when package.json has no repository field. */
export const REPO_URL = "https://github.com/fluentdb-dev/ithyno";

/**
 * Derive the URL fields from a parsed package.json shape.
 * Returns repositoryUrl, issuesUrl, and releasesUrl.
 */
export function deriveUrls(pkg: {
  repository?: { url?: string } | string;
  bugs?: { url?: string } | string;
}): { repositoryUrl: string; issuesUrl: string; releasesUrl: string } {
  const repositoryUrl =
    typeof pkg.repository === "string"
      ? pkg.repository
      : (pkg.repository?.url ?? REPO_URL);

  const issuesUrl =
    typeof pkg.bugs === "string"
      ? pkg.bugs
      : (pkg.bugs?.url ?? `${repositoryUrl}/issues`);

  const releasesUrl = `${repositoryUrl}/releases/latest`;

  return { repositoryUrl, issuesUrl, releasesUrl };
}

/**
 * Build a complete AboutInfo from a parsed package.json shape.
 */
export function buildAboutInfo(pkg: {
  name?: string;
  version?: string;
  license?: string;
  description?: string;
  repository?: { url?: string } | string;
  bugs?: { url?: string } | string;
}): AboutInfo {
  const { repositoryUrl, issuesUrl, releasesUrl } = deriveUrls(pkg);
  return {
    name: pkg.name ?? "ithyno",
    version: pkg.version ?? "0.0.0",
    license: pkg.license ?? "GPL-3.0-or-later",
    description: pkg.description ?? "",
    repositoryUrl,
    issuesUrl,
    releasesUrl,
    licenseUrl: LICENSE_URL,
    sponsors: SPONSORS,
  };
}
