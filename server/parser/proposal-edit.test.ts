// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { setExecutionInFrontmatter, readFrontmatterBlock } from "./proposal-edit.js";

describe("setExecutionInFrontmatter", () => {
  it("prepends a minimal frontmatter block when the source has none", () => {
    const src = "# Body starts here\n";
    const next = setExecutionInFrontmatter(src, "worktree");
    expect(next).toContain("---\nexecution: worktree\n---\n");
    expect(next).toContain("# Body starts here");
  });

  it("inserts execution: <mode> into an existing frontmatter block", () => {
    const src = `---
tags: [feature/x]
---

# Body`;
    const next = setExecutionInFrontmatter(src, "terminal");
    const fm = readFrontmatterBlock(next);
    expect(fm).toContain("tags: [feature/x]");
    expect(fm).toContain("execution: terminal");
    expect(next).toContain("# Body");
  });

  it("updates an existing execution line in place", () => {
    const src = `---
tags: [feature/x]
execution: terminal
---

# Body`;
    const next = setExecutionInFrontmatter(src, "worktree");
    const fm = readFrontmatterBlock(next);
    expect(fm).toContain("execution: worktree");
    // Only one execution line remains
    const count = (next.match(/^execution:/gm) ?? []).length;
    expect(count).toBe(1);
  });

  it("refuses to write when the frontmatter is missing its closing ---", () => {
    const src = `---
tags: [feature/x]

# Body without close`;
    expect(setExecutionInFrontmatter(src, "worktree")).toBe(src);
  });

  it("preserves neighbouring lines byte-for-byte", () => {
    const src = `---
tags: [feature/x, area/y]
assignees:
  - "@claude"
---

## Why

Some body content.`;
    const next = setExecutionInFrontmatter(src, "worktree");
    expect(next).toContain("tags: [feature/x, area/y]");
    expect(next).toContain('  - "@claude"');
    expect(next).toContain("## Why");
    expect(next).toContain("Some body content.");
  });
});

describe("readFrontmatterBlock", () => {
  it("returns null when no frontmatter is present", () => {
    expect(readFrontmatterBlock("# body")).toBeNull();
  });
  it("returns null when the frontmatter is unclosed", () => {
    expect(readFrontmatterBlock("---\nkey: value\n# body")).toBeNull();
  });
  it("returns the raw frontmatter body between ---", () => {
    const src = "---\nkey: value\n---\n# body";
    expect(readFrontmatterBlock(src)).toBe("key: value");
  });
});
