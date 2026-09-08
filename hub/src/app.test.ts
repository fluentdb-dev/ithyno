// SPDX-License-Identifier: GPL-3.0-or-later
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Database } from "sqlite3";
import { startHubRuntime, classifyWebhookEvent, parseWebhookPayload, verifyWebhookRequest, processJobAttempt } from "./app.js";
import { parseHubConfig } from "./config.js";
import { createOperationalStore } from "./store.js";
import type { GitLabClient } from "./gitlab-flow.js";
import { processIssueGenerationJob, applyIssueFlowFailure, resolveChangeId } from "./gitlab-flow.js";

const tempDirs: string[] = [];

class FakeGitLabClient implements GitLabClient {
  public branches = new Set<string>();
  public mergeRequests = new Map<string, { iid: string; webUrl: string; draft: boolean; state: string }>();
  public comments = new Map<string, Array<{ id: string; body: string }>>();
  public labels = new Map<string, string[]>();
  public commitAttempts = 0;
  public shouldFailCommit = false;
  public baseRevision = "abc123";

  async getDefaultBranch(): Promise<string> {
    return "main";
  }

  async getOpenSpecRevision(): Promise<string> {
    return this.baseRevision;
  }

  async getBranch(_projectPath: string, branchName: string): Promise<{ name: string } | null> {
    return this.branches.has(branchName) ? { name: branchName } : null;
  }

  async createBranch(_projectPath: string, branchName: string): Promise<void> {
    this.branches.add(branchName);
  }

  async commitAndPushFiles(): Promise<void> {
    this.commitAttempts += 1;
    if (this.shouldFailCommit) {
      throw new Error("commit-failed");
    }
  }

  async findMergeRequest(_projectPath: string, issueIid: string, sourceBranch: string): Promise<{ iid: string; webUrl: string; draft: boolean; state: string } | null> {
    return this.mergeRequests.get(`${issueIid}:${sourceBranch}`) ?? null;
  }

  async upsertMergeRequest(projectPath: string, issueIid: string, sourceBranch: string, _targetBranch: string, _title: string, _description: string): Promise<{ iid: string; webUrl: string }> {
    const key = `${issueIid}:${sourceBranch}`;
    const iid = `mr-${issueIid}`;
    this.mergeRequests.set(key, { iid, webUrl: `${projectPath}/-/merge_requests/${iid}`, draft: true, state: "opened" });
    return { iid, webUrl: `${projectPath}/-/merge_requests/${iid}` };
  }

  async findIssueComment(_projectPath: string, issueIid: string, marker: string): Promise<{ id: string; body: string } | null> {
    const comments = this.comments.get(`${issueIid}:${marker}`) ?? [];
    return comments[0] ?? null;
  }

  async upsertIssueComment(_projectPath: string, issueIid: string, marker: string, body: string): Promise<void> {
    const key = `${issueIid}:${marker}`;
    const comments = this.comments.get(key) ?? [];
    const next = comments.length === 0 ? [{ id: `${issueIid}-${marker}`, body }] : [{ ...comments[0], body }];
    this.comments.set(key, next);
  }

