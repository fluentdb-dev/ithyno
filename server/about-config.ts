// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shared About constants and pure derivation logic.
 *
 * This module contains NO Node.js-specific imports so it can be consumed by
 * any surface (HTTP server, Electron main, VS Code extension) that can read a
 * parsed package.json object.
 *
 * This file is the SINGLE SOURCE OF TRUTH for all About constants.
 * The sync script (scripts/sync-about-config.mjs) copies it verbatim into:
 *   - electron/src/about-config.ts          (generated; gitignored)
 *   - vscode-extension/src/about-config.ts  (generated; gitignored)
 *
 * To add a new sponsor, change a URL, or update the canonical description:
 * edit only THIS file and run `node scripts/sync-about-config.mjs` (or just
 * rebuild — the sync runs automatically before tsc in every surface).
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
 * Canonical product description from the root package.json.
 * Surfaces that read a surface-local package.json (e.g. the VS Code extension)
 * should override `pkg.description` with this constant so all About panels
 * show the same description regardless of which package.json was loaded.
 */
export const ROOT_DESCRIPTION =
  "Local dashboard for OpenSpec — dispatches propose / apply / review / verify skills to AI CLI agents.";

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
    description: pkg.description ?? ROOT_DESCRIPTION,
    repositoryUrl,
    issuesUrl,
    releasesUrl,
    licenseUrl: LICENSE_URL,
    sponsors: SPONSORS,
  };
}
