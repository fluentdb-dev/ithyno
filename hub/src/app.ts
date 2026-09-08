// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash, createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Server as HttpServer } from "node:http";
import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import { buildHubEventEnvelope, isSupportedHubEventVersion } from "@ithyno/shared";
import type { HubConfig } from "./config.js";
import { createOperationalStore, type OperationalStore } from "./store.js";

interface Subscriber {
  ws: WebSocket;
  projectIds: Set<string>;
}

interface ParsedWebhookPayload {
  eventType: string;
  projectId: string;
  title: string;
  targetUrl: string;
  body: Record<string, unknown>;
  supported: boolean;
  reason?: string;
}

export interface HubRuntime {
  app: ReturnType<typeof Fastify>;
  close: () => Promise<void>;
}

const JOB_PROCESSOR_INTERVAL_MS = 5000;
const JOB_LEASE_DURATION_MS = 15000;
const JOB_MAX_ATTEMPTS = 5;

export async function startHubRuntime(config: HubConfig): Promise<HubRuntime> {
  await mkdir(dirname(resolve(config.statePath)), { recursive: true });
  const store = createOperationalStore(config.statePath, config.retentionMs);
  await store.initialize();
  const app = Fastify({ logger: false });
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    done(null, body.toString());
  });
  const subscribers = new Set<Subscriber>();
  const jobProcessor = startJobProcessor(store);

  app.get("/healthz", async () => ({ ok: true, service: "ithyno-hub" }));
  app.get("/readyz", async () => ({ ok: true, service: "ithyno-hub" }));

  app.post("/webhooks/gitlab", async (request, reply) => {
    const bodyText = typeof request.body === "string" ? request.body : undefined;
    const parsedBody = parseBody(bodyText, request.body);
    const verification = verifyWebhookRequest(config, request.headers, bodyText);
    if (!verification.ok) {
      await store.recordAudit("webhook.received", "unknown/project", "rejected", verification.reason);
      return reply.code(401).send({ accepted: false, reason: verification.reason });
    }
    const payload = parseWebhookPayload(parsedBody, config);
    const projectAllowed = isProjectAllowed(config.projectAllowlist, payload.projectId);
    if (!projectAllowed) {
      const auditDetail = `project ${payload.projectId} rejected by allowlist`;
      await store.recordAudit(payload.eventType, payload.projectId, "rejected", auditDetail);
      return reply.code(403).send({ accepted: false, reason: "project-not-allowlisted" });
    }
    const deliveryId = extractDeliveryIdentity(request.headers, parsedBody, bodyText);
    const envelope = buildHubEventEnvelope({
      type: payload.eventType,
      projectId: payload.projectId,
      title: payload.title,
      body: payload.body,
      targetUrl: payload.targetUrl,
    });
    if (!payload.supported) {
      await store.recordDelivery({
        id: deliveryId,
        eventType: payload.eventType,
        projectId: payload.projectId,
        title: payload.title,
        targetUrl: payload.targetUrl,
        payloadRef: hashValue(bodyText ?? JSON.stringify(parsedBody)),
        status: "accepted",
        attempts: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await store.recordAudit(payload.eventType, payload.projectId, "ignored", payload.reason ?? "unsupported-event");
      return reply.code(202).send({ accepted: true, envelopeVersion: envelope.version, projectId: payload.projectId, ignored: true, reason: payload.reason });
    }
    await store.recordDelivery({
      id: deliveryId,
      eventType: payload.eventType,
      projectId: payload.projectId,
      title: payload.title,
      targetUrl: payload.targetUrl,
      payloadRef: hashValue(bodyText ?? JSON.stringify(parsedBody)),
      status: "queued",
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await store.createJob(deliveryId, payload.eventType, payload.projectId, payload.title, payload.targetUrl);
    for (const subscriber of subscribers) {
      if (!shouldDeliverToSubscriber(subscriber, payload.projectId)) continue;
      subscriber.ws.send(JSON.stringify(envelope));
    }
    reply.code(202).send({ accepted: true, envelopeVersion: envelope.version, projectId: payload.projectId, deliveryId });
  });

  await app.listen({ host: config.host, port: config.port });
  const wss = new WebSocketServer({ server: app.server as HttpServer });
  wss.on("connection", (ws, request) => {
    const authHeader = getHeaderValue(request.headers, "authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ws.close(1008, "unauthorized");
      return;
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (token !== config.workstationSubscriptionCredential) {
      ws.close(1008, "unauthorized");
      return;
    }
    const subscriber: Subscriber = { ws, projectIds: new Set(config.projectAllowlist) };
    ws.on("message", (raw) => {
      const data = raw.toString();
      try {
        const payload = JSON.parse(data) as { projectIds?: string[]; credential?: string; protocolVersion?: number };
        if (payload.credential && payload.credential !== config.workstationSubscriptionCredential) {
          ws.close(1008, "unauthorized");
          return;
        }
        if (!isSupportedHubEventVersion(payload.protocolVersion ?? 1)) {
          ws.close(1008, "unsupported protocol version");
          return;
        }
        if (payload.projectIds !== undefined) {
          subscriber.projectIds = new Set((payload.projectIds ?? []).filter((value): value is string => typeof value === "string" && Boolean(value)));
        } else {
          subscriber.projectIds = new Set(config.projectAllowlist);
        }
        ws.send(JSON.stringify({ type: "ready", version: 1 }));
      } catch {
        ws.close(1008, "invalid subscription request");
      }
    });
    subscribers.add(subscriber);
    ws.on("close", () => subscribers.delete(subscriber));
  });

  const close = async () => {
    jobProcessor.stop();
    await Promise.allSettled([
      new Promise<void>((resolve) => wss.close(() => resolve())),
      app.close(),
      store.close(),
    ]);
  };
  return { app, close };
}

function parseBody(bodyText: string | undefined, requestBody: unknown): Record<string, unknown> {
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // fall through to the original request body
    }
  }
  if (requestBody && typeof requestBody === "object") {
    return requestBody as Record<string, unknown>;
  }
  return {};
}

function resolveWebhookTitle(body: Record<string, unknown>, project: Record<string, unknown> | undefined, fallback: string): string {
  const objectAttributes = body.object_attributes as Record<string, unknown> | undefined;
  const providedTitle = String(
    (objectAttributes?.title as string | undefined)
      ?? (body.title as string | undefined)
      ?? (project?.name as string | undefined)
      ?? fallback,
  );
  return providedTitle || fallback;
}

export function parseWebhookPayload(body: Record<string, unknown>, config: HubConfig): ParsedWebhookPayload {
  const project = body.project as Record<string, unknown> | undefined;
  const eventType = String(body.event_type ?? body.object_kind ?? body.event_name ?? "webhook.received");
  const projectId = String(
    (project?.path_with_namespace as string | undefined)
      ?? (project?.path as string | undefined)
      ?? (project?.full_path as string | undefined)
      ?? (body.project_id as string | undefined)
      ?? (project?.id as string | undefined)
      ?? "unknown/project",
  );
  const title = resolveWebhookTitle(body, project, eventType);
  const targetUrl = String((project?.web_url as string | undefined) ?? (body.target_url as string | undefined) ?? `${config.gitlabOrigin}/${projectId}`);
  const classification = classifyWebhookEvent(body, config);
  return {
    eventType,
    projectId,
    title,
    targetUrl,
    body: {
      eventType,
      projectId,
      title,
      targetUrl,
      classification: classification.kind,
    },
    supported: classification.supported,
    reason: classification.reason,
  };
}

export function classifyWebhookEvent(body: Record<string, unknown>, config: HubConfig): { kind: string; supported: boolean; reason?: string } {
  const objectKind = String((body as Record<string, unknown>).object_kind ?? (body as Record<string, unknown>).event_type ?? (body as Record<string, unknown>).event_name ?? "").toLowerCase();
  const status = String((body as Record<string, unknown>).status ?? "").toLowerCase();
  const eventName = String((body as Record<string, unknown>).event_type ?? "").toLowerCase();
  const kind = isIssueEvent(objectKind, eventName)
    ? "issue"
    : isMergeRequestEvent(objectKind, eventName)
      ? "merge_request"
      : isNoteEvent(objectKind, eventName)
        ? "note"
        : isPushEvent(objectKind, eventName)
          ? "push"
          : isPipelineEvent(objectKind, eventName)
            ? "pipeline"
            : "unsupported";
  if (kind === "pipeline" && status && status !== "failed") {
    return { kind, supported: false, reason: "successful-pipeline" };
  }
  if (kind === "unsupported") {
    return { kind, supported: false, reason: "unsupported-event" };
  }
  if (isBotAuthoredEvent(body, config.botIdentity)) {
    return { kind, supported: false, reason: "bot-authored" };
  }
  return { kind, supported: true };
}

function isIssueEvent(objectKind: string, eventName: string): boolean {
  return objectKind === "issue" || eventName.includes("issue") || eventName.includes("work_item");
}

function isMergeRequestEvent(objectKind: string, eventName: string): boolean {
  return objectKind === "merge_request" || eventName.includes("merge_request");
}

function isNoteEvent(objectKind: string, eventName: string): boolean {
  return objectKind === "note" || eventName.includes("note") || eventName.includes("comment");
}

function isPushEvent(objectKind: string, eventName: string): boolean {
  return objectKind === "push" || eventName.includes("push");
}

function isPipelineEvent(objectKind: string, eventName: string): boolean {
  return objectKind === "pipeline" || eventName.includes("pipeline");
}

function isBotAuthoredEvent(body: Record<string, unknown>, botIdentity: string): boolean {
  const normalizedBot = botIdentity.trim().toLowerCase();
  const candidates = [
    (body as Record<string, unknown>).user_username,
    (body as Record<string, unknown>).user_name,
    (body as Record<string, unknown>).username,
    (body as Record<string, unknown>).author_username,
    (body as Record<string, unknown>).author_name,
    (body as Record<string, unknown>).user,
    (body as Record<string, unknown>).author,
    (body as Record<string, unknown>).object_attributes,
  ];
  return candidates.some((candidate) => {
    if (typeof candidate === "string") {
      return candidate.trim().toLowerCase() === normalizedBot;
    }
    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      const nestedUsername = String(
        nested.username ?? nested.user_name ?? nested.user ?? nested.assignee ?? nested.author ?? "",
      ).trim().toLowerCase();
      return nestedUsername === normalizedBot;
    }
    return false;
  });
}

export function verifyWebhookRequest(config: HubConfig, headers: Record<string, string | string[] | undefined>, bodyText: string | undefined): { ok: boolean; reason: string } {
  if (config.webhookVerificationMode === "none") {
    return { ok: true, reason: "ok" };
  }
  if (!bodyText) {
    return { ok: false, reason: "missing-body" };
  }
  if (config.webhookVerificationMode === "signed") {
    const signatureHeader = getHeaderValue(headers, "x-gitlab-signature");
    const timestampHeader = getHeaderValue(headers, "x-gitlab-timestamp");
    if (!signatureHeader) return { ok: false, reason: "missing-signature" };
    if (!timestampHeader) return { ok: false, reason: "missing-timestamp" };
    const timestamp = Number.parseInt(timestampHeader, 10);
    if (!Number.isFinite(timestamp)) return { ok: false, reason: "invalid-timestamp" };
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestamp) > 300) return { ok: false, reason: "expired-timestamp" };
    const expected = `sha256=${createHmac("sha256", config.webhookSecret).update(`${timestampHeader}.${bodyText}`).digest("hex")}`;
    if (!constantTimeCompare(signatureHeader, expected)) {
      return { ok: false, reason: "invalid-signature" };
    }
    return { ok: true, reason: "ok" };
  }
  const token = getHeaderValue(headers, "x-gitlab-token");
  if (!token) return { ok: false, reason: "missing-token" };
  if (!constantTimeCompare(token, config.webhookSecret)) {
    return { ok: false, reason: "invalid-token" };
  }
  return { ok: true, reason: "ok" };
}

