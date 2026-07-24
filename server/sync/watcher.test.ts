// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Tests for ImportTargetWatcher (enable-import-both-patterns task 9.1).
 *
 * Verifies that:
 *   1. The watcher fires on targetRoot/openspec/GENERATED.md creation.
 *   2. The callback is invoked only once per jobId even on duplicate events.
 *   3. The watcher fires immediately when the marker already exists at start().
 *   4. stop() cancels the watcher without firing the callback.
 *
 * Note: These tests write real files to a tmpdir and rely on chokidar's
 * file-system events. A short delay allows the watcher to settle.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ImportTargetWatcher } from "./watcher.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("ImportTargetWatcher", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "import-target-watcher-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("fires callback when openspec/GENERATED.md is created", async () => {
    const events: Array<{ targetPath: string; jobId: string }> = [];
    const watcher = new ImportTargetWatcher(tmpDir, "job-fire", (ev) => {
      events.push(ev);
    });
    watcher.start();

    // Let chokidar initialize.
    await sleep(300);

    // Create the marker.
    const openspecDir = join(tmpDir, "openspec");
    await mkdir(openspecDir, { recursive: true });
    await writeFile(join(openspecDir, "GENERATED.md"), "# Generated\n");

    // Wait for the watcher to fire.
    await sleep(600);
    await watcher.stop();

    expect(events).toHaveLength(1);
    expect(events[0].targetPath).toBe(tmpDir);
    expect(events[0].jobId).toBe("job-fire");
  }, 10_000);

  it("fires immediately when GENERATED.md already exists at start()", async () => {
    // Pre-create the marker before the watcher starts.
    const openspecDir = join(tmpDir, "openspec");
    await mkdir(openspecDir, { recursive: true });
    await writeFile(join(openspecDir, "GENERATED.md"), "# Generated\n");

    const events: Array<{ targetPath: string; jobId: string }> = [];
    const watcher = new ImportTargetWatcher(tmpDir, "job-preexist", (ev) => {
      events.push(ev);
    });
    watcher.start();

    // Short yield to allow the synchronous check to complete.
    await sleep(50);
    await watcher.stop();

    expect(events).toHaveLength(1);
    expect(events[0].jobId).toBe("job-preexist");
  }, 5_000);

  it("fires callback at most once per jobId (duplicate-event guard)", async () => {
    let count = 0;
    const watcher = new ImportTargetWatcher(tmpDir, "job-dedup", () => {
      count++;
    });
    watcher.start();

    await sleep(300);

    const openspecDir = join(tmpDir, "openspec");
    await mkdir(openspecDir, { recursive: true });
    // Write the marker twice in rapid succession.
    await writeFile(join(openspecDir, "GENERATED.md"), "# First write\n");
    await sleep(50);
    await writeFile(join(openspecDir, "GENERATED.md"), "# Second write\n");

    await sleep(600);
    await watcher.stop();

    expect(count).toBe(1);
  }, 10_000);

  it("does not fire after stop() is called", async () => {
    let fired = false;
    const watcher = new ImportTargetWatcher(tmpDir, "job-stop", () => {
      fired = true;
    });
    watcher.start();
    await sleep(100);
    await watcher.stop();

    // Create the marker after stop.
    const openspecDir = join(tmpDir, "openspec");
    await mkdir(openspecDir, { recursive: true });
    await writeFile(join(openspecDir, "GENERATED.md"), "# After stop\n");
    await sleep(400);

    expect(fired).toBe(false);
  }, 5_000);
});
