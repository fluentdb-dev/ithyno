// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Change-scoped session store — file-backed `Map<changeId, sessionId>`
 * persisted at `.ithyno/sessions.json` under the project root.
 *
 * Landed by add-session-id-template-var. Session IDs are used by the
 * `${session_id}` template variable in agents.yaml so Worker CLIs
 * (Claude Code, gh copilot, …) can group related requests into a
 * shared conversation via their `--session` flags.
 *
 * Persistence survives server restart so a long-running Claude Code
 * conversation isn't broken by `npm run dev` restarts. Corrupt file →
 * warn + empty-map fallback + overwrite on next mint (transparent
 * recovery).
 *
 * `.ithyno/` is local state — .gitignore excludes it.
 */

/** Directory (relative to project root) where the sessions map lives. */
const STATE_DIR = ".ithyno";
/** File name inside `.ithyno/`. */
const STATE_FILE = "sessions.json";

function storePath(projectRoot: string): string {
  return join(projectRoot, STATE_DIR, STATE_FILE);
}

/** Read the full map. Missing file / corrupt content → empty map. */
async function readMap(projectRoot: string): Promise<Record<string, string>> {
  const path = storePath(projectRoot);
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(
        `[session-store] ${path} is not an object; treating as empty and will overwrite on next mint`,
      );
      return {};
    }
    // Filter to string-valued entries; log & drop anything malformed.
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string" && k && v) {
        out[k] = v;
      } else {
        console.warn(
          `[session-store] dropping malformed entry ${JSON.stringify(k)} → ${JSON.stringify(v)}`,
        );
      }
    }
    return out;
  } catch (err) {
    console.warn(
      `[session-store] ${path} unreadable/unparseable — treating as empty (${err instanceof Error ? err.message : String(err)})`,
    );
    return {};
  }
}

/** Atomic write via `.tmp` + rename. Creates parent dir when missing. */
async function writeMap(projectRoot: string, map: Record<string, string>): Promise<void> {
  const path = storePath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(map, null, 2) + "\n", "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Base36 encoding of a millisecond timestamp — short and readable. */
function base36Ts(): string {
  return Date.now().toString(36);
}

/**
 * Read-only lookup. Returns the existing sessionId for `changeId` if
 * one is stored, else `null`. Does not touch the filesystem when the
 * file is absent.
 */
export async function getSessionId(
  projectRoot: string,
  changeId: string,
): Promise<string | null> {
  const path = storePath(projectRoot);
  if (!existsSync(path)) return null;
  const map = await readMap(projectRoot);
  return map[changeId] ?? null;
}

/**
 * Look up the sessionId for `changeId`. If none is stored, mint a
 * fresh `session-<changeId>-<base36-ts>` and persist it atomically
 * before returning.
 *
 * Mint format uses the current wall-clock timestamp encoded in base36
 * so the resulting ID is stable (once written it's read back verbatim
 * on subsequent calls) but human-readable enough to sort by creation
 * time in logs.
 *
 * Callers should treat the returned value as opaque.
 */
export async function getOrCreateSessionId(
  projectRoot: string,
  changeId: string,
): Promise<string> {
  const existing = await getSessionId(projectRoot, changeId);
  if (existing) return existing;
  const map = await readMap(projectRoot);
  const minted = `session-${changeId}-${base36Ts()}`;
  map[changeId] = minted;
  await writeMap(projectRoot, map);
  return minted;
}
