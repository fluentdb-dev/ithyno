// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import { buildHubEventEnvelope, isSupportedHubEventVersion } from "@ithyno/shared";
import type { HubConfig } from "./config.js";

interface Subscriber {
  ws: WebSocket;
  projectIds: Set<string>;
}

export interface HubRuntime {
  app: ReturnType<typeof Fastify>;
  close: () => Promise<void>;
}

export async function startHubRuntime(config: HubConfig): Promise<HubRuntime> {
  await mkdir(dirname(resolve(config.statePath)), { recursive: true });
  const app = Fastify({ logger: false });
  const subscribers = new Set<Subscriber>();

  app.get("/healthz", async () => ({ ok: true, service: "ithyno-hub" }));
  app.get("/readyz", async () => ({ ok: true, service: "ithyno-hub" }));

  app.post("/webhooks/gitlab", async (request, reply) => {
    const body = request.body as
      | {
          event_type?: string;
          object_kind?: string;
          project?: { path_with_namespace?: string; name?: string; web_url?: string };
          project_id?: string | number;
          title?: string;
          target_url?: string;
        }
      | undefined;
    const eventType = String(body?.event_type ?? body?.object_kind ?? "webhook.received");
    const projectId = String(body?.project?.path_with_namespace ?? body?.project_id ?? "unknown/project");
    const title = String(body?.project?.name ?? body?.title ?? eventType);
    const targetUrl = String(body?.project?.web_url ?? body?.target_url ?? `${config.gitlabOrigin}/${projectId}`);
    const envelope = buildHubEventEnvelope({
      type: eventType,
      projectId,
      title,
      body: JSON.stringify(body ?? {}),
      targetUrl,
    });
    for (const subscriber of subscribers) {
      if (!subscriber.projectIds.has(projectId)) continue;
      subscriber.ws.send(JSON.stringify(envelope));
    }
    reply.code(202).send({ accepted: true, envelopeVersion: envelope.version, projectId });
  });

  await app.listen({ host: config.host, port: config.port });
  const wss = new WebSocketServer({ server: app.server });
  wss.on("connection", (ws) => {
    const subscriber: Subscriber = { ws, projectIds: new Set<string>() };
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
        subscriber.projectIds = new Set(payload.projectIds ?? []);
        ws.send(JSON.stringify({ type: "ready", version: 1 }));
      } catch {
        ws.close(1008, "invalid subscription request");
      }
    });
    subscribers.add(subscriber);
    ws.on("close", () => subscribers.delete(subscriber));
  });

  const close = async () => {
    await Promise.allSettled([
      new Promise<void>((resolve) => wss.close(() => resolve())),
      app.close(),
    ]);
  };
  return { app, close };
}
