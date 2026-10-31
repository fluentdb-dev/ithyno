// SPDX-License-Identifier: GPL-3.0-or-later
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { extractToken, verifyToken } from "./util/auth.js";
import {
  captureTmuxPaneHistory,
  executeTmuxAction,
  getAvailableTmuxCommands,
  getDefaultTmuxRunner,
  getTmuxActionCatalog,
  getTmuxTopology,
  selectTmuxTarget,
  TmuxBrowserError,
  type TmuxCommandRunner,
} from "./tmux-browser.js";

export type TmuxRoutesOptions = {
  getProjectRoot: () => string;
  isLocal: (address: string | undefined) => boolean;
  runner?: TmuxCommandRunner;
  platform?: NodeJS.Platform;
};

function authorized(req: { headers: unknown; url: string }): boolean {
  const token = extractToken({
    headers: req.headers as Record<string, string | string[] | undefined>,
    url: req.url,
  });
  return !!token && verifyToken(token);
}

function errorStatus(error: unknown): number {
  if (!(error instanceof TmuxBrowserError)) return 500;
  if (error.kind === "unavailable" || error.kind === "unsupported") return 501;
  if (error.kind === "session-missing" || error.kind === "target-missing") return 409;
  return 500;
}

export const registerTmuxRoutes: FastifyPluginAsync<TmuxRoutesOptions> = async (
  fastify: FastifyInstance,
  options,
) => {
  const operationOptions = { runner: options.runner, platform: options.platform };
  const projectActionLocks = new Map<string, Promise<void>>();
  const withProjectActionLock = async <T>(projectRoot: string, action: () => Promise<T>): Promise<T> => {
    const previous = projectActionLocks.get(projectRoot) ?? Promise.resolve();
    const run = previous.then(() => action());
    projectActionLocks.set(projectRoot, run.then(() => undefined, () => undefined));
    return await run;
  };

  fastify.get("/api/tmux/topology", async (req, reply) => {
    if (!options.isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
    if (!authorized(req)) return reply.code(401).send({ error: "auth required" });
    return getTmuxTopology(options.getProjectRoot(), operationOptions);
  });

  fastify.post<{ Body: { windowId?: unknown; paneId?: unknown } }>("/api/tmux/select", async (req, reply) => {
    if (!options.isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
    if (!authorized(req)) return reply.code(401).send({ error: "auth required" });
    const body = req.body ?? {};
    const windowId = typeof body.windowId === "string" ? body.windowId : undefined;
    const paneId = typeof body.paneId === "string" ? body.paneId : undefined;
    if ((windowId ? 1 : 0) + (paneId ? 1 : 0) !== 1) {
      return reply.code(400).send({ error: "exactly one of windowId or paneId is required" });
    }
    try {
      await selectTmuxTarget(options.getProjectRoot(), { windowId, paneId }, operationOptions);
      return { ok: true };
    } catch (error) {
      return reply.code(errorStatus(error)).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.get<{ Querystring: { paneId?: string; lines?: string } }>("/api/tmux/history", async (req, reply) => {
    if (!options.isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
    if (!authorized(req)) return reply.code(401).send({ error: "auth required" });
    const paneId = req.query.paneId;
    if (!paneId) return reply.code(400).send({ error: "paneId is required" });
    const lines = req.query.lines === undefined ? undefined : Number(req.query.lines);
    if (lines !== undefined && (!Number.isInteger(lines) || lines <= 0)) {
      return reply.code(400).send({ error: "lines must be a positive integer" });
    }
    try {
      return await captureTmuxPaneHistory(options.getProjectRoot(), paneId, lines, operationOptions);
    } catch (error) {
      return reply.code(errorStatus(error)).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.get('/api/tmux/actions', async (req, reply) => {
    if (!options.isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
    if (!authorized(req)) return reply.code(401).send({ error: "auth required" });
    try {
      const topology = await getTmuxTopology(options.getProjectRoot(), operationOptions);
      if (!topology.available || !topology.session) {
        return reply.code(409).send({ error: topology.reason ?? "No tmux session exists for this project" });
      }
      const provider = topology.provider ?? "tmux";
      let availableCommands: Set<string> | undefined;
      if (provider === "psmux") {
        const runner = operationOptions.runner ?? getDefaultTmuxRunner();
        try {
          availableCommands = await getAvailableTmuxCommands(runner, "psmux");
        } catch {
          // Probe failure: no proven commands; leave availableCommands undefined
        }
      }
      return getTmuxActionCatalog(provider, availableCommands);
    } catch (error) {
      return reply.code(500).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.post<{ Body: { actionId?: unknown; paneId?: unknown } }>('/api/tmux/action', async (req, reply) => {
    if (!options.isLocal(req.socket.remoteAddress ?? undefined)) return reply.code(403).send({ error: "local only" });
    if (!authorized(req)) return reply.code(401).send({ error: "auth required" });
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return reply.code(400).send({ error: "exact body shape must be { actionId: string } or { actionId: \"close-pane\", paneId: string }" });
    }
    const keys = Object.keys(body);
    const actionId = typeof body.actionId === "string" ? body.actionId : undefined;
    if (!actionId) {
      return reply.code(400).send({ error: "actionId must be a non-empty string" });
    }

    if (actionId === "close-pane") {
      if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(body, "paneId") || typeof body.paneId !== "string" || body.paneId.length === 0) {
        return reply.code(400).send({ error: "exact body shape is { actionId: \"close-pane\", paneId: string }" });
      }
      try {
        const projectRoot = options.getProjectRoot();
        const result = await withProjectActionLock(projectRoot, async () => executeTmuxAction(projectRoot, actionId, operationOptions, body.paneId as string));
        return { ok: true, actionId: result.actionId, paneId: body.paneId };
      } catch (error) {
        return reply.code(errorStatus(error)).send({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (keys.length !== 1 || !Object.prototype.hasOwnProperty.call(body, "actionId")) {
      return reply.code(400).send({ error: "exact body shape is { actionId: string }" });
    }

    try {
      const projectRoot = options.getProjectRoot();
      const result = await withProjectActionLock(projectRoot, async () => executeTmuxAction(projectRoot, actionId, operationOptions));
      return { ok: true, actionId: result.actionId };
    } catch (error) {
      return reply.code(errorStatus(error)).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });
};
