// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry, runtimeLabel } from "./registry.js";
import {
  selectAgent,
  resolveChangeTags,
  stdoutTail,
  waitForJobCompletion,
} from "./dispatch.js";
import type { Job, JobStatus } from "./runner.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-dispatch-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function loadWith(yamlSource: string): Promise<AgentRegistry> {
  writeFileSync(join(dir, "agents.yaml"), yamlSource);
  const reg = new AgentRegistry(dir);
  await reg.load();
  return reg;
}

function writeProposal(changeId: string, frontmatter: string): void {
  const changeDir = join(dir, "openspec", "changes", changeId);
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(join(changeDir, "proposal.md"), frontmatter);
}

describe("selectAgent — role matching", () => {
  it("selects the single agent matching role with wildcard specialties", async () => {
    const reg = await loadWith(
      `agents:
  - name: coder-1
    command: claude
    args: []
    role: code
    specialties: [any]
`,
    );
    const r = selectAgent(reg, { role: "code", changeTags: ["ts"] });
    expect("agent" in r).toBe(true);
    if ("agent" in r) {
      expect(r.agent.name).toBe("coder-1");
    }
  });

  it("returns error when no agent matches the role", async () => {
    const reg = await loadWith(
      `agents:
  - name: coder-1
    command: claude
    args: []
    role: code
    specialties: [any]
`,
    );
    const r = selectAgent(reg, { role: "reviewer", changeTags: [] });
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toMatch(/no agent matches role='reviewer'/);
      expect(r.matches).toEqual([]);
    }
  });
});

describe("selectAgent — specialties intersection", () => {
  const yaml = `agents:
  - name: code-ts
    command: claude
    args: []
    role: code
    specialties: [ts, react]
  - name: code-python
    command: aider
    args: []
    role: code
    specialties: [python]
`;

  it("selects the TS-specialised agent for TS-tagged change", async () => {
    const reg = await loadWith(yaml);
    const r = selectAgent(reg, { role: "code", changeTags: ["ts"] });
    expect("agent" in r).toBe(true);
    if ("agent" in r) expect(r.agent.name).toBe("code-ts");
  });

  it("selects the Python-specialised agent for a Python change", async () => {
    const reg = await loadWith(yaml);
    const r = selectAgent(reg, { role: "code", changeTags: ["python", "api"] });
    expect("agent" in r).toBe(true);
    if ("agent" in r) expect(r.agent.name).toBe("code-python");
  });

  it("returns error when specialties are declared but no tag matches", async () => {
    const reg = await loadWith(yaml);
    const r = selectAgent(reg, { role: "code", changeTags: ["rust"] });
    expect("error" in r).toBe(true);
  });
});

describe("selectAgent — wildcard specialties", () => {
  it("[any] specialty always matches, even when tags are empty", async () => {
    const reg = await loadWith(
      `agents:
  - name: catch-all
    command: claude
    args: []
    role: code
    specialties: [any]
`,
    );
    const r = selectAgent(reg, { role: "code", changeTags: [] });
    expect("agent" in r).toBe(true);
  });

  it("empty specialties (default from add-agent-role-field) also acts as wildcard", async () => {
    const reg = await loadWith(
      `agents:
  - name: no-specialty
    command: claude
    args: []
    role: code
`,
    );
    const r = selectAgent(reg, { role: "code", changeTags: ["ts"] });
    expect("agent" in r).toBe(true);
  });
});

describe("selectAgent — runtime filter", () => {
  const yaml = `runtimes:
  claude:
    command: claude
    baseArgs: []
    promptStyle: cli-arg
    promptFlag: -p
    supports: { interactive: true, artifactOutput: true, diff: git }
  aider:
    command: aider
    baseArgs: []
    promptStyle: cli-arg
    promptFlag: --message
    supports: { interactive: false, artifactOutput: true, diff: aider-native }
agents:
  - name: code-claude
    runtime: claude
    prompt: /opsx:apply
    role: code
    specialties: [any]
  - name: code-aider
    runtime: aider
    prompt: implement
    role: code
    specialties: [any]
`;

  it("selects the runtime-matching agent when runtime is specified", async () => {
    const reg = await loadWith(yaml);
    const r = selectAgent(reg, { role: "code", changeTags: [], runtime: "aider" });
    expect("agent" in r).toBe(true);
    if ("agent" in r) expect(r.agent.name).toBe("code-aider");
  });

  it("returns error when the requested runtime has no matching agent", async () => {
    const reg = await loadWith(yaml);
    const r = selectAgent(reg, { role: "code", changeTags: [], runtime: "copilot" });
    expect("error" in r).toBe(true);
  });

  it("without runtime filter, first agent in yaml order is chosen", async () => {
    const reg = await loadWith(yaml);
    const r = selectAgent(reg, { role: "code", changeTags: [] });
    expect("agent" in r).toBe(true);
    if ("agent" in r) expect(r.agent.name).toBe("code-claude");
  });
});

