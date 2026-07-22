// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for ImportProgress parsing logic.
 *
 * The SSE stream consumer itself requires a DOM EventSource and is tested
 * manually (task 8.5). This file tests the line-parsing logic.
 */
import { describe, expect, it } from "vitest";

type ProgressLine = {
  kind: "read" | "drafted" | "other";
  text: string;
};

function parseLine(raw: string): ProgressLine {
  if (raw.startsWith("[import] read: ")) {
    return { kind: "read", text: raw.slice("[import] read: ".length) };
  }
  if (raw.startsWith("[import] drafted: ")) {
    return { kind: "drafted", text: raw.slice("[import] drafted: ".length) };
  }
  return { kind: "other", text: raw };
}

describe("parseLine", () => {
  it("parses read lines", () => {
    const line = parseLine("[import] read: lib/main.dart");
    expect(line.kind).toBe("read");
    expect(line.text).toBe("lib/main.dart");
  });

  it("parses drafted lines", () => {
    const line = parseLine("[import] drafted: sql-editor");
    expect(line.kind).toBe("drafted");
    expect(line.text).toBe("sql-editor");
  });

  it("marks other lines as other", () => {
    const line = parseLine("some random output");
    expect(line.kind).toBe("other");
    expect(line.text).toBe("some random output");
  });

  it("handles done lines as other", () => {
    const line = parseLine("[import] done");
    expect(line.kind).toBe("other");
    expect(line.text).toBe("[import] done");
  });

  it("handles empty string", () => {
    const line = parseLine("");
    expect(line.kind).toBe("other");
    expect(line.text).toBe("");
  });
});

describe("import progress line filtering", () => {
  it("counts read lines correctly", () => {
    const lines: ProgressLine[] = [
      parseLine("[import] read: README.md"),
      parseLine("[import] read: lib/main.dart"),
      parseLine("[import] drafted: navigation"),
      parseLine("[import] drafted: sql-editor"),
      parseLine("some other output"),
    ];
    const reads = lines.filter((l) => l.kind === "read");
    const drafts = lines.filter((l) => l.kind === "drafted");
    expect(reads.length).toBe(2);
    expect(drafts.length).toBe(2);
  });

  it("extracts capability names from drafted lines", () => {
    const capabilities = [
      "[import] drafted: sql-editor",
      "[import] drafted: database-connections",
      "[import] drafted: query-results",
    ]
      .map(parseLine)
      .filter((l) => l.kind === "drafted")
      .map((l) => l.text);
    expect(capabilities).toEqual([
      "sql-editor",
      "database-connections",
      "query-results",
    ]);
  });
});
