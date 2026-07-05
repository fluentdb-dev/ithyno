// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { isPersistedPhase, type PersistedPhase } from "./phases.js";

/**
 * Read / write for per-change `openspec/changes/<id>/.openspec.yaml`.
 *
 * The sidecar is a machine-owned mutable state file (openspec CLI writes
 * `schema:` and `created:` when scaffolding a change). This module extends
 * it with a `phase:` key (add-phase-state-machine) and, in follow-up
 * changes, `priorPhase:` + `escalatedAt:` (add-needs-human-phase).
 *
 * Writes preserve unrelated existing keys byte-intent via parse → merge →
 * serialize. Not atomic (no tmp-rename) — Phase 2 is single-user local so
 * concurrent writes are not a concern; a proper atomic-write path is a
 * candidate follow-up.
 */

export type SidecarFields = {
  phase?: PersistedPhase;
  /** Set only while `phase === "needs-human"`. Populated by
   *  add-needs-human-phase; typed here so both changes share the module. */
  priorPhase?: PersistedPhase;
  /** ISO 8601 timestamp; set only while `phase === "needs-human"`. */
  escalatedAt?: string;
};

function sidecarPath(projectRoot: string, changeId: string): string {
  return join(projectRoot, "openspec", "changes", changeId, ".openspec.yaml");
}

export async function readSidecar(
  projectRoot: string,
  changeId: string,
): Promise<Record<string, unknown>> {
  const path = sidecarPath(projectRoot, changeId);
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf8");
    const parsed = parseYaml(raw);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return {};
  } catch (err) {
    console.warn(
      `[sidecar] failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {};
  }
}

/**
 * Extract the phase-related fields from a raw sidecar record. Invalid or
 * reserved `phase:` values are treated as absent (with a warning). A
 * `priorPhase:` or `escalatedAt:` present without a matching `phase:
 * needs-human` is treated as absent too — the invariant is enforced at
 * load per the spec.
 */
export function extractSidecarFields(
  raw: Record<string, unknown>,
  changeId: string,
): SidecarFields {
  const out: SidecarFields = {};
  const phase = raw.phase;
  if (phase !== undefined) {
    if (isPersistedPhase(phase)) {
      out.phase = phase;
    } else {
      console.warn(
        `[sidecar] ${changeId}: ignoring unrecognized phase value ${JSON.stringify(phase)}`,
      );
    }
  }
  const priorPhase = raw.priorPhase;
  const escalatedAt = raw.escalatedAt;
  if (out.phase === "needs-human") {
    if (priorPhase !== undefined) {
      if (isPersistedPhase(priorPhase) && priorPhase !== "needs-human") {
        out.priorPhase = priorPhase;
      } else {
        console.warn(
          `[sidecar] ${changeId}: ignoring unrecognized priorPhase value ${JSON.stringify(priorPhase)}`,
        );
      }
    }
    if (typeof escalatedAt === "string" && escalatedAt) {
      out.escalatedAt = escalatedAt;
    }
  } else if (priorPhase !== undefined || escalatedAt !== undefined) {
    console.warn(
      `[sidecar] ${changeId}: priorPhase / escalatedAt present without phase: needs-human — ignoring`,
    );
  }
  return out;
}

/**
 * Merge `patch` into the existing sidecar and write it back. Keys not
 * mentioned in `patch` are preserved verbatim. Keys explicitly set to
 * `undefined` in `patch` are DELETED (this is how the answer path clears
 * `priorPhase` / `escalatedAt`).
 */
export async function writeSidecar(
  projectRoot: string,
  changeId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const existing = await readSidecar(projectRoot, changeId);
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const yaml = stringifyYaml(merged);
  await writeFile(sidecarPath(projectRoot, changeId), yaml, "utf8");
}
