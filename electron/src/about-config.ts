// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Electron-side mirror of server/about-config.ts.
 *
 * The electron build compiles to its own isolated CommonJS bundle and cannot
 * import directly from server/ (separate rootDir). This file replicates the
 * same constants and derivation logic so sponsors and URL constants have a
 * single point of change PER SURFACE — and both surfaces agree on the same
 * values.
 *
 * KEEP IN SYNC with:
 *   - server/about-config.ts          (server / web surface — source of truth for constants)
 *   - vscode-extension/src/about-config.ts (VS Code surface)
 *
 * To add a new sponsor: append to SPONSORS in all three files.
 */

export type SponsorLink = { label: string; url: string };

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
 * Append new entries here — no further client code change needed.
 * SOURCE OF TRUTH: server/about-config.ts SPONSORS array.
 */
export const SPONSORS: SponsorLink[] = [
  { label: 'Ko-fi', url: 'https://ko-fi.com/hamnbeans' },
];

export const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html';

/** Fallback repository URL when package.json has no repository field. */
export const REPO_URL = 'https://github.com/fluentdb-dev/ithyno';

/**
 * Derive the URL fields from a parsed package.json shape.
 */
export function deriveUrls(pkg: {
  repository?: { url?: string } | string;
  bugs?: { url?: string } | string;
}): { repositoryUrl: string; issuesUrl: string; releasesUrl: string } {
  const repositoryUrl =
    typeof pkg.repository === 'string'
      ? pkg.repository
      : (pkg.repository?.url ?? REPO_URL);

  const issuesUrl =
    typeof pkg.bugs === 'string'
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
    name: pkg.name ?? 'ithyno',
    version: pkg.version ?? '0.0.0',
    license: pkg.license ?? 'GPL-3.0-or-later',
    description: pkg.description ?? '',
    repositoryUrl,
    issuesUrl,
    releasesUrl,
    licenseUrl: LICENSE_URL,
    sponsors: SPONSORS,
  };
}
