// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHubConfig } from "./config.js";
import { createDefaultGitLabClient } from "./gitlab-flow.js";

describe("gitlab http client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses PRIVATE-TOKEN authentication and requires a token for writes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ default_branch: "main" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const config = parseHubConfig({
      ITHYNO_GITLAB_ORIGIN: "https://gitlab.example.com",
      ITHYNO_GITLAB_TOKEN: "test-token",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_HUB_WEBHOOK_SECRET: "webhook-secret",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: "/tmp/ithyno-test",
    });
    const client = createDefaultGitLabClient(config);

    await expect(client.getDefaultBranch("group/project")).resolves.toBe("main");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ "PRIVATE-TOKEN": "test-token" }),
      }),
    );

    const noTokenConfig = parseHubConfig({
      ITHYNO_GITLAB_ORIGIN: "https://gitlab.example.com",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_HUB_WEBHOOK_SECRET: "webhook-secret",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: "/tmp/ithyno-test",
    });
    expect(() => createDefaultGitLabClient(noTokenConfig)).toThrow("gitlab token is required for writes");
  });

  it("rejects response payloads that target a different origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ default_branch: "main", web_url: "https://evil.example.com/group/project" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const config = parseHubConfig({
      ITHYNO_GITLAB_ORIGIN: "https://gitlab.example.com",
      ITHYNO_GITLAB_TOKEN: "test-token",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_HUB_WEBHOOK_SECRET: "webhook-secret",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: "/tmp/ithyno-test",
    });
    const client = createDefaultGitLabClient(config);

    await expect(client.getDefaultBranch("group/project")).rejects.toThrow("gitlab target origin mismatch");
  });

  it("creates or updates files, merge requests, and issue comments for retry-safe writes", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? String(init.body) : undefined });
      if (url.includes("/repository/files/")) {
        if (url.includes("proposal.md")) {
          return new Response(JSON.stringify({ file_path: "proposal.md" }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response("", { status: 404, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/repository/commits")) {
        return new Response(JSON.stringify({ id: "abc123" }), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/merge_requests")) {
        if (method === "GET") {
          return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ iid: 7, web_url: "https://gitlab.example.com/group/project/-/merge_requests/7" }), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/issues/42/notes") || url.includes("/notes/")) {
        if (method === "GET") {
          return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ id: 99 }), { status: 201, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/issues/42")) {
        return new Response(JSON.stringify({ id: 42 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const config = parseHubConfig({
      ITHYNO_GITLAB_ORIGIN: "https://gitlab.example.com",
      ITHYNO_GITLAB_TOKEN: "test-token",
      ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
      ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
      ITHYNO_HUB_WEBHOOK_SECRET: "webhook-secret",
      ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
      ITHYNO_HUB_STATE_PATH: "/tmp/ithyno-test",
    });
    const client = createDefaultGitLabClient(config);

    await client.commitAndPushFiles("group/project", "change/42", [{ path: "proposal.md", content: "Hello" }], "commit");
    await client.upsertIssueComment("group/project", "42", "ithyno-hub:status", "hello");
    await client.upsertMergeRequest("group/project", "42", "change/42", "main", "Draft", "body");
    await client.setIssueLabels?.("group/project", "42", ["ai:in-progress"]);

    expect(calls.some((call) => call.url.includes("/repository/files/proposal.md") && call.method === "GET")).toBe(true);
    const commitCall = calls.find((call) => call.url.includes("/repository/commits") && call.method === "POST");
    expect(commitCall?.body).toContain("\"action\":\"update\"");
    expect(calls.some((call) => call.url.includes("/issues/42/notes") && call.method === "POST")).toBe(true);
    expect(calls.some((call) => call.url.includes("/merge_requests") && call.method === "POST")).toBe(true);
  });
});
