// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { startableCandidates } from "./changeState";
import type { AgentPublic, Change, JobSummary, TaskList } from "../types";

const agents: AgentPublic[] = [
  { name: "claude", command: "claude", args: ["/opsx:apply", "${change_id}"], hasEnv: false },
];

function tasks(sections: Array<{ title: string; done: number; total: number }>): TaskList {
  return {
    filePath: "/tasks.md",
    baseHash: "h",
    sections: sections.map((s, si) => ({
      title: s.title,
      tasks: Array.from({ length: s.total }, (_, i) => ({
        id: `${si + 1}.${i + 1}`,
        text: `t${i}`,
        checked: i < s.done,
        line: i,
        raw: `- [${i < s.done ? "x" : " "}] t${i}`,
        filePath: "/tasks.md",
      })),
    })),
  };
}

function makeChange(id: string, opts: {
  done?: number;
  total?: number;
  tasks?: TaskList | null;
} = {}): Change {
  return {
    id,
    proposal: null,
    design: null,
    tasks: opts.tasks ?? tasks([{ title: "1. Impl", done: opts.done ?? 0, total: opts.total ?? 3 }]),
    deltaSpecs: [],
    progress: { done: opts.done ?? 0, total: opts.total ?? 3 },
    hasOutcome: false,
  };
}

function runningJob(changeId: string): JobSummary {
  return {
    id: `job-${changeId}`,
    changeId,
    agentName: "claude",
    branch: `agent/${changeId}`,
    worktreePath: `/wt/${changeId}`,
    status: "running",
    startedAt: 1,
  };
}

describe("startableCandidates", () => {
  it("returns empty when no agents are defined", () => {
    const changes = [makeChange("a")];
    expect(startableCandidates(changes, new Map(), [])).toEqual([]);
  });

  it("excludes changes with a running job", () => {
    const changes = [makeChange("a"), makeChange("b")];
    const jobs = new Map([["a", runningJob("a")]]);
    const res = startableCandidates(changes, jobs, agents);
    expect(res.map((c) => c.id)).toEqual(["b"]);
  });

  it("excludes DONE changes", () => {
    const changes = [makeChange("a", { done: 3, total: 3 })];
    expect(startableCandidates(changes, new Map(), agents)).toEqual([]);
  });

  it("excludes verify-only changes", () => {
    const change = makeChange("a", {
      tasks: tasks([
        { title: "1. Impl", done: 2, total: 2 },
        { title: "2. Verification", done: 0, total: 2 },
      ]),
      done: 2,
      total: 4,
    });
    expect(startableCandidates([change], new Map(), agents)).toEqual([]);
  });

  it("returns fresh TODO changes", () => {
    const changes = [makeChange("a"), makeChange("b")];
    const res = startableCandidates(changes, new Map(), agents);
    expect(res.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("returns partially-done changes that have no active job", () => {
    const change = makeChange("a", { done: 1, total: 3 });
    expect(startableCandidates([change], new Map(), agents)).toHaveLength(1);
  });

  it("mixes filtering: keeps only the actionable ones", () => {
    const changes = [
      makeChange("running", { done: 1, total: 3 }),
      makeChange("done", { done: 3, total: 3 }),
      makeChange("ready", { done: 0, total: 3 }),
      makeChange("verifyOnly", {
        tasks: tasks([
          { title: "1. Impl", done: 1, total: 1 },
          { title: "2. Verification", done: 0, total: 2 },
        ]),
        done: 1,
        total: 3,
      }),
    ];
    const jobs = new Map([["running", runningJob("running")]]);
    const res = startableCandidates(changes, jobs, agents);
    expect(res.map((c) => c.id)).toEqual(["ready"]);
  });

  it("null tasks are treated as startable (cannot prove no work)", () => {
    const change: Change = { ...makeChange("a"), tasks: null, progress: { done: 0, total: 0 } };
    expect(startableCandidates([change], new Map(), agents)).toHaveLength(1);
  });
});
