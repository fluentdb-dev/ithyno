// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which sets root: "web" for the UI build).
export default defineConfig({
  root: ".",
  test: {
    include: ["server/**/*.test.ts", "web/src/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
    // Several suites exercise real chokidar/fs.watch instances. Capping
    // concurrency prevents macOS FSEvents descriptor exhaustion (EMFILE)
    // without serializing the otherwise independent suite.
    maxWorkers: 4,
  },
});
