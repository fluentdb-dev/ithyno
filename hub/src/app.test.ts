// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { classifyWebhookEvent, parseWebhookPayload, verifyWebhookRequest } from "./app.js";
import { parseHubConfig } from "./config.js";

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
    const signature = `sha256=${createHash("sha256").update(body).digest("hex")}`;
    expect(verifyWebhookRequest(config, { "x-gitlab-signature": signature }, body)).toEqual({ ok: true, reason: "ok" });
    expect(verifyWebhookRequest(config, { "x-gitlab-signature": "sha256=deadbeef" }, body)).toEqual({ ok: false, reason: "invalid-signature" });
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
});
