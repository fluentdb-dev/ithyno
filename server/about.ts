// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Shared About payload derived from the root package.json.
 * All three UI surfaces (web dashboard, Electron shell, VS Code extension)
 * read from the same source so version, license, and URLs cannot drift.
 *
 * Sponsors list and URL constants live in ./about-config.ts — edit there to
 * add new sponsor entries without touching any surface-specific code.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAboutInfo, type AboutInfo, type SponsorLink } from "./about-config.js";

export type { SponsorLink, AboutInfo };

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");

let _aboutInfo: AboutInfo | null = null;

/**
 * Returns a singleton AboutInfo derived from the root package.json.
 * Reads once and caches so all callers see the same object.
 */
export function getAboutInfo(): AboutInfo {
  if (_aboutInfo) return _aboutInfo;

  const raw = readFileSync(resolve(PKG_ROOT, "package.json"), "utf-8");
  const pkg = JSON.parse(raw) as Parameters<typeof buildAboutInfo>[0];

  _aboutInfo = buildAboutInfo(pkg);
  return _aboutInfo;
}
