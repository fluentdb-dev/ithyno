// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { parseProposal } from "./proposal.js";

const buildProposal = (fm: string, body = "# Body\n") => `---\n${fm}\n---\n\n${body}`;

describe("parseProposal — execution field", () => {
  it("parses worktree", () => {
    const doc = parseProposal("/p.md", buildProposal("execution: worktree"));
    expect(doc.execution).toBe("worktree");
  });

  it("parses terminal", () => {
    const doc = parseProposal("/p.md", buildProposal("execution: terminal"));
    expect(doc.execution).toBe("terminal");
  });

  it("canonicalizes mixed case", () => {
    const doc = parseProposal("/p.md", buildProposal("execution: WorkTree"));
    expect(doc.execution).toBe("worktree");
  });

  it("drops unrecognized values", () => {
    const doc = parseProposal("/p.md", buildProposal("execution: sandbox"));
    expect(doc.execution).toBeUndefined();
  });

  it("leaves execution undefined when the field is missing", () => {
    const doc = parseProposal("/p.md", buildProposal("tags: [feature/x]"));
    expect(doc.execution).toBeUndefined();
  });

  it("still populates other fields when execution is set", () => {
    const doc = parseProposal(
      "/p.md",
      buildProposal("execution: worktree\ntags: [feature/x]", "## Why\n\nMotivation.\n"),
    );
    expect(doc.execution).toBe("worktree");
    expect(doc.tags).toEqual(["feature/x"]);
    expect(doc.intent).toContain("Motivation.");
  });
});
