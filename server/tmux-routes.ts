// SPDX-License-Identifier: GPL-3.0-or-later
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { extractToken, verifyToken } from "./util/auth.js";
import {
  captureTmuxPaneHistory,
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
};
