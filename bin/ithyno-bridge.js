#!/usr/bin/env node
import { Command } from "commander";
import { canonicalProjectRoot, bridgeStatus, registerBridgeRuntime, unregisterBridgeRuntime } from "../server/bridge.ts";

const program = new Command();
program.name("ithyno").description("ithyno bridge CLI");

program
  .command("status")
  .option("-p, --project <path>")
  .action(async (opts) => {
    const projectRoot = canonicalProjectRoot(opts.project || process.cwd());
    const res = await bridgeStatus(projectRoot);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  });

program
  .command("register")
  .option("-p, --project <path>")
  .action(async (opts) => {
    const projectRoot = canonicalProjectRoot(opts.project || process.cwd());
    const descriptor = await registerBridgeRuntime(projectRoot, process.cwd(), {
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
    const projectRoot = canonicalProjectRoot(opts.project || process.cwd());
    await unregisterBridgeRuntime(projectRoot, process.cwd());
    console.log(JSON.stringify({ ok: true, projectRoot }, null, 2));
  });

program.parseAsync(process.argv);
