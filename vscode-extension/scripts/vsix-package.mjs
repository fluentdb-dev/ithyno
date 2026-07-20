// SPDX-License-Identifier: GPL-3.0-or-later
// Produce a versioned VSIX: ithyno-<version>.vsix
// Invoked by the "package" npm script in vscode-extension/package.json.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const extRoot = resolve(here, "..");
const pkg = JSON.parse(readFileSync(resolve(extRoot, "package.json"), "utf8"));
const version = pkg.version;
const outFile = `ithyno-${version}.vsix`;

console.log(`[vsix-package] packaging → ${outFile}`);
execSync(
  `npx vsce package --no-dependencies --allow-missing-repository --no-rewrite-relative-links --out ${outFile}`,
  { cwd: extRoot, stdio: "inherit" }
);
console.log(`[vsix-package] done: ${outFile}`);
