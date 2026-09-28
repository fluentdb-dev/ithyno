// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runCli(projectRoot: string, ...args: string[]) {
  return spawnSync(process.execPath, ["bin/ithyno.js", ...args, "--project", projectRoot], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("Codex MCP configuration", () => {
  it("preserves unrelated MCP servers while installing and removing ithyno", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "ithyno-mcp-config-"));
    roots.push(projectRoot);
    const configDir = join(projectRoot, ".codex");
    const configPath = join(configDir, "config.toml");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      configPath,
      '[mcp_servers.example]\ncommand = "example-mcp"\nargs = ["serve"]\n',
      "utf8",
    );

    const installed = runCli(projectRoot, "mcp", "install");
    expect(installed.status).toBe(0);
    const afterInstall = readFileSync(configPath, "utf8");
    expect(afterInstall).toContain("[mcp_servers.example]");
    expect(afterInstall).toContain('command = "example-mcp"');
    expect(afterInstall).toContain("[mcp_servers.ithyno]");
    expect(afterInstall).toContain('\"mcp\", \"serve\", \"--project\"');
    expect(afterInstall).toContain(projectRoot);
    expect(afterInstall).not.toContain("ITHYNO_PROJECT_ROOT");

    const removed = runCli(projectRoot, "mcp", "remove");
    expect(removed.status).toBe(0);
    const afterRemove = readFileSync(configPath, "utf8");
    expect(afterRemove).toContain("[mcp_servers.example]");
    expect(afterRemove).toContain('command = "example-mcp"');
    expect(afterRemove).not.toContain("[mcp_servers.ithyno]");
  }, 20_000);
});
