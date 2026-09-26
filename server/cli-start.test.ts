// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:net";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

let occupied: Server | null = null;

afterEach(async () => {
  if (!occupied) return;
  const server = occupied;
  occupied = null;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function occupyPort(): Promise<number> {
  occupied = createServer();
  await new Promise<void>((resolve, reject) => {
    occupied!.once("error", reject);
    occupied!.listen(0, "127.0.0.1", () => resolve());
  });
  const address = occupied.address();
  if (!address || typeof address === "string") throw new Error("test server has no TCP port");
  return address.port;
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, ["bin/ithyno.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("ithyno dashboard startup CLI", () => {
  it("uses the package-resolved tsx CLI for every nested launch", () => {
    const source = readFileSync("bin/ithyno.js", "utf8");
    expect(source.match(/resolve\(pkgRoot, "node_modules", "tsx", "dist", "cli\.mjs"\)/g)).toHaveLength(1);
    expect(source).toContain("[bundledTsxCli, serverEntry]");
    expect(source).toContain("[bundledTsxCli, doctorRunner]");
  });

  it("advertises the explicit start command", () => {
    const result = runCli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("start");
    expect(result.stdout).toContain("Start the ithyno dashboard");
  });

  it("reports an occupied port without a Node.js stack trace", async () => {
    const port = await occupyPort();
    const result = runCli(["start", "--port", String(port), "--no-open"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Port ${port} is already in use`);
    expect(result.stderr).toContain("ithyno bridge status --project .");
    expect(result.stderr).toContain("ithyno start --port");
    expect(result.stderr).not.toContain("Server.setupListenHandle");
    expect(result.stderr).not.toContain("Bare `ithyno` startup is deprecated");
  });

  it("keeps bare startup as a deprecated compatibility alias", async () => {
    const port = await occupyPort();
    const result = runCli(["--port", String(port), "--no-open"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Bare `ithyno` startup is deprecated; use `ithyno start`");
    expect(result.stderr).toContain(`Port ${port} is already in use`);
  });

  it("rejects an invalid port before spawning the server", () => {
    const result = runCli(["start", "--port", "not-a-port", "--no-open"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("invalid dashboard port");
    expect(result.stderr).not.toContain("TypeError");
  });
});
