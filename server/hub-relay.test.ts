// SPDX-License-Identifier: GPL-3.0-or-later
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { isAllowedHubNotificationTarget, startHubRelay } from "./hub-relay.js";

const relayServers: WebSocketServer[] = [];

afterEach(async () => {
  await Promise.all(relayServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("hub relay safety", () => {
  it("accepts notifications for configured GitLab origins and projects", () => {
    const allowed = isAllowedHubNotificationTarget(
      { projectId: "group/project", targetUrl: "https://gitlab.example.com/group/project/-/issues/1" },
      { gitlabOrigin: "https://gitlab.example.com", projectIds: ["group/project"] },
    );
    expect(allowed).toBe(true);
  });

  it("rejects notifications outside the configured origin or project", () => {
    expect(
      isAllowedHubNotificationTarget(
        { projectId: "group/project", targetUrl: "https://evil.example.com/group/project/-/issues/1" },
        { gitlabOrigin: "https://gitlab.example.com", projectIds: ["group/project"] },
      ),
    ).toBe(false);
    expect(
      isAllowedHubNotificationTarget(
        { projectId: "other/project", targetUrl: "https://gitlab.example.com/other/project/-/issues/1" },
        { gitlabOrigin: "https://gitlab.example.com", projectIds: ["group/project"] },
      ),
    ).toBe(false);
  });

  it("preserves standalone behavior with no hub configuration", () => {
    const statuses: string[] = [];
    const handle = startHubRelay({
      hubUrl: undefined,
      hubCredential: undefined,
      onConnectionStatus: (status) => statuses.push(status),
    });
    expect(statuses).toContain("disconnected");
    handle.close();
  });

  it("relays events from the hub to the workstation callback", async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    relayServers.push(server);
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    const events: Array<{ type: string; projectId: string }> = [];
    const statuses: string[] = [];

    server.on("connection", (socket) => {
      socket.on("message", (raw) => {
        if (raw.toString().includes("projectIds")) {
          socket.send(JSON.stringify({ version: 1, type: "issue", projectId: "group/project", title: "Relay test", body: {}, targetUrl: "https://gitlab.example.com/group/project/-/issues/1", occurredAt: "2024-01-01T00:00:00.000Z" }));
        }
      });
    });

    const handle = startHubRelay({
      hubUrl: `ws://127.0.0.1:${address.port}`,
      hubCredential: "relay-secret",
      onEvent: (event) => events.push({ type: event.type, projectId: event.projectId }),
      onConnectionStatus: (status) => statuses.push(status),
    });

    await once(server, "connection");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(statuses).toContain("connected");
    expect(events).toEqual([{ type: "issue", projectId: "group/project" }]);
    handle.close();
  });
});