function constantTimeCompare(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const length = Math.max(a.length, b.length);
  let diff = 0;
  for (let index = 0; index < length; index++) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0 && a.length === b.length;
}

function extractDeliveryIdentity(headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>, bodyText: string | undefined): string {
  const headerCandidates = [
    getHeaderValue(headers, "x-gitlab-event-uuid"),
    getHeaderValue(headers, "x-gitlab-event-id"),
    getHeaderValue(headers, "x-gitlab-delivery-id"),
    getHeaderValue(headers, "idempotency-key"),
  ];
  for (const candidate of headerCandidates) {
    if (candidate) return candidate;
  }
  const bodyCandidates = [
    String(body.event_id ?? ""),
    String(body.event_uuid ?? ""),
    String(body.id ?? ""),
    String(((body.object_attributes as Record<string, unknown> | undefined)?.id as string | undefined) ?? ""),
  ];
  for (const candidate of bodyCandidates) {
    if (candidate) return candidate;
  }
  return `fallback-${hashValue(bodyText ?? JSON.stringify(body))}`;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isProjectAllowed(allowlist: string[], projectId: string): boolean {
  const normalizedProject = normalizeProjectReference(projectId);
  return allowlist.some((entry) => normalizeProjectReference(entry) === normalizedProject);
}

function normalizeProjectReference(value: string): string {
  return value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

function shouldDeliverToSubscriber(subscriber: Subscriber, projectId: string): boolean {
  return subscriber.projectIds.size > 0 && subscriber.projectIds.has(projectId);
}

function getHeaderValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      if (Array.isArray(value)) return value[0];
      return value;
    }
  }
  return undefined;
}

