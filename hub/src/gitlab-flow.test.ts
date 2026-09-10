// SPDX-License-Identifier: GPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHubConfig } from "./config.js";
import { createDefaultGitLabClient } from "./gitlab-flow.js";

function createConfig(token: string | null = "test-token") {
  return parseHubConfig({
    ITHYNO_GITLAB_ORIGIN: "https://gitlab.example.com",
    ...(token === null ? {} : { ITHYNO_GITLAB_TOKEN: token }),
    ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
    ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "relay-secret",
    ITHYNO_HUB_WEBHOOK_SECRET: "webhook-secret",
    ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE: "none",
    ITHYNO_HUB_STATE_PATH: "/tmp/ithyno-test",
  });
}

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

    const config = createConfig();
    const client = createDefaultGitLabClient(config);

    await expect(client.getDefaultBranch("group/project")).resolves.toBe("main");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ "PRIVATE-TOKEN": "test-token" }),
        redirect: "manual",
      }),
    );

    const noTokenConfig = createConfig(null);
    expect(() => createDefaultGitLabClient(noTokenConfig)).toThrow("gitlab token is required for writes");
  });

  it("rejects response payloads that target a different origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ default_branch: "main", web_url: "https://evil.example.com/group/project" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = createDefaultGitLabClient(createConfig());

    await expect(client.getDefaultBranch("group/project")).rejects.toThrow("gitlab target origin mismatch");
  });

  it("refuses redirects and redacts the configured token from error text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("PRIVATE-TOKEN: test-token", {
      status: 400,
      headers: { "content-type": "text/plain" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = createDefaultGitLabClient(createConfig("test-token"));

    await expect(client.getDefaultBranch("group/project")).rejects.toMatchObject({
      responseBody: expect.stringContaining("[REDACTED]"),
    });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }));
  });

  it("updates existing issue comments through the issue-notes endpoint", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (url.includes("/issues/42/notes?per_page=100")) {
        return new Response(JSON.stringify([{ id: 99, body: "ithyno-hub:marker\n\nold" }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/issues/42/notes/99")) {
        return new Response(JSON.stringify({ id: 99 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createDefaultGitLabClient(createConfig());
    await client.upsertIssueComment("group/project", "42", "ithyno-hub:marker", "new");

    expect(calls.some((call) => call.url.includes("/issues/42/notes/99") && call.method === "PUT")).toBe(true);
  });

  it("creates a new draft merge request when only closed or merged ones are returned", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? String(init.body) : undefined });
      if (url.includes("/merge_requests?state=opened")) {
        return new Response(JSON.stringify([{ iid: 7, web_url: "https://gitlab.example.com/group/project/-/merge_requests/7", source_branch: "change/42", state: "closed", draft: true }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/merge_requests") && method === "POST") {
        return new Response(JSON.stringify({ iid: 8, web_url: "https://gitlab.example.com/group/project/-/merge_requests/8" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createDefaultGitLabClient(createConfig());
    const result = await client.upsertMergeRequest("group/project", "42", "change/42", "main", "Draft", "body");

    expect(result.iid).toBe("8");
    const postCall = calls.find((call) => call.method === "POST" && call.url.includes("/merge_requests"));
    expect(postCall?.body).toContain('"draft":true');
    expect(postCall?.body).toContain('"title":"Draft: Draft"');
  });

  it("updates an existing open merge request in place without sending a reopen event", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? String(init.body) : undefined });
      if (url.includes("/merge_requests?state=opened")) {
        return new Response(JSON.stringify([{ iid: 7, web_url: "https://gitlab.example.com/group/project/-/merge_requests/7", source_branch: "change/42", state: "opened", draft: false }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/merge_requests/7") && method === "PUT") {
        return new Response(JSON.stringify({ iid: 7, web_url: "https://gitlab.example.com/group/project/-/merge_requests/7" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createDefaultGitLabClient(createConfig());
    const result = await client.upsertMergeRequest("group/project", "42", "change/42", "main", "Draft", "body");

    expect(result.iid).toBe("7");
    const putCall = calls.find((call) => call.method === "PUT" && call.url.includes("/merge_requests/7"));
    expect(putCall?.body).toContain('"draft":true');
    expect(putCall?.body).toContain('"title":"Draft: Draft"');
    expect(putCall?.body).not.toContain('"state_event":"reopen"');
  });

  it("rejects array payloads that contain a URL from a different origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ iid: 7, web_url: "https://evil.example.com/group/project/-/merge_requests/7" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const client = createDefaultGitLabClient(createConfig());

    await expect(client.findMergeRequest("group/project", "42", "change/42")).rejects.toThrow("gitlab target origin mismatch");
  });
});
