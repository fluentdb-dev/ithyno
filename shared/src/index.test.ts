// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { buildHubEventEnvelope, isSupportedHubEventVersion, parseProposalContent, parseSpecContent } from "./index.js";

describe("shared parser primitives", () => {
  it("parses proposal sections from markdown content", () => {
    const proposal = parseProposalContent("proposal.md", "---\ntags: [alpha]\nexecution: worktree\n---\n\n## Why\nNeed it\n\n## Scope\nDo it\n");
    expect(proposal.tags).toEqual(["alpha"]);
    expect(proposal.execution).toBe("worktree");
    expect(proposal.intent).toContain("Need it");
    expect(proposal.scope).toContain("Do it");
  });

  it("parses spec requirements and scenarios", () => {
    const spec = parseSpecContent("dashboard", "spec.md", "## Purpose\nProvide dashboards\n\n## ADDED Requirements\n\n### Requirement: Live updates\nThe system SHALL update the dashboard.\n\n#### Scenario: Update arrives\n- It updates\n");
    expect(spec.requirements).toHaveLength(1);
    expect(spec.requirements[0]?.name).toBe("Live updates");
    expect(spec.requirements[0]?.scenarios[0]?.steps).toEqual(["It updates"]);
    expect(spec.delta).toBe("MODIFIED");
  });

  it("builds a versioned hub event envelope", () => {
    const envelope = buildHubEventEnvelope({
      type: "issue.created",
      projectId: "group/project",
      title: "Issue created",
      body: "Body",
      targetUrl: "https://gitlab.example.com/group/project/-/issues/1",
    });
    expect(envelope.version).toBe(1);
    expect(envelope.type).toBe("issue.created");
    expect(isSupportedHubEventVersion(envelope.version)).toBe(true);
    expect(isSupportedHubEventVersion(0)).toBe(false);
    expect(isSupportedHubEventVersion(2)).toBe(false);
  });
});
