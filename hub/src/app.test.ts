// SPDX-License-Identifier: GPL-3.0-or-later
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Database } from "sqlite3";
import { startHubRuntime, classifyWebhookEvent, parseWebhookPayload, verifyWebhookRequest } from "./app.js";
import { parseHubConfig } from "./config.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
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
