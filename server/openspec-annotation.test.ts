// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Spec-lint: every `### Requirement:` block under `openspec/specs/**\/spec.md`
 * SHALL have SHALL or MUST on its first non-empty, non-metadata content line.
 *
 * Enforced by fix-pending-annotation-parser-compat because the openspec CLI
 * parser (`parseRequirements` in
 * `@fission-ai/openspec/dist/core/parsers/markdown-parser.js`) captures the
 * first non-empty line as the requirement's `text` field, and
 * `RequirementSchema` requires SHALL/MUST there. A PENDING annotation in the
 * pre-body position swallows the check, breaking `openspec archive` for every
 * unrelated change on the same capability. This test blocks that regression
 * at CI time.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SPECS_ROOT = new URL("../openspec/specs/", import.meta.url).pathname;

function findSpecMdFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...findSpecMdFiles(full));
    else if (entry === "spec.md") out.push(full);
  }
  return out;
}

/** Mirror of openspec's `parseRequirements` first-line rule + `extractRequirementText`
 *  metadata-skip: first non-empty, non-`**Key**:` line before any `####` header. */
function firstRequirementLine(blockBody: string): string | undefined {
  for (const line of blockBody.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) break; // scenario header
    if (/^\*\*[^*]+\*\*:/.test(trimmed)) continue; // metadata
    return trimmed;
  }
  return undefined;
}

type Offender = { file: string; requirement: string; firstLine: string };

describe("openspec/specs/**/spec.md — requirement first-line SHALL/MUST", () => {
  const files = findSpecMdFiles(SPECS_ROOT);

  it("at least one spec.md exists (self-check)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every requirement's first non-empty content line contains SHALL or MUST", () => {
    const offenders: Offender[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      // Split at each `### Requirement: ` marker (line start).
      const parts = content.split(/\n(?=### Requirement: )/);
      for (const part of parts) {
        if (!/^### Requirement: /.test(part)) continue;
        const [header, ...rest] = part.split("\n");
        const body = rest.join("\n");
        const first = firstRequirementLine(body);
        if (!first) {
          offenders.push({
            file: file.replace(SPECS_ROOT, ""),
            requirement: header.replace(/^### Requirement:\s*/, ""),
            firstLine: "(no content)",
          });
          continue;
        }
        if (!/\b(SHALL|MUST)\b/.test(first)) {
          offenders.push({
            file: file.replace(SPECS_ROOT, ""),
            requirement: header.replace(/^### Requirement:\s*/, ""),
            firstLine: first.slice(0, 120),
          });
        }
      }
    }
    if (offenders.length > 0) {
      const detail = offenders
        .map(
          (o) =>
            `  - ${o.file} :: ${o.requirement}\n      first content line: ${JSON.stringify(o.firstLine)}\n      → move any PENDING annotation to AFTER the SHALL/MUST body paragraph (before any #### Scenario: header).`,
        )
        .join("\n");
      throw new Error(
        `${offenders.length} requirement(s) violate the first-line SHALL/MUST rule:\n${detail}`,
      );
    }
  });

  it("synthetic fixture: PENDING annotation before SHALL body triggers the rule", () => {
    const badFixture = `### Requirement: Sample

> ⚠️ **PENDING MODIFIED** by [some-change](../../changes/some-change/): reason.

The system SHALL do X.

#### Scenario: sample
- **WHEN** invoked
- **THEN** the fixture is rejected
`;
    // Simulate the same first-line extraction.
    const bodyStart = badFixture.split("\n").slice(1).join("\n"); // drop header
    const first = firstRequirementLine(bodyStart);
    expect(first).toBeDefined();
    expect(/\b(SHALL|MUST)\b/.test(first!)).toBe(false);
  });

  it("synthetic fixture: PENDING annotation after SHALL body passes the rule", () => {
    const goodFixture = `### Requirement: Sample

The system SHALL do X.

> ⚠️ **PENDING MODIFIED** by [some-change](../../changes/some-change/): reason.

#### Scenario: sample
- **WHEN** invoked
- **THEN** the fixture is accepted
`;
    const bodyStart = goodFixture.split("\n").slice(1).join("\n");
    const first = firstRequirementLine(bodyStart);
    expect(first).toBeDefined();
    expect(/\b(SHALL|MUST)\b/.test(first!)).toBe(true);
  });
});
