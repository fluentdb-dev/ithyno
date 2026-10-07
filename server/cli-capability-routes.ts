// SPDX-License-Identifier: GPL-3.0-or-later
import type { FastifyInstance } from "fastify";
import bundledCliCatalog from "./agent-cli-capabilities.json";
import { resolveCliAdapter } from "./agents/cli-command-builder.js";
import { extractToken, verifyToken } from "./util/auth.js";

type CliCatalogEntry = {
  id: string;
  aliases: readonly string[];
  displayName: string;
  currentVersion?: string;
  sourceVersion?: string;
  fields: Array<{
    key: string;
    label: string;
    flag: string;
    kind: "text" | "select" | "boolean";
    category?: string;
    choices?: readonly string[];
    dangerous?: boolean;
    guidance?: string;
  }>;
  modelDiscovery: "native" | "manual" | "none";
  modelGuidance: string;
  availableModels: readonly string[];
  modelMetadata: Array<Record<string, unknown>>;
  danger: readonly string[];
};

type CliCatalog = {
  schemaVersion: number;
  adapters: Record<string, CliCatalogEntry>;
};

const cliCatalog = bundledCliCatalog as CliCatalog;

export function readBundledCliCapability(command: string) {
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

  const catalogEntry = cliCatalog.adapters[adapter.id];
  if (!catalogEntry) {
    return {
      ok: false,
      supported: false,
      reason: "catalog-missing",
      command,
      adapter: adapter.id,
      fields: adapter.fields,
      modelDiscovery: adapter.modelDiscovery,
      modelGuidance: adapter.modelGuidance,
      availableModels: [],
      modelMetadata: [],
      danger: adapter.dangerousFlags ?? [],
    };
  }

  return {
    ok: true,
    supported: true,
    command,
    adapter: adapter.id,
    fields: catalogEntry.fields,
    modelDiscovery: catalogEntry.modelDiscovery,
    modelGuidance: catalogEntry.modelGuidance,
    availableModels: [...catalogEntry.availableModels],
    modelMetadata: catalogEntry.modelMetadata,
    currentVersion: catalogEntry.currentVersion ?? catalogEntry.sourceVersion,
    sourceVersion: catalogEntry.sourceVersion ?? catalogEntry.currentVersion,
    danger: [...catalogEntry.danger],
    reason: undefined,
  };
}

export async function inspectCliCapability(command: string) {
  return readBundledCliCapability(command);
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
