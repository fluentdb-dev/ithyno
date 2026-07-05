// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { parseNeedsHumanContent } from "./needs-human.js";

describe("parseNeedsHumanContent", () => {
  it("parses a freshly-written escalation", () => {
    const raw = [
      "# Should the migration run against prod tonight?",
      "",
      "## Context",
      "",
      "Legal signed off on the schema but wants a rollback window.",
      "",
      "---",
      "answered: false",
      "",
    ].join("\n");
    const doc = parseNeedsHumanContent(raw, "sample");
    expect(doc.question).toBe("Should the migration run against prod tonight?");
    expect(doc.context).toBe("Legal signed off on the schema but wants a rollback window.");
    expect(doc.answer).toBeNull();
    expect(doc.answered).toBe(false);
  });

  it("parses an answered escalation", () => {
    const raw = [
      "# Rollback plan?",
      "",
      "## Context",
      "",
      "Blue/green flip.",
      "",
      "## Answer",
      "",
      "Two-hour window; canary at 5%.",
      "",
      "---",
      "answered: true",
      "",
    ].join("\n");
    const doc = parseNeedsHumanContent(raw, "sample");
    expect(doc.answered).toBe(true);
    expect(doc.answer).toBe("Two-hour window; canary at 5%.");
    expect(doc.context).toBe("Blue/green flip.");
  });

  it("tolerates a missing footer as unanswered", () => {
    const raw = ["# A question", "", "Some body without a footer.", ""].join("\n");
    const doc = parseNeedsHumanContent(raw, "sample");
    expect(doc.question).toBe("A question");
    expect(doc.answered).toBe(false);
  });

  it("tolerates a missing context section", () => {
    const raw = ["# Bare question", "", "---", "answered: false", ""].join("\n");
    const doc = parseNeedsHumanContent(raw, "sample");
    expect(doc.question).toBe("Bare question");
    expect(doc.context).toBeNull();
    expect(doc.answered).toBe(false);
  });

  it("parses a case-insensitive footer with surrounding whitespace", () => {
    const raw = ["# Q?", "", "---", "  Answered:   TRUE  ", ""].join("\n");
    const doc = parseNeedsHumanContent(raw, "sample");
    expect(doc.answered).toBe(true);
  });
});