  async setIssueLabels(_projectPath: string, issueIid: string, labels: string[]): Promise<void> {
    this.labels.set(issueIid, labels);
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("hub issue-to-draft flow", () => {
  it("creates a canonical change branch, artifacts, and draft merge request for an eligible issue", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-flow-"));
    tempDirs.push(dir);
    const client = new FakeGitLabClient();
    const config = parseHubConfig({
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: dir,
      ITHYNO_HUB_WORKSPACE_ROOT: join(dir, "workspace"),
    });
    config.gitlabClient = client;
    const payload = { projectPath: "group/project", issueIid: "42", title: "Add issue flow", body: "We need a deterministic change from this issue.", labels: ["ai:spec"] };

    const artifacts = await processIssueGenerationJob(config, payload, client);
    expect(artifacts).not.toBeNull();
    expect(client.branches.has("change/42-add-issue-flow")).toBe(true);
    expect(client.mergeRequests.size).toBe(1);
    expect(client.comments.get("42:ithyno-hub:status")?.[0]?.body).toContain("change/42-add-issue-flow");
    expect(artifacts?.proposalContent).toContain("base-specs-revision");
    expect(client.labels.get("42")).toContain("ai:in-progress");
  });

  it("requests clarification for a thin issue without generating artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-clarification-"));
    tempDirs.push(dir);
    const client = new FakeGitLabClient();
    const config = parseHubConfig({
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: dir,
      ITHYNO_HUB_WORKSPACE_ROOT: join(dir, "workspace"),
    });
    config.gitlabClient = client;
    const payload = { projectPath: "group/project", issueIid: "43", title: "", body: "", labels: ["ai:spec"] };

    const artifacts = await processIssueGenerationJob(config, payload, client);
    expect(artifacts).toBeNull();
    expect(client.branches.size).toBe(0);
    expect(client.comments.get("43:ithyno-hub:clarification")?.[0]?.body).toContain("Please add");
  });

  it("retries transient commit failures until the retry budget is exhausted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-retry-"));
    tempDirs.push(dir);
    const config = parseHubConfig({
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: dir,
      ITHYNO_HUB_WORKSPACE_ROOT: join(dir, "workspace"),
    });
    const store = createOperationalStore(dir);
    await store.initialize();
    await store.createJob("delivery-retry-1", "issue", "group/project", "Needs spec", "https://gitlab.example.com/group/project/-/issues/1", {
      eventType: "issue",
      projectId: "group/project",
      title: "Needs spec",
      targetUrl: "https://gitlab.example.com/group/project/-/issues/1",
      body: {
        object_kind: "issue",
        project: { path_with_namespace: "group/project", name: "Alpha" },
        object_attributes: { title: "Needs spec", description: "Please generate" },
      },
    });

    let attempts = 0;
    const processor = async () => {
      attempts += 1;
      throw new Error("commit-failed");
    };
    const payloadJson = JSON.stringify({
      eventType: "issue",
      projectId: "group/project",
      title: "Needs spec",
      targetUrl: "https://gitlab.example.com/group/project/-/issues/1",
      body: {
        object_kind: "issue",
        project: { path_with_namespace: "group/project", name: "Alpha" },
        object_attributes: { title: "Needs spec", description: "Please generate" },
      },
    });
    let job = {
      id: "delivery-retry-1",
      eventType: "issue",
      projectId: "group/project",
      title: "Needs spec",
      targetUrl: "https://gitlab.example.com/group/project/-/issues/1",
      status: "queued",
      attempts: 0,
      payloadJson,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Parameters<typeof processJobAttempt>[2];
    for (let index = 0; index < 6; index += 1) {
      await processJobAttempt(config, store, job, processor);
      job = { ...job, attempts: job.attempts + 1 };
    }

    expect(attempts).toBe(5);
    const persisted = await new Promise<{ status: string; attempts: number; terminal_error: string | null } | null>((resolve, reject) => {
      const db = new Database(join(dir, "operations.sqlite"));
      db.get("SELECT status, attempts, terminal_error FROM jobs WHERE id = ?", ["delivery-retry-1"], (error, result: { status: string; attempts: number; terminal_error: string | null } | undefined) => {
        db.close((closeError) => {
          if (error) reject(error);
          else if (closeError) reject(closeError);
          else resolve(result ?? null);
        });
      });
    });
    expect(persisted?.status).toBe("terminal_failed");
    expect(persisted?.attempts).toBe(5);
    await store.close();
  });

  it("uses deterministic suffixes when a change-id collision already exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-collision-"));
    tempDirs.push(dir);
    const client = new FakeGitLabClient();
    client.branches.add("change/101-a-title");
    client.branches.add("change/101-a-title-1");
    const config = parseHubConfig({
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: dir,
      ITHYNO_HUB_WORKSPACE_ROOT: join(dir, "workspace"),
    });
    const payload = { projectPath: "group/project", issueIid: "101", title: "A title", body: "Need a deterministic change ID.", labels: ["ai:spec"] };

    const changeId = await resolveChangeId(payload, client, config);
    expect(changeId).toBe("101-a-title-2");
  });

  it("reconciles an existing branch and merge request on retry and records failure cleanup on write errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-recovery-"));
    tempDirs.push(dir);
    const client = new FakeGitLabClient();
    const config = parseHubConfig({
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: dir,
      ITHYNO_HUB_WORKSPACE_ROOT: join(dir, "workspace"),
      ITHYNO_HUB_FAILURE_LABEL: "ai:failed",
    });
    config.gitlabClient = client;
    const payload = { projectPath: "group/project", issueIid: "44", title: "Recover partial writes", body: "The hub should recover after a partial write failure.", labels: ["ai:spec"] };

    client.shouldFailCommit = true;
    await expect(processIssueGenerationJob(config, payload, client)).rejects.toThrow("commit-failed");
    await applyIssueFlowFailure(config, payload, new Error("commit-failed"));
    expect(client.labels.get("44")).toContain("ai:failed");
    expect(client.labels.get("44")).not.toContain("ai:in-progress");

    client.shouldFailCommit = false;
    const artifacts = await processIssueGenerationJob(config, payload, client);
    expect(artifacts).not.toBeNull();
    expect(client.commitAttempts).toBe(2);
    expect(client.branches.has("change/44-recover-partial-writes")).toBe(true);
  });
});

