import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which sets root: "web" for the UI build).
export default defineConfig({
  root: ".",
  test: {
    include: ["server/**/*.test.ts"],
    environment: "node",
  },
});
