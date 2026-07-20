// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shared About payload derived from the root package.json.
 * All three UI surfaces (web dashboard, Electron shell, VS Code extension)
 * read from the same source so version, license, and URLs cannot drift.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

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

/** Initial sponsors list. Append new entries here — no client-side code change needed. */
const SPONSORS: SponsorLink[] = [
  { label: "Ko-fi", url: "https://ko-fi.com/hamnbeans" },
];

const LICENSE_URL = "https://www.gnu.org/licenses/gpl-3.0.html";

let _aboutInfo: AboutInfo | null = null;

/**
 * Returns a singleton AboutInfo derived from the root package.json.
 * Reads once and caches so all callers see the same object.
 */
export function getAboutInfo(): AboutInfo {
  if (_aboutInfo) return _aboutInfo;

  const raw = readFileSync(resolve(PKG_ROOT, "package.json"), "utf-8");
  const pkg = JSON.parse(raw) as {
    name?: string;
    version?: string;
    license?: string;
    description?: string;
    repository?: { url?: string } | string;
    bugs?: { url?: string } | string;
  };

  const repositoryUrl =
    typeof pkg.repository === "string"
      ? pkg.repository
      : (pkg.repository?.url ?? "https://github.com/fluentdb-dev/ithyno");

  const issuesUrl =
    typeof pkg.bugs === "string"
      ? pkg.bugs
      : (pkg.bugs?.url ?? `${repositoryUrl}/issues`);

  const releasesUrl = `${repositoryUrl}/releases/latest`;

  _aboutInfo = {
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

  return _aboutInfo;
}
