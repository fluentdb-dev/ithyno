// SPDX-License-Identifier: GPL-3.0-or-later
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_TOKEN } from "./util/auth.js";
import { registerTmuxRoutes } from "./tmux-routes.js";
import type { TmuxCommandRunner } from "./tmux-browser.js";

const windows = "@1\t0\tmanager\t1\t1\tlayout\n";
const panes = "%1\t@1\t0\t0\tManager\t1\t100\t30\t/tmp/project\n";

function runner(): TmuxCommandRunner {
  return vi.fn(async (args) => {
    if (args[0] === "-V") return { stdout: "tmux 3.6a\n", stderr: "" };
    if (args[0] === "list-windows") return { stdout: windows, stderr: "" };
    if (args[0] === "list-panes") return { stdout: panes, stderr: "" };
    if (args[0] === "capture-pane") return { stdout: "retained history\n", stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

const apps: Array<ReturnType<typeof Fastify>> = [];
async function app(run = runner(), root = "/tmp/project") {
  const instance = Fastify();
  apps.push(instance);
  await instance.register(registerTmuxRoutes, {
    getProjectRoot: () => root,
    isLocal: (address) => address === "127.0.0.1",
    runner: run,
    platform: "darwin",
  });
  await instance.ready();
  return instance;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((instance) => instance.close()));
});

describe("tmux browser routes", () => {
  it("requires the session token for read endpoints", async () => {
    const instance = await app();
    expect((await instance.inject({ method: "GET", url: "/api/tmux/topology" })).statusCode).toBe(401);
    expect((await instance.inject({ method: "GET", url: "/api/tmux/history?paneId=%251" })).statusCode).toBe(401);
  });

  it("returns only topology produced for the configured project", async () => {
    const run = runner();
    const instance = await app(run, "/tmp/project-a");
    const response = await instance.inject({
      method: "GET",
      url: "/api/tmux/topology",
      headers: { "x-session-token": SESSION_TOKEN },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().session.windows[0].panes[0].id).toBe("%1");
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["has-session", "-t"]));
  });

  it("rejects malformed or arbitrary selection targets", async () => {
    const run = runner();
    const instance = await app(run);
    const headers = { "x-session-token": SESSION_TOKEN, "content-type": "application/json" };
    expect((await instance.inject({ method: "POST", url: "/api/tmux/select", headers, payload: {} })).statusCode).toBe(400);
    expect((await instance.inject({ method: "POST", url: "/api/tmux/select", headers, payload: { paneId: "%99" } })).statusCode).toBe(409);
    expect(run).not.toHaveBeenCalledWith(["select-pane", "-t", "%99"]);
  });

  it("serves the allowlisted tmux action catalog and executes validate actions", async () => {
    const run = runner();
    const instance = await app(run);
    const headers = { "x-session-token": SESSION_TOKEN };

    const catalogResponse = await instance.inject({ method: "GET", url: "/api/tmux/actions", headers });
    expect(catalogResponse.statusCode).toBe(200);
    expect(catalogResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "next-window", availability: "executable", shortcut: "Ctrl+B → n" }),
      expect.objectContaining({ id: "kill-pane", availability: "reference-only", shortcut: "Ctrl+B → x" }),
      expect.objectContaining({ id: "refresh-topology", availability: "client-only", shortcut: "Click Refresh" }),
    ]));

    const actionResponse = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers: { ...headers, "content-type": "application/json" },
      payload: { actionId: "next-window" },
    });
    expect(actionResponse.statusCode).toBe(200);
    expect(actionResponse.json()).toMatchObject({ ok: true, actionId: "next-window" });
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(["next-window", "-t"]));

    const closePaneResponse = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers: { ...headers, "content-type": "application/json" },
      payload: { actionId: "close-pane", paneId: "%1" },
    });
    expect(closePaneResponse.statusCode).toBe(200);
    expect(closePaneResponse.json()).toMatchObject({ ok: true, actionId: "close-pane", paneId: "%1" });
    expect(run).toHaveBeenCalledWith(["kill-pane", "-t", "%1"]);
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(["kill-session", "-t"]));

    const rejected = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers: { ...headers, "content-type": "application/json" },
      payload: { actionId: "kill-pane" },
    });
    expect(rejected.statusCode).toBe(501);
  });

  it("rejects exact body shape violations and extra fields before invoking tmux", async () => {
    const run = runner();
    const instance = await app(run);
    const headers = { "x-session-token": SESSION_TOKEN, "content-type": "application/json" };

    const badBody = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers,
      payload: { actionId: "next-window", projectRoot: "/tmp/project" },
    });
    expect(badBody.statusCode).toBe(400);
    expect(badBody.json()).toMatchObject({ error: "exact body shape is { actionId: string }" });
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(["next-window", "-t"]));

    const missing = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers,
      payload: { actionId: 42 },
    });
    expect(missing.statusCode).toBe(400);
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(["next-window", "-t"]));

    const targetInjected = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers,
      payload: { actionId: "kill-session", sessionName: "other" },
    });
    expect(targetInjected.statusCode).toBe(400);
    expect(targetInjected.json()).toMatchObject({ error: "exact body shape is { actionId: string }" });
    expect(run).not.toHaveBeenCalledWith(["kill-session", "-t", "other"]);

    const paneTargetInjected = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers,
      payload: { actionId: "close-pane", paneId: "%1", sessionName: "other" },
    });
    expect(paneTargetInjected.statusCode).toBe(400);
    expect(paneTargetInjected.json()).toMatchObject({ error: "exact body shape is { actionId: \"close-pane\", paneId: string }" });
    expect(run).not.toHaveBeenCalledWith(["kill-pane", "-t", "%1"]);

    const paneNotInSession = await instance.inject({
      method: "POST",
      url: "/api/tmux/action",
      headers,
      payload: { actionId: "close-pane", paneId: "%99" },
    });
    expect(paneNotInSession.statusCode).toBe(409);
    expect(run).not.toHaveBeenCalledWith(["kill-pane", "-t", "%99"]);
  });

  it("serializes same-project actions so concurrent requests never overlap", async () => {
    let active = 0;
    let maxActive = 0;
    const run = vi.fn(async (args) => {
      if (args[0] === "-V") return { stdout: "tmux 3.6a\n", stderr: "" };
      if (args[0] === "has-session") return { stdout: "", stderr: "" };
      if (args[0] === "list-windows") return { stdout: windows, stderr: "" };
      if (args[0] === "list-panes") return { stdout: panes, stderr: "" };
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return { stdout: "", stderr: "" };
    });
    const instance = await app(run);
    const headers = { "x-session-token": SESSION_TOKEN, "content-type": "application/json" };

    await Promise.all([
      instance.inject({ method: "POST", url: "/api/tmux/action", headers, payload: { actionId: "next-window" } }),
      instance.inject({ method: "POST", url: "/api/tmux/action", headers, payload: { actionId: "previous-window" } }),
    ]);

    expect(maxActive).toBe(1);
  });

  it("captures validated pane history with bounded line input", async () => {
    const instance = await app();
    const headers = { "x-session-token": SESSION_TOKEN };
    const response = await instance.inject({
      method: "GET",
      url: "/api/tmux/history?paneId=%251&lines=100",
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ paneId: "%1", content: "retained history\n", lineLimit: 100 });
    expect((await instance.inject({ method: "GET", url: "/api/tmux/history?paneId=%251&lines=0", headers })).statusCode).toBe(400);
  });
});
