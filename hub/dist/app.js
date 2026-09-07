// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { buildHubEventEnvelope, isSupportedHubEventVersion } from "@ithyno/shared";
export async function startHubRuntime(config) {
    await mkdir(dirname(resolve(config.statePath)), { recursive: true });
    const app = Fastify({ logger: false });
    const subscribers = new Set();
    app.get("/healthz", async () => ({ ok: true, service: "ithyno-hub" }));
    app.get("/readyz", async () => ({ ok: true, service: "ithyno-hub" }));
    app.post("/webhooks/gitlab", async (request, reply) => {
        const body = request.body;
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
            if (!subscriber.projectIds.has(projectId))
                continue;
            subscriber.ws.send(JSON.stringify(envelope));
        }
        reply.code(202).send({ accepted: true, envelopeVersion: envelope.version, projectId });
    });
    await app.listen({ host: config.host, port: config.port });
    const wss = new WebSocketServer({ server: app.server });
    wss.on("connection", (ws) => {
        const subscriber = { ws, projectIds: new Set() };
        ws.on("message", (raw) => {
            const data = raw.toString();
            try {
                const payload = JSON.parse(data);
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
            }
            catch {
                ws.close(1008, "invalid subscription request");
            }
        });
        subscribers.add(subscriber);
        ws.on("close", () => subscribers.delete(subscriber));
    });
    const close = async () => {
        await Promise.allSettled([
            new Promise((resolve) => wss.close(() => resolve())),
            app.close(),
        ]);
    };
    return { app, close };
}
