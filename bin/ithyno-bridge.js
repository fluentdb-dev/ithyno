#!/usr/bin/env node
import { Command } from "commander";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

async function loadBridgeApi() {
  try {
    return await import("../server/bridge.ts");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[ithyno-bridge] bridge runtime failed to load:", message);
    process.exit(1);
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
    const runtime = await api.lookupBridgeRuntime(projectRoot, process.cwd());
    if (!runtime) {
      console.log(JSON.stringify({ ok: true, projectRoot, removed: false }, null, 2));
      process.exit(0);
    }
    await api.unregisterBridgeRuntime(projectRoot, process.cwd(), runtime.generation, runtime.processStartIdentity);
    console.log(JSON.stringify({ ok: true, projectRoot, removed: true }, null, 2));
  });

program.parseAsync(process.argv);
