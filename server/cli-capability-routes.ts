// SPDX-License-Identifier: GPL-3.0-or-later
import type { FastifyInstance } from "fastify";
import {
  CLI_CAPABILITY_CACHE,
  probeCliAdapter,
  probeFingerprintFromResult,
  resolveCliAdapter,
  resolveCliExecutablePath,
} from "./agents/cli-command-builder.js";
import { extractToken, verifyToken } from "./util/auth.js";

export async function inspectCliCapability(command: string) {
  const adapter = resolveCliAdapter(command);
  if (!adapter) {
    return {
      ok: false,
      supported: false,
      reason: "unsupported-command",
      command,
      adapter: null,
      fields: [],
      modelDiscovery: "none",
      modelGuidance: "This command has no allow-listed CLI adapter; use the manual Advanced args editor.",
      availableModels: [],
      modelMetadata: [],
      danger: [],
    };
  }

  const executablePath = resolveCliExecutablePath(command);
  const cachePrefix = `${adapter.id}:${executablePath || command}`;
  const cachedEntry = Array.from(CLI_CAPABILITY_CACHE.entries())
    .filter(([cacheKey]) => cacheKey.startsWith(`${cachePrefix}:`))
    .sort(([, left], [, right]) => right.expiresAt - left.expiresAt)[0];
  if (cachedEntry && Date.now() < cachedEntry[1].expiresAt) {
    return cachedEntry[1].result as Record<string, unknown>;
  }

  const result = await probeCliAdapter(adapter, executablePath || command);
  const fingerprint = probeFingerprintFromResult(result);
  const cacheKey = `${cachePrefix}:${fingerprint}`;
  const cacheValue = {
    ...result,
    command,
    ok: result.ok,
    supported: result.supported,
    reason: result.ok ? undefined : "probe-failed",
    executablePath,
    probeFingerprint: fingerprint,
  };
  CLI_CAPABILITY_CACHE.set(cacheKey, { result: cacheValue, expiresAt: Date.now() + 60_000 });
  return cacheValue;
}

export async function registerCliCapabilityRoutes(fastify: FastifyInstance) {
  fastify.get("/api/cli/capabilities", async (req, reply) => {
    const token = extractToken({
      headers: req.headers as Record<string, string | string[] | undefined>,
      url: req.url,
    });
    if (!token || !verifyToken(token)) {
      return reply.code(401).send({ error: "auth required" });
    }

    const rawQuery = req.query as Record<string, unknown> | undefined;
    const command = typeof rawQuery?.command === "string" ? rawQuery.command : undefined;
    if (!command) {
      return reply.code(400).send({ error: "query param 'command' is required" });
    }

    return inspectCliCapability(command);
  });
}