describe("selectAgent — deterministic order", () => {
  it("picks the first agent in agents.yaml order when multiple match", async () => {
    const reg = await loadWith(
      `agents:
  - name: primary
    command: claude
    args: []
    role: code
    specialties: [any]
  - name: fallback
    command: claude
    args: []
    role: code
    specialties: [any]
`,
    );
    const r = selectAgent(reg, { role: "code", changeTags: [] });
    if ("agent" in r) expect(r.agent.name).toBe("primary");
  });
});

describe("resolveChangeTags", () => {
  it("reads tags from proposal.md frontmatter", async () => {
    writeProposal(
      "add-foo",
      `---
tags: [python, api]
---

## Why
...
`,
    );
    const tags = await resolveChangeTags(dir, "add-foo");
    expect(tags).toEqual(["python", "api"]);
  });

  it("returns empty array when proposal.md is absent", async () => {
    const tags = await resolveChangeTags(dir, "no-such-change");
    expect(tags).toEqual([]);
  });

  it("returns empty array when frontmatter has no tags", async () => {
    writeProposal(
      "add-bar",
      `---
foo: bar
---

## Why
...
`,
    );
    const tags = await resolveChangeTags(dir, "add-bar");
    expect(tags).toEqual([]);
  });

  it("filters out non-string tag entries", async () => {
    writeProposal(
      "add-baz",
      `---
tags: ["ok", 42, {}, "also-ok"]
---
`,
    );
    const tags = await resolveChangeTags(dir, "add-baz");
    expect(tags).toEqual(["ok", "also-ok"]);
  });
});

describe("runtimeLabel", () => {
  it("returns the runtime name for runtime-backed agents", () => {
    expect(
      runtimeLabel({
        name: "x",
        runtime: "aider",
        prompt: "p",
        role: "code",
        specialties: [],
        concurrency: 1,
        dedicated: true,
      }),
    ).toBe("aider");
  });

  it("returns 'legacy' for command-based agents", () => {
    expect(
      runtimeLabel({
        name: "x",
        command: "claude",
        args: [],
        role: "code",
        specialties: [],
        concurrency: 1,
        dedicated: true,
      }),
    ).toBe("legacy");
  });
});

describe("stdoutTail", () => {
  const mkJob = (): Job =>
    ({
      id: "j-1",
      changeId: "c",
      agentName: "a",
      status: "completed",
      startedAt: 0,
      branch: "b",
      worktreePath: "/w",
      output: [
        { stream: "stdout", chunk: "line1\n", ts: 0 },
        { stream: "stderr", chunk: "err1\n", ts: 0 },
        { stream: "stdout", chunk: "line2\n", ts: 0 },
        { stream: "stdout", chunk: "line3\n", ts: 0 },
      ],
    }) as Job;

  it("returns concatenated stdout lines, most-recent last", () => {
    const t = stdoutTail(mkJob());
    expect(t).toBe("line1\nline2\nline3\n");
  });

  it("truncates to the trailing N bytes when the output is large", () => {
    const job = mkJob();
    job.output.push({ stream: "stdout", chunk: "x".repeat(5000), ts: 0 });
    const t = stdoutTail(job, 1000);
    expect(t.length).toBe(1000);
    expect(t).toMatch(/^x+$/);
  });
});

describe("waitForJobCompletion (polling)", () => {
  it("resolves when the job transitions out of 'running'", async () => {
    let state: JobStatus = "running";
    const mockRunner = {
      getJob: () =>
        ({
          id: "j-1",
          status: state,
          worktreePath: "/w",
          output: [],
        }) as unknown as Job,
      cancel: () => ({ ok: true as const }),
    };
    setTimeout(() => {
      state = "completed";
    }, 100);
    const outcome = await waitForJobCompletion(mockRunner as any, "j-1", 5000, 20);
    expect(outcome).not.toBe("timeout");
    if (outcome !== "timeout") {
      expect(outcome.status).toBe("completed");
    }
  });

  it("returns 'timeout' after the deadline and cancels the job", async () => {
    let cancelCalled = false;
    const mockRunner = {
      getJob: () =>
        ({
          id: "j-1",
          status: "running" as JobStatus,
          worktreePath: "/w",
          output: [],
        }) as unknown as Job,
      cancel: () => {
        cancelCalled = true;
        return { ok: true as const };
      },
    };
    const outcome = await waitForJobCompletion(mockRunner as any, "j-1", 200, 20);
    expect(outcome).toBe("timeout");
    expect(cancelCalled).toBe(true);
  });
});
