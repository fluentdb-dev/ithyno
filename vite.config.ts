// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the web UI and proxies /api + /ws to the Fastify server.
// Build: emits to web/dist, which the server serves in production.
export default defineConfig({
  plugins: [react()],
  root: "web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Vite's production esbuild pass otherwise re-mangles xterm's already
    // minified ESM and leaves requestMode with a dangling identifier.
    minify: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4321",
      "/ws": {
        target: "ws://localhost:4321",
        ws: true,
      },
      "/pty": {
        target: "ws://localhost:4321",
        ws: true,
      },
    },
  },
});
