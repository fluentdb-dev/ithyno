// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { setCheckbox, isCheckboxLine, applyToggle, CHECKBOX_RE } from "./surgicalEdit.js";
import { sha1 } from "../util/hash.js";

describe("CHECKBOX_RE / setCheckbox (strict marker-only rewrite)", () => {
  it("checks a standard dash task", () => {
    expect(setCheckbox("- [ ] 1.1 Do the thing", true)).toBe("- [x] 1.1 Do the thing");
  });

  it("unchecks a completed task", () => {
    expect(setCheckbox("- [x] 1.1 Do the thing", false)).toBe("- [ ] 1.1 Do the thing");
  });

  it("preserves leading indentation (nested task)", () => {
    expect(setCheckbox("  - [ ] 2.1 Nested", true)).toBe("  - [x] 2.1 Nested");
  });

  it("preserves TAB indentation", () => {
    expect(setCheckbox("\t- [ ] tabbed", true)).toBe("\t- [x] tabbed");
  });

  it("supports the * list marker", () => {
    expect(setCheckbox("* [ ] star marker", true)).toBe("* [x] star marker");
  });

  it("reads an uppercase X as checked and normalizes to lowercase on rewrite", () => {
    expect(isCheckboxLine("- [X] already done")).toBe(true);
    expect(setCheckbox("- [X] already done", false)).toBe("- [ ] already done");
  });

  it("does NOT match plain text or non-task bullets", () => {
    expect(isCheckboxLine("- just a bullet")).toBe(false);
    expect(isCheckboxLine("some [ ] text")).toBe(false);
    expect(CHECKBOX_RE.test("## 1. A heading")).toBe(false);
  });

  it("never touches the continuation line of a multi-line task", () => {
    const continuation = "      (Note: Use OKLCH color space)";
    expect(isCheckboxLine(continuation)).toBe(false);
    expect(setCheckbox(continuation, true)).toBe(continuation);
  });
});

const DOC = `# Tasks

## 1. Setup
- [ ] 1.1 First task
      (Note: keep this continuation line intact)
- [x] 1.2 Second task

## 2. Build
- [ ] 2.1 Third task
`;

describe("applyToggle — multi-line task preservation", () => {
  it("checks a task without disturbing its continuation line", () => {
    const res = applyToggle(DOC, {
      line: 3, // "- [ ] 1.1 First task"
      expectedText: "- [ ] 1.1 First task",
      baseHash: sha1(DOC),
      desiredChecked: true,
    });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.newContent).toContain("- [x] 1.1 First task");
    expect(res.newContent).toContain("(Note: keep this continuation line intact)");
  });
});

describe("applyToggle — optimistic lock & expectedText fallback (§6.2)", () => {
  it("fast path: edits the given line when the hash matches", () => {
    const res = applyToggle(DOC, {
      line: 8, // "- [ ] 2.1 Third task"
      expectedText: "- [ ] 2.1 Third task",
      baseHash: sha1(DOC),
      desiredChecked: true,
    });
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.editedLine).toBe(8);
  });

  it("absorbs line drift: hash mismatch but expectedText still found (lines inserted above)", () => {
    const shifted = "<!-- AI inserted a note at the top -->\n" + DOC;
    const res = applyToggle(shifted, {
      line: 3, // stale index from before the insertion
      expectedText: "- [ ] 1.1 First task",
      baseHash: sha1(DOC), // stale hash
      desiredChecked: true,
    });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.editedLine).toBe(4); // relocated +1
    expect(res.newContent).toContain("- [x] 1.1 First task");
  });

  it("returns conflict when the target task line itself was rewritten", () => {
    const rewritten = DOC.replace("- [ ] 1.1 First task", "- [ ] 1.1 First task RENAMED");
    const res = applyToggle(rewritten, {
      line: 3,
      expectedText: "- [ ] 1.1 First task",
      baseHash: sha1(DOC),
      desiredChecked: true,
    });
    expect(res.status).toBe("conflict");
  });

  it("returns conflict when expectedText is ambiguous (duplicate lines + drifted index)", () => {
    // A duplicate is prepended so the stale index no longer points at the task
    // AND two lines now match expectedText — genuinely ambiguous.
    const dup = "- [ ] 1.1 First task\n" + DOC;
    const res = applyToggle(dup, {
      line: 3, // now points at "## 1. Setup", not the task
      expectedText: "- [ ] 1.1 First task",
      baseHash: sha1(DOC),
      desiredChecked: true,
    });
    expect(res.status).toBe("conflict");
  });

  it("treats an already-correct state as a no-op success", () => {
    const res = applyToggle(DOC, {
      line: 5, // "- [x] 1.2 Second task"
      expectedText: "- [x] 1.2 Second task",
      baseHash: sha1(DOC),
      desiredChecked: true,
    });
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.newContent).toBe(DOC);
  });

  it("preserves CRLF line endings on untouched lines", () => {
    const crlf = "# Tasks\r\n\r\n- [ ] 1.1 Win task\r\n- [ ] 1.2 Other\r\n";
    const res = applyToggle(crlf, {
      line: 2,
      expectedText: "- [ ] 1.1 Win task\r",
      baseHash: sha1(crlf),
      desiredChecked: true,
    });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.newContent).toContain("- [x] 1.1 Win task\r\n");
    expect(res.newContent).toContain("- [ ] 1.2 Other\r\n");
  });
});
