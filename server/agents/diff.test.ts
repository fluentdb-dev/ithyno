import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "./diff.js";

describe("parseUnifiedDiff", () => {
  it("returns empty for empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("parses a single modified file", () => {
    const raw = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,4 @@",
      " ctx",
      "-removed",
      "+added",
      "+another",
      " trailing",
    ].join("\n");
    const files = parseUnifiedDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      kind: "modified",
      oldPath: "foo.ts",
      newPath: "foo.ts",
      isBinary: false,
      stats: { insertions: 2, deletions: 1 },
    });
    expect(files[0].hunks[0].lines.map((l) => l.kind)).toEqual([
      "ctx",
      "del",
      "add",
      "add",
      "ctx",
    ]);
  });

  it("parses an added file", () => {
    const raw = [
      "diff --git a/new.ts b/new.ts",
      "new file mode 100644",
      "index 000..abc",
      "--- /dev/null",
      "+++ b/new.ts",
      "@@ -0,0 +1,2 @@",
      "+line one",
      "+line two",
    ].join("\n");
    const files = parseUnifiedDiff(raw);
    expect(files[0]).toMatchObject({
      kind: "added",
      oldPath: null,
      newPath: "new.ts",
      stats: { insertions: 2, deletions: 0 },
    });
  });

  it("parses a deleted file", () => {
    const raw = [
      "diff --git a/old.ts b/old.ts",
      "deleted file mode 100644",
      "index abc..000",
      "--- a/old.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-line one",
      "-line two",
    ].join("\n");
    const files = parseUnifiedDiff(raw);
    expect(files[0]).toMatchObject({
      kind: "deleted",
      oldPath: "old.ts",
      newPath: null,
      stats: { insertions: 0, deletions: 2 },
    });
  });

  it("parses a rename", () => {
    const raw = [
      "diff --git a/old.ts b/new.ts",
      "similarity index 90%",
      "rename from old.ts",
      "rename to new.ts",
      "index abc..def 100644",
      "--- a/old.ts",
      "+++ b/new.ts",
      "@@ -1,1 +1,1 @@",
      "-tweak",
      "+twist",
    ].join("\n");
    const files = parseUnifiedDiff(raw);
    expect(files[0]).toMatchObject({
      kind: "renamed",
      oldPath: "old.ts",
      newPath: "new.ts",
    });
  });

  it("parses a binary file diff", () => {
    const raw = [
      "diff --git a/img.png b/img.png",
      "index abc..def 100644",
      "Binary files a/img.png and b/img.png differ",
    ].join("\n");
    const files = parseUnifiedDiff(raw);
    expect(files[0]).toMatchObject({
      isBinary: true,
      hunks: [],
    });
  });

  it("parses multiple files", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1 +1 @@",
      "-x",
      "+y",
      "diff --git a/b.ts b/b.ts",
      "--- a/b.ts",
      "+++ b/b.ts",
      "@@ -1 +1 @@",
      "-p",
      "+q",
    ].join("\n");
    const files = parseUnifiedDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0].newPath).toBe("a.ts");
    expect(files[1].newPath).toBe("b.ts");
  });

  it("skips the \\ No newline annotation", () => {
    const raw = [
      "diff --git a/f.txt b/f.txt",
      "--- a/f.txt",
      "+++ b/f.txt",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new",
    ].join("\n");
    const files = parseUnifiedDiff(raw);
    expect(files[0].hunks[0].lines.map((l) => l.kind)).toEqual(["del", "add"]);
  });
});
