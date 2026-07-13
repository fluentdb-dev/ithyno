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
    expect(id).toMatch(/^session-add-foo-[0-9a-z]+$/);
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
    expect(bar).toMatch(/^session-add-bar-[0-9a-z]+$/);
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
    expect(id).toMatch(/^session-add-foo-[0-9a-z]+$/);
    const parsed = JSON.parse(readFileSync(STORE_PATH(dir), "utf8"));
    expect(parsed).toEqual({ "add-foo": id });
  });

  it("treats an array as empty and overwrites", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".ithyno"));
    writeFileSync(STORE_PATH(dir), "[1,2,3]", "utf8");
    const id = await getOrCreateSessionId(dir, "add-foo");
    expect(id).toMatch(/^session-add-foo-[0-9a-z]+$/);
  });

  it("drops malformed entries (non-string value) but keeps valid ones", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(dir, ".ithyno"));
    writeFileSync(
      STORE_PATH(dir),
      JSON.stringify({ "add-foo": "session-add-foo-abc", "bad": 42 }),
      "utf8",
    );
    const foo = await getSessionId(dir, "add-foo");
    expect(foo).toBe("session-add-foo-abc");
    // 'bad' should be dropped — its lookup returns null.
    const bad = await getSessionId(dir, "bad");
    expect(bad).toBeNull();
  });
});

describe("atomic write", () => {
  it("does not leave a .tmp sibling after a successful mint", async () => {
    await getOrCreateSessionId(dir, "add-foo");
    const tmp = `${STORE_PATH(dir)}.tmp`;
    expect(existsSync(tmp)).toBe(false);
  });
});
