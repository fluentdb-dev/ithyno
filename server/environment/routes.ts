// SPDX-License-Identifier: GPL-3.0-or-later
import type { FastifyInstance } from "fastify";
import {
  deleteEnvironmentProfile,
  encryptEnvironmentFile,
  getEnvironmentSnapshot,
  mutateEnvironmentFile,
  readEnvironmentSelection,
  revealEnvironmentValue,
  validateProfileName,
  writeEnvironmentSelection,
} from "./index.js";

export type EnvironmentRouteOptions = {
  getProjectRoot: () => string;
  getProcessEnv?: () => NodeJS.ProcessEnv;
};

export async function registerEnvironmentRoutes(
  fastify: FastifyInstance,
  options: EnvironmentRouteOptions,
): Promise<void> {
  const getProjectRoot = options.getProjectRoot;
  const getProcessEnv = options.getProcessEnv ?? (() => process.env);

  fastify.get("/api/environment", { logLevel: "silent" }, async () => {
    return getEnvironmentSnapshot(getProjectRoot(), getProcessEnv());
  });

  fastify.get("/api/environment/diagnostics", { logLevel: "silent" }, async () => {
    const snapshot = await getEnvironmentSnapshot(getProjectRoot(), getProcessEnv());
    return {
      diagnostics: snapshot.diagnostics,
      encryption: snapshot.encryption,
      selection: snapshot.selection,
    };
  });

  fastify.post<{ Body: { selectedProfile?: string | null; preferences?: Record<string, unknown> } }>(
    "/api/environment/selection",
    async (req, reply) => {
    const body = req.body ?? {};
    const current = await readEnvironmentSelection(getProjectRoot());
    const nextProfile = body.selectedProfile === null || body.selectedProfile === ""
      ? null
      : body.selectedProfile === undefined
        ? current.selectedProfile ?? null
        : validateProfileName(body.selectedProfile);
    if (body.selectedProfile !== null && body.selectedProfile !== undefined && body.selectedProfile !== "" && !nextProfile) {
      reply.code(400);
      return { error: "invalid profile" };
    }
    const next = {
      selectedProfile: body.selectedProfile === undefined ? current.selectedProfile ?? null : nextProfile,
      preferences: { ...current.preferences, ...(body.preferences ?? {}) },
    };
    await writeEnvironmentSelection(getProjectRoot(), next);
    return {
      selection: next,
      snapshot: await getEnvironmentSnapshot(getProjectRoot(), getProcessEnv()),
    };
  });

  fastify.post<{ Body: { key?: string } }>(
    "/api/environment/reveal",
    { logLevel: "silent" },
    async (req, reply) => {
      const body = req.body ?? {};
      const key = body.key?.trim();
      if (!key) {
        reply.code(400);
        return { error: "missing key" };
      }
      try {
        const value = await revealEnvironmentValue(getProjectRoot(), key, getProcessEnv());
        return { key, value };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  fastify.post<{
    Body: {
      profile?: string;
      values?: Record<string, string>;
      remove?: string[];
      revision?: string;
    };
  }>(
    "/api/environment/mutate",
    { logLevel: "silent" },
    async (req, reply) => {
      const body = req.body ?? {};
      const profile = body.profile ?? "default";
      if (!profile) {
        reply.code(400);
        return { error: "missing profile" };
      }
      try {
        return await mutateEnvironmentFile(getProjectRoot(), {
          profile,
          values: body.values,
          remove: body.remove,
          revision: body.revision,
        });
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  fastify.post<{ Body: { profile?: string } }>("/api/environment/encrypt", { logLevel: "silent" }, async (req, reply) => {
    const body = req.body ?? {};
    const profile = body.profile ?? "default";
    if (!profile) {
      reply.code(400);
      return { error: "missing profile" };
    }
    try {
      return await encryptEnvironmentFile(getProjectRoot(), profile, getProcessEnv());
    } catch (err) {
      reply.code(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  const deleteProfileRouteHandler = async (req: { body?: { profile?: string; path?: string } }, reply: any) => {
    const body = req.body ?? {};
    const profile = body.profile ?? "default";
    if (!profile) {
      reply.code(400);
      return { error: "missing profile" };
    }
    try {
      return await deleteEnvironmentProfile(getProjectRoot(), profile, {
        expectedPath: body.path,
      });
    } catch (err) {
      reply.code(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };

  fastify.post<{ Body: { profile?: string; path?: string } }>('/api/environment/profile-delete', { logLevel: 'silent' }, deleteProfileRouteHandler as any);
  fastify.post<{ Body: { profile?: string; path?: string } }>('/api/environment/delete-profile', { logLevel: 'silent' }, deleteProfileRouteHandler as any);
  fastify.delete<{ Body: { profile?: string; path?: string } }>('/api/environment/profile', { logLevel: 'silent' }, deleteProfileRouteHandler as any);
}
