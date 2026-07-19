// SPDX-License-Identifier: GPL-3.0-or-later
import chokidar, { type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
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
