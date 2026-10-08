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
