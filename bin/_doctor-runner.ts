// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Runner script for `ithyno doctor`. Invoked via tsx by the doctor
 * subcommand in bin/ithyno.js.
 *
 * Prints a human-readable table or JSON and exits 0 (ready) / 1 (not ready).
 */
import { runDoctor } from "../server/doctor.js";

const report = await runDoctor();
const jsonFlag = process.argv.includes("--json");

if (jsonFlag) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.readyForManager ? 0 : 1);
}

// Human-readable table
function pad(s: string | undefined, n: number): string {
  return String(s ?? "").padEnd(n);
}

const COL_NAME = 12;
const COL_STATUS = 11;
const COL_VERSION = 16;

const agentEntries = Object.entries(report.agents) as [string, import("../server/doctor.js").CliStatus][];
const allEntries: [string, import("../server/doctor.js").CliStatus][] = [
  ...agentEntries,
  ["tmux", report.tmux],
  ["agmsg", report.agmsg],
];

for (const [name, status] of allEntries) {
  const st = status.installed ? "installed" : "missing";
  const ver = status.version ?? "";
  const p = status.path ?? "";
  const line = pad(name + ":", COL_NAME) + pad(st, COL_STATUS) + pad(ver, COL_VERSION) + p;
  process.stdout.write(line.trimEnd() + "\n");
}

process.stdout.write("ready for Manager: " + (report.readyForManager ? "yes" : "no") + "\n");
process.exit(report.readyForManager ? 0 : 1);
