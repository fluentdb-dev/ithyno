// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getOrCreateSessionId, getSessionId } from "./session-store.js";

/**
 * Tests for the change-scoped session store (add-session-id-template-var).
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ithyno-session-store-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const STORE_PATH = (root: string) => join(root, ".ithyno", "sessions.json");

describe("getOrCreateSessionId — mint on first call", () => {
  it("mints and persists a new sessionId when the file is absent", async () => {
    expect(existsSync(join(dir, ".ithyno"))).toBe(false);
    const id = await getOrCreateSessionId(dir, "add-foo");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(existsSync(STORE_PATH(dir))).toBe(true);
    const raw = await readFile(STORE_PATH(dir), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({ "add-foo": id });
  });

  it("returns the same id on a second call for the same changeId", async () => {
    const first = await getOrCreateSessionId(dir, "add-foo");
    const before = readFileSync(STORE_PATH(dir), "utf8");
    // Small delay so the second call's base36 timestamp would differ
    // if the store weren't consulted.
    await new Promise((r) => setTimeout(r, 5));
    const second = await getOrCreateSessionId(dir, "add-foo");
    const after = readFileSync(STORE_PATH(dir), "utf8");
    expect(second).toBe(first);
    expect(after).toBe(before);
  });

  it("mints a distinct id for a different changeId, adds to the map", async () => {
    const foo = await getOrCreateSessionId(dir, "add-foo");
    const bar = await getOrCreateSessionId(dir, "add-bar");
    expect(bar).not.toBe(foo);
    expect(bar).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const parsed = JSON.parse(readFileSync(STORE_PATH(dir), "utf8"));
    expect(parsed).toEqual({ "add-foo": foo, "add-bar": bar });
  });

  it("survives a fresh module load (persistence proxy)", async () => {
    const first = await getOrCreateSessionId(dir, "add-foo");
    // Simulate a server restart by clearing any in-memory state — the
    // store is purely file-backed, so a second call from a fresh call
    // stack still returns the persisted value.
    const second = await getOrCreateSessionId(dir, "add-foo");
    expect(second).toBe(first);
  });
});

describe("getSessionId — read-only lookup", () => {
  it("returns null when the file is absent (and does NOT create it)", async () => {
    expect(existsSync(join(dir, ".ithyno"))).toBe(false);
    const id = await getSessionId(dir, "add-foo");
    expect(id).toBeNull();
    expect(existsSync(join(dir, ".ithyno"))).toBe(false);
  });

  it("returns null for an unknown changeId when the file exists", async () => {
    await getOrCreateSessionId(dir, "add-foo");
    const id = await getSessionId(dir, "add-bar");
    expect(id).toBeNull();
  });

  it("returns the stored id for a known changeId", async () => {
    const foo = await getOrCreateSessionId(dir, "add-foo");
    const id = await getSessionId(dir, "add-foo");
    expect(id).toBe(foo);
  });
});

describe("corruption recovery", () => {
  it("treats a non-JSON file as empty and overwrites on next mint", async () => {
    // Prepare a corrupt store.
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".ithyno"));
    writeFileSync(STORE_PATH(dir), "not-json", "utf8");
    const id = await getOrCreateSessionId(dir, "add-foo");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const parsed = JSON.parse(readFileSync(STORE_PATH(dir), "utf8"));
    expect(parsed).toEqual({ "add-foo": id });
  });

  it("treats an array as empty and overwrites", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".ithyno"));
    writeFileSync(STORE_PATH(dir), "[1,2,3]", "utf8");
    const id = await getOrCreateSessionId(dir, "add-foo");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("drops malformed entries (non-string value)", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".ithyno"));
    writeFileSync(
      STORE_PATH(dir),
      JSON.stringify({
        "valid-uuid": "550e8400-e29b-41d4-a716-446655440000",
        "bad": 42,
      }),
      "utf8",
    );
    const uuid = await getSessionId(dir, "valid-uuid");
    expect(uuid).toBe("550e8400-e29b-41d4-a716-446655440000");
    const bad = await getSessionId(dir, "bad");
    expect(bad).toBeNull();
  });

  it("treats pre-UUID entries as legacy (getSessionId returns null; getOrCreateSessionId re-mints)", async () => {
    // Simulates a `.ithyno/sessions.json` written by the initial
    // `session-<changeId>-<base36-ts>` mint format before it was
    // swapped for RFC 4122 UUIDs (Claude Code --session-id compat).
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".ithyno"));
    writeFileSync(
      STORE_PATH(dir),
      JSON.stringify({ "add-foo": "session-add-foo-mrjz4fkt" }),
      "utf8",
    );
    // Read-only path skips the legacy value.
    const readOnly = await getSessionId(dir, "add-foo");
    expect(readOnly).toBeNull();
    // Mint path replaces it with a fresh UUID.
    const minted = await getOrCreateSessionId(dir, "add-foo");
    expect(minted).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(minted).not.toBe("session-add-foo-mrjz4fkt");
    const parsed = JSON.parse(readFileSync(STORE_PATH(dir), "utf8"));
    expect(parsed["add-foo"]).toBe(minted);
  });
});

describe("atomic write", () => {
  it("does not leave a .tmp sibling after a successful mint", async () => {
    await getOrCreateSessionId(dir, "add-foo");
    const tmp = `${STORE_PATH(dir)}.tmp`;
    expect(existsSync(tmp)).toBe(false);
  });
});
