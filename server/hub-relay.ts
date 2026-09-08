// SPDX-License-Identifier: GPL-3.0-or-later
import { WebSocket } from "ws";
import { buildHubEventEnvelope, type HubEventEnvelope } from "@ithyno/shared";

export type HubConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface HubRelayConfig {
  hubUrl?: string;
  hubCredential?: string;
  projectIds?: string[];
  onEvent?: (event: HubEventEnvelope) => void;
  onConnectionStatus?: (status: HubConnectionStatus) => void;
}

export interface HubRelayHandle {
  close: () => void;
}

export function isAllowedHubNotificationTarget(
  event: Pick<HubEventEnvelope, "projectId" | "targetUrl">,
  config: { gitlabOrigin: string; projectIds?: string[] },
): boolean {
  const targetUrl = event.targetUrl?.trim();
  if (!targetUrl) return false;
  try {
    const parsedUrl = new URL(targetUrl);
    const configuredOrigin = new URL(config.gitlabOrigin).origin;
    if (parsedUrl.origin !== configuredOrigin) return false;
    const projectIds = (config.projectIds ?? []).map((value) => normalizeProjectPath(value)).filter(Boolean);
    if (projectIds.length === 0) return false;
    const normalizedProject = normalizeProjectPath(event.projectId);
    if (!normalizedProject) return false;
    const normalizedTargetPath = normalizeProjectPath(parsedUrl.pathname);
    return projectIds.some((projectId) => {
      if (projectId === normalizedProject) return true;
      return normalizedTargetPath.includes(`/${projectId}`) || normalizedTargetPath === projectId;
    });
  } catch {
    return false;
  }
}

export function startHubRelay(config: HubRelayConfig): HubRelayHandle {
  if (!config.hubUrl || !config.hubCredential) {
    return { close: () => undefined };
  }
  let socket: WebSocket | null = null;
  let closed = false;
  let reconnectAttempts = 0;
  const connect = () => {
    if (closed) return;
    config.onConnectionStatus?.("connecting");
    socket = new WebSocket(config.hubUrl!, {
      headers: { Authorization: `Bearer ${config.hubCredential}` },
    });
    socket.on("open", () => {
      reconnectAttempts = 0;
      config.onConnectionStatus?.("connected");
      socket?.send(JSON.stringify({ projectIds: config.projectIds ?? [], protocolVersion: 1 }));
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
    socket.on("error", () => {
      config.onConnectionStatus?.("reconnecting");
    });
    socket.on("close", () => {
      if (!closed) {
        const jitter = Math.floor(Math.random() * 250);
        const delay = Math.min(1000 * 2 ** reconnectAttempts + jitter, 10000);
        reconnectAttempts += 1;
        config.onConnectionStatus?.("reconnecting");
        setTimeout(connect, delay);
      }
    });
  };
  connect();
  return {
    close: () => {
      closed = true;
      config.onConnectionStatus?.("disconnected");
      socket?.close();
    },
  };
}

function normalizeProjectPath(value: string): string {
  return value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}
