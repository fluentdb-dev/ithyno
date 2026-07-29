#!/usr/bin/env node
// Dry-run archive rebuild check.
//
// Simulates what `openspec archive <id>` does at its rebuild-validate step,
// but writes nothing. Iterates every in-flight change under
// `openspec/changes/` that carries a spec delta, applies the delta to the
// current spec in-memory, and runs `validateSpecContent` on the rebuilt
// content. Reports pass/fail per change.
//
// Purpose: prove that `fix-pending-annotation-parser-compat` unblocks the
// archive path for every in-flight change without actually archiving them.
//
// Usage: node scripts/verify-archive-rebuild.mjs
import { readdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGES = join(REPO, "openspec", "changes");

// The package's exports map doesn't expose subpaths, so import via
// absolute file URL.
const OS_DIST = join(REPO, "node_modules", "@fission-ai", "openspec", "dist", "core");
const { findSpecUpdates, buildUpdatedSpec } = await import(
  pathToFileURL(join(OS_DIST, "specs-apply.js")).href
);
const { Validator } = await import(
  pathToFileURL(join(OS_DIST, "validation", "validator.js")).href
);

async function listChanges() {
  const out = [];
  for (const entry of await readdir(CHANGES)) {
    if (entry === "archive") continue;
    const path = join(CHANGES, entry);
    if ((await stat(path)).isDirectory()) out.push(entry);
  }
  return out.sort();
}

const validator = new Validator();
const rows = [];
let failed = 0;

for (const changeName of await listChanges()) {
  const changeDir = join(CHANGES, changeName);
  const mainSpecsDir = join(REPO, "openspec", "specs");
  const updates = await findSpecUpdates(changeDir, mainSpecsDir);
  if (updates.length === 0) {
    rows.push({ change: changeName, specs: "-", status: "no-delta", detail: "" });
    continue;
  }
  for (const update of updates) {
    const specName = update.target.split("/").at(-2);
    try {
      const { rebuilt } = await buildUpdatedSpec(update, changeName);
      const report = await validator.validateSpecContent(specName, rebuilt);
      if (report.valid) {
        rows.push({ change: changeName, specs: specName, status: "PASS", detail: "" });
      } else {
        const errs = report.issues
          .filter((i) => i.level === "ERROR")
          .map((i) => i.message)
          .slice(0, 3);
        rows.push({ change: changeName, specs: specName, status: "FAIL", detail: errs.join(" | ") });
        failed++;
      }
    } catch (err) {
      rows.push({
        change: changeName,
        specs: specName,
        status: "ERROR",
        detail: String(err.message ?? err).slice(0, 200),
      });
      failed++;
    }
  }
}

for (const r of rows) {
  const glyph = r.status === "PASS" ? "✓" : r.status === "no-delta" ? "·" : "✗";
  console.log(
    `${glyph} ${r.change.padEnd(50)} ${String(r.specs).padEnd(20)} ${r.status}${r.detail ? "  — " + r.detail : ""}`,
  );
}
const pass = rows.filter((r) => r.status === "PASS").length;
const nodelta = rows.filter((r) => r.status === "no-delta").length;
console.log(`\n${rows.length} rows: ${pass} PASS, ${failed} FAIL/ERROR, ${nodelta} no-delta`);
process.exit(failed > 0 ? 1 : 0);