describe("hub webhook intake", () => {
  it("classifies supported issue events and strips them to a safe envelope payload", () => {
    const config = parseHubConfig({
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
    });
    const body = {
      object_kind: "issue",
      project: { path_with_namespace: "group/project", name: "Alpha", web_url: "https://gitlab.example.com/group/project" },
      object_attributes: { title: "Needs spec", description: "Please generate" },
    };
    const classification = classifyWebhookEvent(body, config);
    const payload = parseWebhookPayload(body, config);
    expect(classification.supported).toBe(true);
    expect(payload.projectId).toBe("group/project");
    expect(payload.body).toMatchObject({ projectId: "group/project", classification: "issue" });
  });

  it("verifies signed webhook signatures and rejects invalid secrets", () => {
    const config = parseHubConfig({
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "signed",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
    });
    const body = JSON.stringify({ event: "issue" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", config.webhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;
    expect(verifyWebhookRequest(config, { "x-gitlab-signature": signature, "x-gitlab-timestamp": timestamp }, body)).toEqual({ ok: true, reason: "ok" });
    expect(verifyWebhookRequest(config, { "x-gitlab-signature": "sha256=deadbeef", "x-gitlab-timestamp": timestamp }, body)).toEqual({ ok: false, reason: "invalid-signature" });
  });

  it("rejects legacy webhook tokens with constant-time semantics", () => {
    const config = parseHubConfig({
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "legacy",
      ITHYNO_HUB_WEBHOOK_SECRET: "legacy-secret",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
    });
    expect(verifyWebhookRequest(config, { "x-gitlab-token": "legacy-secret" }, "{}")).toEqual({ ok: true, reason: "ok" });
    expect(verifyWebhookRequest(config, { "x-gitlab-token": "wrong-secret" }, "{}")).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("accepts signed webhook deliveries over HTTP and rejects invalid signatures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-e2e-"));
    tempDirs.push(dir);
    const config = parseHubConfig({
      ITHYNO_HUB_HOST: "127.0.0.1",
      ITHYNO_HUB_PORT: "0",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "signed",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_STATE_PATH: dir,
    });
    const runtime = await startHubRuntime(config);
    const address = runtime.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const body = JSON.stringify({ object_kind: "issue", project: { path_with_namespace: "group/project", name: "Alpha" }, object_attributes: { title: "Needs spec" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", config.webhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/webhooks/gitlab`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-gitlab-signature": signature, "x-gitlab-timestamp": timestamp },
        body,
      });
      expect(response.status).toBe(202);
      const payload = await response.json() as { accepted: boolean; deliveryId?: string };
      expect(payload.accepted).toBe(true);

      const db = new Database(join(dir, "operations.sqlite"));
      try {
        const deliveries = await new Promise<Array<{ id: string }>>((resolve, reject) => {
          db.all("SELECT id FROM deliveries", (error, rows: Array<{ id: string }>) => {
            if (error) reject(error);
            else resolve(rows);
          });
        });
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]?.id).toBe(payload.deliveryId);
      } finally {
        await new Promise<void>((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await runtime.close();
    }
  });

  it("rejects invalid signatures at the HTTP boundary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-e2e-"));
    tempDirs.push(dir);
    const config = parseHubConfig({
      ITHYNO_HUB_HOST: "127.0.0.1",
      ITHYNO_HUB_PORT: "0",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "signed",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_STATE_PATH: dir,
    });
    const runtime = await startHubRuntime(config);
    const address = runtime.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const body = JSON.stringify({ object_kind: "issue", project: { path_with_namespace: "group/project", name: "Alpha" }, object_attributes: { title: "Needs spec" } });
    const timestamp = String(Math.floor(Date.now() / 1000));

    try {
      const response = await fetch(`http://127.0.0.1:${port}/webhooks/gitlab`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-gitlab-signature": "sha256=deadbeef", "x-gitlab-timestamp": timestamp },
        body,
      });
      expect(response.status).toBe(401);
      const payload = await response.json() as { accepted: boolean };
      expect(payload.accepted).toBe(false);
    } finally {
      await runtime.close();
    }
  });

  it("rejects duplicate deliveries with the same idempotency key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ithyno-hub-e2e-"));
    tempDirs.push(dir);
    const config = parseHubConfig({
      ITHYNO_HUB_HOST: "127.0.0.1",
      ITHYNO_HUB_PORT: "0",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "signed",
      ITHYNO_HUB_WEBHOOK_SECRET: "s3cr3t",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_STATE_PATH: dir,
    });
    const runtime = await startHubRuntime(config);
    const address = runtime.app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const body = JSON.stringify({ object_kind: "issue", project: { path_with_namespace: "group/project", name: "Alpha" }, object_attributes: { title: "Needs spec" } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", config.webhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;

    try {
      const first = await fetch(`http://127.0.0.1:${port}/webhooks/gitlab`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-gitlab-signature": signature, "x-gitlab-timestamp": timestamp, "x-gitlab-event-uuid": "delivery-1" },
        body,
      });
      const second = await fetch(`http://127.0.0.1:${port}/webhooks/gitlab`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-gitlab-signature": signature, "x-gitlab-timestamp": timestamp, "x-gitlab-event-uuid": "delivery-1" },
        body,
      });
      expect(first.status).toBe(202);
      expect(second.status).toBe(202);

      const db = new Database(join(dir, "operations.sqlite"));
      try {
        const deliveries = await new Promise<Array<{ id: string }>>((resolve, reject) => {
          db.all("SELECT id FROM deliveries", (error, rows: Array<{ id: string }>) => {
            if (error) reject(error);
            else resolve(rows);
          });
        });
        expect(deliveries).toHaveLength(1);
      } finally {
        await new Promise<void>((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await runtime.close();
    }
  });
});
