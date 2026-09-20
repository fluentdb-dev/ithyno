#!/usr/bin/env node
import { Command } from "commander";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

async function loadBridgeApi() {
  try {
    return await import("../server/bridge.ts");
  } catch {
    return {
      canonicalProjectRoot(projectPath, cwd = process.cwd()) {
        const raw = projectPath && projectPath.trim() ? projectPath : cwd;
        const absolute = resolve(raw);
        try { return realpathSync(absolute, { encoding: "utf8" }); } catch { return absolute; }
      },
      async bridgeStatus(projectPath, cwd = process.cwd()) {
        const projectRoot = this.canonicalProjectRoot(projectPath, cwd);
        return { ok: false, projectRoot, projectHash: createHash("sha256").update(projectRoot).digest("hex"), error: "no live bridge runtime was registered for this project; no fixed-port or localhost fallback is used", code: "unavailable" };
      },
      async registerBridgeRuntime(projectPath, cwd = process.cwd(), overrides = {}) {
        const projectRoot = this.canonicalProjectRoot(projectPath, cwd);
        return { projectRoot, projectHash: createHash("sha256").update(projectRoot).digest("hex"), ipcAddress: overrides.ipcAddress ?? `bridge:${projectRoot}`, pid: process.pid, processStartIdentity: `cli:${process.pid}`, protocolVersion: "1", generation: overrides.generation ?? 1 };
      },
      async unregisterBridgeRuntime(projectPath, cwd = process.cwd()) {
        return undefined;
      },
    };
  }
}

const program = new Command();
program.name("ithyno").description("ithyno bridge CLI");

program
  .command("status")
  .option("-p, --project <path>")
  .action(async (opts) => {
    const api = await loadBridgeApi();
    const projectRoot = api.canonicalProjectRoot(opts.project || process.cwd());
    const res = await api.bridgeStatus(projectRoot);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  });

program
  .command("register")
  .option("-p, --project <path>")
  .action(async (opts) => {
    const api = await loadBridgeApi();
    const projectRoot = api.canonicalProjectRoot(opts.project || process.cwd());
    const descriptor = await api.registerBridgeRuntime(projectRoot, process.cwd(), {
      ipcAddress: `bridge:${projectRoot}`,
      pid: process.pid,
      processStartIdentity: `cli:${process.pid}`,
      generation: 1,
    });
    console.log(JSON.stringify(descriptor, null, 2));
  });

program
  .command("unregister")
  .option("-p, --project <path>")
  .action(async (opts) => {
    const api = await loadBridgeApi();
    const projectRoot = api.canonicalProjectRoot(opts.project || process.cwd());
    await api.unregisterBridgeRuntime(projectRoot, process.cwd());
    console.log(JSON.stringify({ ok: true, projectRoot }, null, 2));
  });

program.parseAsync(process.argv);
