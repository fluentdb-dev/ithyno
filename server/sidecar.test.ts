// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSidecar, writeSidecar, extractSidecarFields } from "./sidecar.js";

/**
 * Round-trip tests for the per-change `.openspec.yaml` sidecar. Backs up
 * the invariants relied on by add-phase-state-machine and
 * add-needs-human-phase: unrelated keys survive a write, undefined
 * deletes, and invalid / reserved / needs-human-only fields are
 * normalized on read.
 */

const CHANGE_ID = "test-change";

let projectRoot: string;
let sidecarPath: string;

async function seedSidecar(contents: string): Promise<void> {
  await writeFile(sidecarPath, contents, "utf8");
}

describe("server/sidecar", () => {
  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "opsx-sidecar-"));
    const changeDir = join(projectRoot, "openspec", "changes", CHANGE_ID);
    await mkdir(changeDir, { recursive: true });
    sidecarPath = join(changeDir, ".openspec.yaml");
  });
  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  describe("readSidecar", () => {
    it("returns an empty object when the file is absent", async () => {
      const raw = await readSidecar(projectRoot, CHANGE_ID);
      expect(raw).toEqual({});
    });

    it("returns an empty object when the file is malformed", async () => {
      await seedSidecar(":\n:not-yaml:\n\t\t");
      const raw = await readSidecar(projectRoot, CHANGE_ID);
      // Malformed input logs a warn but must not crash — {} is the safe
      // fallback that lets discovery keep going.
      expect(raw).toEqual({});
    });

    it("parses well-formed YAML into a record", async () => {
      await seedSidecar("schema: spec-driven\ncreated: 2026-07-05\nphase: coded\n");
      const raw = await readSidecar(projectRoot, CHANGE_ID);
      expect(raw).toMatchObject({
        schema: "spec-driven",
        created: "2026-07-05",
        phase: "coded",
      });
    });
  });

  describe("writeSidecar", () => {
    it("creates the file when it does not exist", async () => {
      await writeSidecar(projectRoot, CHANGE_ID, { phase: "proposed" });
      const raw = await readFile(sidecarPath, "utf8");
      expect(raw).toContain("phase: proposed");
    });

    it("preserves unrelated existing keys across a phase write", async () => {
      // The openspec CLI writes `schema:` and `created:` at scaffold time.
      // Those must survive any phase write — the sidecar module is a
      // co-tenant, not the sole owner.
      await seedSidecar("schema: spec-driven\ncreated: 2026-07-04\n");
      await writeSidecar(projectRoot, CHANGE_ID, { phase: "reviewed" });
      const after = await readSidecar(projectRoot, CHANGE_ID);
      expect(after).toMatchObject({
        schema: "spec-driven",
        created: "2026-07-04",
        phase: "reviewed",
      });
    });

    it("merges a subsequent write into existing fields", async () => {
      await writeSidecar(projectRoot, CHANGE_ID, { phase: "coded" });
      await writeSidecar(projectRoot, CHANGE_ID, { escalatedAt: "2026-07-05T10:00:00Z" });
      const after = await readSidecar(projectRoot, CHANGE_ID);
      expect(after).toMatchObject({
        phase: "coded",
        escalatedAt: "2026-07-05T10:00:00Z",
      });
    });

    it("DELETES a key when its patch value is undefined", async () => {
      // add-needs-human-phase's answer path relies on this behavior to
      // clear `priorPhase` and `escalatedAt` in a single writeSidecar
      // call. If this ever regresses, escalation state leaks.
      await writeSidecar(projectRoot, CHANGE_ID, {
        phase: "needs-human",
        priorPhase: "coded",
        escalatedAt: "2026-07-05T10:00:00Z",
      });
      await writeSidecar(projectRoot, CHANGE_ID, {
        phase: "coded",
        priorPhase: undefined,
        escalatedAt: undefined,
      });
      const after = await readSidecar(projectRoot, CHANGE_ID);
      expect(after.phase).toBe("coded");
      expect(after).not.toHaveProperty("priorPhase");
      expect(after).not.toHaveProperty("escalatedAt");
    });
  });

  describe("extractSidecarFields", () => {
    it("extracts a known phase", () => {
      const out = extractSidecarFields({ phase: "reviewed" }, CHANGE_ID);
      expect(out.phase).toBe("reviewed");
    });

    it("extracts `needs-human` as a valid persisted phase", () => {
      const out = extractSidecarFields({ phase: "needs-human" }, CHANGE_ID);
      expect(out.phase).toBe("needs-human");
    });

    it("treats an unknown phase string as absent", () => {
      const out = extractSidecarFields({ phase: "elsewhere" }, CHANGE_ID);
      expect(out.phase).toBeUndefined();
    });

    it("treats a reserved phase (Phase 4) as absent on read", () => {
      // The write path rejects reserved values at the API layer. The read
      // path treats a manually-set reserved value as absent so a hand-edit
      // like `phase: validated` doesn't crash discovery.
      const out = extractSidecarFields({ phase: "validated" }, CHANGE_ID);
      expect(out.phase).toBeUndefined();
    });

    it("ignores priorPhase / escalatedAt when phase !== needs-human", () => {
      const out = extractSidecarFields(
        { phase: "coded", priorPhase: "proposed", escalatedAt: "2026-07-05T10:00:00Z" },
        CHANGE_ID,
      );
      expect(out.phase).toBe("coded");
      expect(out.priorPhase).toBeUndefined();
      expect(out.escalatedAt).toBeUndefined();
    });

    it("keeps priorPhase / escalatedAt when phase === needs-human", () => {
      const out = extractSidecarFields(
        {
          phase: "needs-human",
          priorPhase: "coded",
          escalatedAt: "2026-07-05T10:00:00Z",
        },
        CHANGE_ID,
      );
      expect(out.phase).toBe("needs-human");
      expect(out.priorPhase).toBe("coded");
      expect(out.escalatedAt).toBe("2026-07-05T10:00:00Z");
    });

    it("ignores a bogus priorPhase under needs-human", () => {
      const out = extractSidecarFields(
        { phase: "needs-human", priorPhase: "nowhere", escalatedAt: "2026-07-05T10:00:00Z" },
        CHANGE_ID,
      );
      expect(out.phase).toBe("needs-human");
      expect(out.priorPhase).toBeUndefined();
      // escalatedAt is still valid (it's a string, presence-only check).
      expect(out.escalatedAt).toBe("2026-07-05T10:00:00Z");
    });

    it("ignores an empty-string escalatedAt", () => {
      const out = extractSidecarFields(
        { phase: "needs-human", priorPhase: "coded", escalatedAt: "" },
        CHANGE_ID,
      );
      expect(out.escalatedAt).toBeUndefined();
    });

    it("refuses `needs-human` as its own priorPhase", () => {
      // A change can't have escalated from needs-human — that's a
      // nonsensical loop. Guard against a malformed sidecar creating
      // an infinite restore cycle.
      const out = extractSidecarFields(
        { phase: "needs-human", priorPhase: "needs-human", escalatedAt: "2026-07-05T10:00:00Z" },
        CHANGE_ID,
      );
      expect(out.priorPhase).toBeUndefined();
    });
  });

  describe("round-trip through disk", () => {
    it("write → read produces the same normalized shape", async () => {
      await seedSidecar("schema: spec-driven\ncreated: 2026-07-04\n");
      await writeSidecar(projectRoot, CHANGE_ID, {
        phase: "needs-human",
        priorPhase: "coded",
        escalatedAt: "2026-07-05T10:00:00Z",
      });
      const raw = await readSidecar(projectRoot, CHANGE_ID);
      const fields = extractSidecarFields(raw, CHANGE_ID);
      expect(fields).toEqual({
        phase: "needs-human",
        priorPhase: "coded",
        escalatedAt: "2026-07-05T10:00:00Z",
      });
      // Sanity: the schema / created keys are ALSO preserved by the write.
      expect(raw).toMatchObject({ schema: "spec-driven", created: "2026-07-04" });
    });
  });
});
