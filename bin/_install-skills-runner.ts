#!/usr/bin/env -S npx tsx
// SPDX-License-Identifier: GPL-3.0-or-later
// Thin runner for `ithyno install-skills [--force]` and
// `ithyno uninstall-skills`. Landed by unify-ithyno-slash-command-surface.

import { installIthyOpsxSkills, uninstallIthyOpsxSkills } from "../server/install-skills.js";

const mode = process.argv[2];
const force = process.argv.includes("--force");

async function main(): Promise<number> {
  if (mode === "install") {
    const rep = await installIthyOpsxSkills({ force });
    console.log(
      `installed=${rep.installed} updated=${rep.updated} skipped=${rep.skipped} ` +
        `user-modified=${rep.userModified} removed=${rep.removed}`,
    );
    if (rep.userModified > 0) {
      console.log(
        `  user-modified files preserved: ${rep.manifest.files
          .filter((e) => e.status === "user-modified")
          .map((e) => e.path)
          .join(", ")}`,
      );
    }
    if (rep.errors.length > 0) {
      console.error(`errors: ${rep.errors.join("; ")}`);
      return 1;
    }
    return 0;
  }
  if (mode === "uninstall") {
    const rep = await uninstallIthyOpsxSkills();
    console.log(`removed=${rep.removed} already-gone=${rep.alreadyGone}`);
    if (rep.errors.length > 0) {
      console.error(`errors: ${rep.errors.join("; ")}`);
      return 1;
    }
    return 0;
  }
  console.error(`unknown mode: ${mode}`);
  return 2;
}

main().then((code) => process.exit(code)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
