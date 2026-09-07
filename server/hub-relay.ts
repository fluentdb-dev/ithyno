// SPDX-License-Identifier: GPL-3.0-or-later
import { WebSocket } from "ws";
import { buildHubEventEnvelope, type HubEventEnvelope } from "@ithyno/shared";

export interface HubRelayConfig {
  hubUrl?: string;
  hubCredential?: string;
  onEvent?: (event: HubEventEnvelope) => void;
}

export interface HubRelayHandle {
  close: () => void;
}

export function startHubRelay(config: HubRelayConfig): HubRelayHandle {
  if (!config.hubUrl || !config.hubCredential) {
    return { close: () => undefined };
  }
  let socket: WebSocket | null = null;
  let closed = false;
  const connect = () => {
    if (closed) return;
    socket = new WebSocket(config.hubUrl!, {
      headers: { Authorization: `Bearer ${config.hubCredential}` },
    });
    socket.on("open", () => {
      socket?.send(JSON.stringify({ credential: config.hubCredential, projectIds: [], protocolVersion: 1 }));
    });
    socket.on("message", (raw) => {
      const data = raw.toString();
      try {
        const event = JSON.parse(data) as HubEventEnvelope;
        config.onEvent?.(event);
      } catch {
        const fallback = buildHubEventEnvelope({
          type: "hub.message",
          projectId: "unknown/project",
          title: "Hub message",
          body: data,
          targetUrl: config.hubUrl ?? "",
        });
        config.onEvent?.(fallback);
      }
    });
    socket.on("close", () => {
      if (!closed) setTimeout(connect, 1000);
    });
  };
  connect();
  return { close: () => { closed = true; socket?.close(); } };
}