function startJobProcessor(store: OperationalStore): { stop: () => void } {
  const processPendingJobs = async () => {
    try {
      await store.recoverExpiredLeases(Date.now());
      const jobs = await store.listReadyJobs(Date.now(), 10);
      for (const job of jobs) {
        const leaseExpiresAt = Date.now() + JOB_LEASE_DURATION_MS;
        const claimed = await store.claimJob(job.id, "hub-processor", leaseExpiresAt);
        if (!claimed) continue;
        const nextAttempt = job.attempts + 1;
        if (nextAttempt > JOB_MAX_ATTEMPTS) {
          await store.markJobTerminal(job.id, "retry-budget-exhausted");
          await store.recordAudit(job.eventType, job.projectId, "terminal_failed", "retry-budget-exhausted");
          continue;
        }
        const backoffMs = Math.min(1000 * 2 ** Math.max(0, nextAttempt - 1), 10000);
        const nextAttemptAt = Date.now() + backoffMs;
        await store.markJobRetry(job.id, nextAttempt, nextAttemptAt);
      }
    } catch (error) {
      console.error(`[hub] job processor failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  void processPendingJobs();
  const timer = setInterval(() => {
    void processPendingJobs();
  }, JOB_PROCESSOR_INTERVAL_MS);
  return {
    stop: () => clearInterval(timer),
  };
}
