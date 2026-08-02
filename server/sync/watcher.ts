// SPDX-License-Identifier: GPL-3.0-or-later
import chokidar, { type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { existsSync } from "node:fs";
import { sha1 } from "../util/hash.js";

/**
 * Watches the openspec/ tree for external (AI / human-editor) edits and reports
 * them, while suppressing the server's own writes (echo suppression, §6.3).
 *
 * After the server writes a file it calls recordWrite(path, hash). When chokidar
 * later reports that path, we compare the on-disk hash to the recorded one; a
 * match means it was our own write and we ignore it.
 */
export class Watcher {
  private watcher: FSWatcher | null = null;
  private writtenHashes = new Map<string, string>();

  constructor(
    private readonly openspecDir: string,
    private readonly onExternalChange: (filePath: string, event: "change" | "add" | "unlink") => void,
  ) {}

  recordWrite(filePath: string, hash: string): void {
    this.writtenHashes.set(filePath, hash);
  }

  start(): void {
    this.watcher = chokidar.watch(this.openspecDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    const handle = async (event: "change" | "add" | "unlink", filePath: string) => {
      // .md is the historical scope; `.openspec.yaml` per-change sidecars
      // carry mutable machine state (phase, priorPhase, escalatedAt) that
      // must propagate to clients on external edit — landed by
      // add-phase-state-machine.
      const isTracked = filePath.endsWith(".md") || filePath.endsWith(".openspec.yaml");
      if (!isTracked) return;

      if (event === "unlink") {
        this.writtenHashes.delete(filePath);
        this.onExternalChange(filePath, event);
        return;
      }

      let content: string;
      try {
        content = await readFile(filePath, "utf8");
      } catch {
        return;
      }
      const hash = sha1(content);
      if (this.writtenHashes.get(filePath) === hash) {
        // Our own write echoing back — ignore once.
        this.writtenHashes.delete(filePath);
        return;
      }
      this.onExternalChange(filePath, event);
    };

    this.watcher
      .on("change", (p) => void handle("change", p))
      .on("add", (p) => void handle("add", p))
      .on("unlink", (p) => void handle("unlink", p));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
  }
}

/**
 * ProjectRootWatcher — watches the project root directory for the creation of
 * an `openspec/` subdirectory. This is the fallback path used when ithyno
 * starts against a project that has no existing `openspec/` directory (the
 * import scenario). Without this watcher, the main watcher startup block
 * (`if (openspecDir) { watcher = new Watcher(...) }`) never executes, so no
 * `state-replaced` broadcast fires when the import sub-agent writes
 * `openspec/GENERATED.md` — the dashboard would hang indefinitely.
 *
 * When `openspec/` is detected for the first time:
 *   1. `onOpenspecCreated()` is called so the server can start the real
 *      Watcher and rebuild any derived state (e.g. broadcast `state-replaced`).
 *   2. This watcher stops itself — the caller's Watcher now owns that tree.
 *
 * Also handles the `openspec init` path from a shell: if the user runs
 * `openspec init` in a terminal while ithyno is running with no existing
 * openspec/ dir, the dashboard will still react correctly.
 */
export class ProjectRootWatcher {
  private watcher: FSWatcher | null = null;
  private stopped = false;

  constructor(
    private readonly projectRoot: string,
    private readonly onOpenspecCreated: () => void,
  ) {}

  start(): void {
    const openspecDir = join(this.projectRoot, "openspec");
    // Watch the project root at depth 0 only — we care only about the
    // `openspec/` directory appearing directly inside the root, not
    // recursive changes inside it (the real Watcher handles those once
    // handed control).
    this.watcher = chokidar.watch(this.projectRoot, {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: false,
    });

    const handleAdd = (filePath: string) => {
      if (this.stopped) return;
      // Normalize: chokidar emits the path of the added entry. On `mkdir
      // openspec`, chokidar fires `addDir` with the path of the new dir.
      // We accept either the exact openspec/ path or any path that begins
      // with it (e.g. a file created directly inside it on fast writes).
      const isOpenspec =
        filePath === openspecDir ||
        filePath.startsWith(openspecDir + sep) ||
        filePath.startsWith(openspecDir + "/");
      if (!isOpenspec) return;
      this.stopped = true;
      void this.watcher?.close();
      this.onOpenspecCreated();
    };

    this.watcher
      .on("addDir", handleAdd)
      .on("add", handleAdd);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.watcher?.close();
  }
}

/**
 * ImportTargetWatcher — watches an external project root (Pattern A import)
 * for the creation of `openspec/GENERATED.md`.
 *
 * When the marker is detected, `onComplete({ targetPath, jobId })` is called
 * exactly once. The watcher automatically deregisters itself 30 seconds after
 * completion (or immediately on `stop()`).
 *
 * Idempotency: registering the same (targetPath, jobId) pair twice is a no-op
 * (caller should deduplicate before calling `start()`). Duplicate marker-file
 * events fire the callback only once per jobId (guarded by `fired`).
 *
 * Landed by enable-import-both-patterns.
 */
export class ImportTargetWatcher {
  private watcher: FSWatcher | null = null;
  private fired = false;
  private stopped = false;
  private gracePeriodTimer: NodeJS.Timeout | null = null;

  /** Grace period after completion before the watcher fully stops (ms). */
  static readonly GRACE_MS = 30_000;

  constructor(
    readonly targetPath: string,
    readonly jobId: string,
    private readonly onComplete: (ev: { targetPath: string; jobId: string }) => void,
  ) {}

  start(): void {
    const markerPath = join(this.targetPath, "openspec", "GENERATED.md");

    // If the marker already exists at start time, fire immediately.
    if (!this.fired && existsSync(markerPath)) {
      this._complete();
      return;
    }

    // Watch the target root for file additions.
    this.watcher = chokidar.watch(this.targetPath, {
      ignoreInitial: true,
      // Watch up to depth 2: targetRoot/openspec/GENERATED.md
      depth: 2,
      awaitWriteFinish: false,
    });

    const handleAdd = (filePath: string) => {
      if (this.stopped || this.fired) return;
      if (filePath === markerPath) {
        this._complete();
      }
    };

    this.watcher.on("add", handleAdd);
  }

  private _complete(): void {
    this.fired = true;
    this.onComplete({ targetPath: this.targetPath, jobId: this.jobId });

    // Schedule self-deregistration after grace period.
    this.gracePeriodTimer = setTimeout(() => {
      void this._shutdown();
    }, ImportTargetWatcher.GRACE_MS);
  }

  private async _shutdown(): Promise<void> {
    this.stopped = true;
    if (this.gracePeriodTimer) {
      clearTimeout(this.gracePeriodTimer);
      this.gracePeriodTimer = null;
    }
    await this.watcher?.close();
    this.watcher = null;
  }

  async stop(): Promise<void> {
    await this._shutdown();
  }
}
