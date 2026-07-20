// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { filterChanges } from "./Overview";
import type { Change, ProposalDoc } from "../types";

function mkChange(id: string, opts: { intent?: string; tags?: string[] } = {}): Change {
  const proposal: ProposalDoc | null =
    opts.intent !== undefined || opts.tags !== undefined
      ? {
          filePath: `openspec/changes/${id}/proposal.md`,
          intent: opts.intent,
          raw: "",
          tags: opts.tags ?? [],
        }
      : null;
  return {
    id,
    proposal,
    design: null,
    tasks: null,
    tasksHash: "",
    tasksPath: "",
    progress: { done: 0, total: 0 },
    hasOutcome: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as Change;
}

describe("filterChanges (add-kanban-search-filter)", () => {
  const universe: Change[] = [
    mkChange("add-task-filter", { intent: "Filter tasks in the tree", tags: ["feature/kanban"] }),
    mkChange("revert-something", { intent: "Undo the thing", tags: ["revert"] }),
    mkChange("add-onboarding-flow", { intent: "First-run wizard", tags: ["ux/onboarding"] }),
    mkChange("plain-no-proposal"),
  ];

  it("empty filter returns all changes (identity semantics)", () => {
    const out = filterChanges(universe, "");
    expect(out).toBe(universe);
  });

  it("whitespace-only filter also passes everything", () => {
    const out = filterChanges(universe, "   \t\n");
    expect(out).toBe(universe);
  });

  it("matches by id substring (case-insensitive)", () => {
    const out = filterChanges(universe, "TASK");
    expect(out.map((c) => c.id)).toEqual(["add-task-filter"]);
  });

  it("matches by intent (a.k.a. proposal 'title') substring", () => {
    const out = filterChanges(universe, "wizard");
    expect(out.map((c) => c.id)).toEqual(["add-onboarding-flow"]);
  });

  it("matches by tag substring", () => {
    const out = filterChanges(universe, "kanban");
    expect(out.map((c) => c.id)).toEqual(["add-task-filter"]);
  });

  it("returns empty array when nothing matches", () => {
    const out = filterChanges(universe, "zzz-no-match");
    expect(out).toEqual([]);
  });

  it("does not crash on changes with no proposal", () => {
    const out = filterChanges(universe, "plain");
    expect(out.map((c) => c.id)).toEqual(["plain-no-proposal"]);
  });

  it("matches across multiple fields (union)", () => {
    // "revert" appears in an id AND in a tag; both surface once each.
    const out = filterChanges(
      [
        mkChange("revert-a", { tags: [] }),
        mkChange("b", { tags: ["revert"] }),
        mkChange("c", { intent: "revert something" }),
      ],
      "revert",
    );
    expect(out.map((c) => c.id).sort()).toEqual(["b", "c", "revert-a"]);
  });
});
