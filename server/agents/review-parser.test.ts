// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReviewContent, parseReview } from "./review-parser.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-review-parser-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeReview(changeId: string, content: string): void {
  const changeDir = join(dir, "openspec", "changes", changeId);
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, "review.md"), content);
}

describe("parseReviewContent — happy paths", () => {
  it("parses a minimal pass verdict", () => {
    const raw = ["---", "verdict: pass", "---", ""].join("\n");
    const out = parseReviewContent(raw);
    expect(out).not.toBeNull();
    expect(out!.verdict).toBe("pass");
    expect(out!.findings).toEqual([]);
    expect(out!.body).toBe("");
  });

  it("parses needs-rework with 2 findings", () => {
    const raw = [
      "---",
      "verdict: needs-rework",
      "findings:",
      "  - file: server/foo.ts",
      "    line: 42",
      "    severity: high",
      "    message: Off-by-one in the loop bound",
      "  - file: web/src/bar.tsx",
      "    line: 15",
      "    severity: medium",
      "    message: Missing null check on props.value",
      "---",
      "",
      "## Notes",
      "reviewer's narrative here",
      "",
    ].join("\n");
    const out = parseReviewContent(raw);
    expect(out).not.toBeNull();
    expect(out!.verdict).toBe("needs-rework");
    expect(out!.findings).toHaveLength(2);
    expect(out!.findings[0]).toEqual({
      severity: "high",
      message: "Off-by-one in the loop bound",
      file: "server/foo.ts",
      line: 42,
    });
    expect(out!.findings[1]).toEqual({
      severity: "medium",
      message: "Missing null check on props.value",
      file: "web/src/bar.tsx",
      line: 15,
    });
    expect(out!.body).toContain("## Notes");
    expect(out!.body).toContain("reviewer's narrative here");
  });

  it("accepts a summary field", () => {
    const raw = [
      "---",
      "verdict: pass",
      "summary: Looks good, no blockers.",
      "---",
      "",
    ].join("\n");
    const out = parseReviewContent(raw);
    expect(out).not.toBeNull();
    expect(out!.summary).toBe("Looks good, no blockers.");
  });

  it("preserves body without frontmatter", () => {
    const raw = [
      "---",
      "verdict: pass",
      "---",
      "",
      "Some notes here",
      "with multiple lines",
      "",
    ].join("\n");
    const out = parseReviewContent(raw);
    expect(out).not.toBeNull();
    expect(out!.body).toContain("Some notes here");
    expect(out!.body).toContain("with multiple lines");
  });

  it("ignores unknown top-level keys (forward compat)", () => {
    const raw = [
      "---",
      "verdict: pass",
      "future_field: something",
      "another_new_key:",
      "  nested: value",
      "---",
      "",
    ].join("\n");
    const out = parseReviewContent(raw);
    expect(out).not.toBeNull();
    expect(out!.verdict).toBe("pass");
  });

  it("finding without file/line is valid", () => {
    const raw = [
      "---",
      "verdict: needs-rework",
      "findings:",
      "  - severity: low",
      "    message: Minor style nit somewhere",
      "---",
      "",
    ].join("\n");
    const out = parseReviewContent(raw);
    expect(out).not.toBeNull();
    expect(out!.findings).toHaveLength(1);
    expect(out!.findings[0]).toEqual({
      severity: "low",
      message: "Minor style nit somewhere",
    });
  });
});

describe("parseReviewContent — rejections", () => {
  it("returns null when frontmatter is absent", () => {
    const raw = "just some text\nno frontmatter here\n";
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when verdict is missing", () => {
    const raw = ["---", "summary: no verdict here", "---", ""].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when verdict is not in enum", () => {
    const raw = ["---", "verdict: maybe", "---", ""].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when findings is not an array", () => {
    const raw = ["---", "verdict: pass", "findings: not-an-array", "---", ""].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when a finding has an invalid severity", () => {
    const raw = [
      "---",
      "verdict: needs-rework",
      "findings:",
      "  - severity: critical",
      "    message: nope",
      "---",
      "",
    ].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when a finding message is empty", () => {
    const raw = [
      "---",
      "verdict: needs-rework",
      "findings:",
      "  - severity: high",
      '    message: ""',
      "---",
      "",
    ].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when a finding line is non-integer", () => {
    const raw = [
      "---",
      "verdict: needs-rework",
      "findings:",
      "  - severity: high",
      "    message: something",
      "    line: 1.5",
      "---",
      "",
    ].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when a finding line is negative", () => {
    const raw = [
      "---",
      "verdict: needs-rework",
      "findings:",
      "  - severity: high",
      "    message: something",
      "    line: -1",
      "---",
      "",
    ].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });

  it("returns null when summary is not a string", () => {
    const raw = ["---", "verdict: pass", "summary:", "  nested: value", "---", ""].join("\n");
    expect(parseReviewContent(raw)).toBeNull();
  });
});

describe("parseReview — filesystem paths", () => {
  it("reads and parses a valid review.md from disk", async () => {
    makeReview("add-foo", ["---", "verdict: pass", "---", ""].join("\n"));
    const out = await parseReview(dir, "add-foo");
    expect(out).not.toBeNull();
    expect(out!.verdict).toBe("pass");
  });

  it("returns null when the file is absent", async () => {
    const out = await parseReview(dir, "no-such-change");
    expect(out).toBeNull();
  });

  it("returns null when the file has invalid frontmatter", async () => {
    makeReview("add-bar", ["---", "verdict: broken", "---", ""].join("\n"));
    const out = await parseReview(dir, "add-bar");
    expect(out).toBeNull();
  });
});
