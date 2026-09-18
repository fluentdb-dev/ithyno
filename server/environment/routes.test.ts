// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEnvironmentSelection, writeEnvironmentSelection } from "./index.js";
import { registerEnvironmentRoutes } from "./routes.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-env-routes-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(registerEnvironmentRoutes, {
    getProjectRoot: () => dir,
    getProcessEnv: () => process.env,
  });
  await app.ready();
  return app;
}

describe("environment routes", () => {
  it("masks values in environment payloads and clears explicit null selection", async () => {
    writeFileSync(join(dir, ".env"), "SECRET=super-secret\nAPI_URL=https://example.test\n", "utf8");
    await writeEnvironmentSelection(dir, { selectedProfile: "default", preferences: {} });

    const app = await buildApp();
    try {
      const environmentResponse = await app.inject({ method: "GET", url: "/api/environment" });
      expect(environmentResponse.statusCode).toBe(200);
      const environmentPayload = environmentResponse.json();
      expect(environmentPayload.variables.find((item: { key: string }) => item.key === "SECRET")?.maskedValue).toBe("********");
      expect(JSON.stringify(environmentPayload)).not.toContain("super-secret");

      const diagnosticsResponse = await app.inject({ method: "GET", url: "/api/environment/diagnostics" });
      expect(diagnosticsResponse.statusCode).toBe(200);
      expect(JSON.stringify(diagnosticsResponse.json())).not.toContain("super-secret");

      const selectionResponse = await app.inject({ method: "POST", url: "/api/environment/selection", payload: { selectedProfile: null } });
      expect(selectionResponse.statusCode).toBe(200);
      const selectionPayload = selectionResponse.json();
      expect(selectionPayload.selection.selectedProfile).toBeNull();
      const persisted = await readEnvironmentSelection(dir);
      expect(persisted.selectedProfile).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("does not leak plaintext values in reveal errors", async () => {
    writeFileSync(join(dir, ".env"), "******", "utf8");
    const app = await buildApp();
    try {
      const response = await app.inject({ method: "POST", url: "/api/environment/reveal", payload: { key: "MISSING" } });
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(response.json())).not.toContain("super-secret");
    } finally {
      await app.close();
    }
  });

  it("encrypts a selected profile with exact confirmation flow and refreshes state", async () => {
    writeFileSync(join(dir, ".env"), "APP=local\n", "utf8");
    await writeEnvironmentSelection(dir, { selectedProfile: "default", preferences: {} });
    const app = await buildApp();
    try {
      const response = await app.inject({ method: "POST", url: "/api/environment/encrypt", payload: { profile: "default" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("ready");
      expect(response.json().path).toBe(".env");
      expect(require("node:fs").existsSync(join(dir, ".env.keys"))).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("deletes a discovered profile only when the exact path matches, and rejects unsafe or missing paths", async () => {
    writeFileSync(join(dir, ".env.dev"), "APP=dev\n", "utf8");
    const app = await buildApp();
    try {
      const ok = await app.inject({ method: "POST", url: "/api/environment/profile", payload: { profile: "dev", path: ".env.dev" } });
      expect(ok.statusCode).toBe(200);
      expect(require("node:fs").existsSync(join(dir, ".env.dev"))).toBe(false);

      const unsafe = await app.inject({ method: "POST", url: "/api/environment/profile", payload: { profile: "dev", path: ".env.keys" } });
      expect(unsafe.statusCode).toBe(400);
      expect(unsafe.json().error).toMatch(/exact profile path|Unsafe|profile/i);

      const missing = await app.inject({ method: "POST", url: "/api/environment/profile", payload: { profile: "missing", path: ".env.missing" } });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error).toMatch(/missing|not found|Invalid/i);
    } finally {
      await app.close();
    }
  });

  it("rejects unsupported native actions and unsupported host capability", async () => {
    writeFileSync(join(dir, ".env"), "APP=local\n", "utf8");
    const app = await buildApp();
    const nativeSupport = vi.spyOn(await import("./index.js"), "getDotenvxNativeSupport").mockReturnValue({
      supported: false,
      platform: process.platform,
      reason: "native key storage is unavailable on this host",
    });
    try {
      const invalid = await app.inject({ method: "POST", url: "/api/environment/native", payload: { profile: "default", action: "bad" } });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error).toMatch(/invalid native action/i);

      const unsupported = await app.inject({ method: "POST", url: "/api/environment/native", payload: { profile: "default", action: "up" } });
      expect(unsupported.statusCode).toBe(400);
      expect(unsupported.json().error).toMatch(/native key storage is unavailable|unsupported/i);
    } finally {
      nativeSupport.mockRestore();
      await app.close();
    }
  });
});
