import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const tempDirs = [];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: opts.cwd ?? rootDir,
    encoding: "utf8",
    stdio: opts.stdio ?? ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...(opts.env ?? {}) },
  });
}

function makeTempProject() {
  const dir = mkdtempSync(join(tmpdir(), "ithyno-dotenvx-smoke-"));
  tempDirs.push(dir);
  return dir;
}

function stageHost(hostName) {
  const hostRoot = join(rootDir, hostName);
  const pkgJson = join(hostRoot, "package.json");
  assert.ok(existsSync(pkgJson), `missing ${hostRoot}/package.json`);

  run("npm", ["run", "prepack:host"], { cwd: hostRoot, stdio: "inherit" });
  const stageDir = join(hostRoot, "host");
  const stagedPkg = join(stageDir, "node_modules", "@dotenvx", "dotenvx", "package.json");
  assert.ok(existsSync(stagedPkg), `${hostName} staging should contain bundled @dotenvx/dotenvx`);
  const cliPath = join(stageDir, "node_modules", "@dotenvx", "dotenvx", "src", "cli", "dotenvx.js");
  assert.ok(existsSync(cliPath), `${hostName} staging should contain the bundled dotenvx CLI`);
  return { stageDir, cliPath };
}

function main() {
  run("npm", ["run", "build"], { cwd: rootDir });

  const hosts = ["electron", "vscode-extension"];
  const projectRoot = makeTempProject();
  const envPath = join(projectRoot, ".env");
  const profilePath = join(projectRoot, ".env.development");
  const keyPath = join(projectRoot, ".env.keys");

  writeFileSync(envPath, "APP=production\nFEATURE=false\n", "utf8");
  writeFileSync(profilePath, "APP=development\nFEATURE=enabled\n", "utf8");

  try {
    for (const hostName of hosts) {
      const { stageDir, cliPath } = stageHost(hostName);
      const tempStage = join(stageDir, "tmp-smoke");
      mkdirSync(tempStage, { recursive: true });
      const stagedProfile = join(tempStage, ".env.development");
      const stagedKey = join(tempStage, ".env.keys");

      writeFileSync(join(tempStage, ".env"), "APP=production\nFEATURE=false\n", "utf8");
      writeFileSync(stagedProfile, "APP=development\nFEATURE=enabled\n", "utf8");

      run(process.execPath, [cliPath, "encrypt", "-f", stagedProfile, "-fk", stagedKey, "--no-native"], {
        cwd: stageDir,
        env: { DOTENV_PRIVATE_KEY: "" },
      });

      assert.ok(existsSync(stagedKey), `${hostName} staging should create .env.keys`);
      const decrypted = run(process.execPath, [cliPath, "decrypt", "-f", stagedProfile, "-fk", stagedKey, "--no-native", "--stdout"], {
        cwd: stageDir,
        env: { DOTENV_PRIVATE_KEY: "" },
      });
      assert.match(decrypted, /APP=development/);
      assert.match(decrypted, /FEATURE=enabled/);

      rmSync(tempStage, { recursive: true, force: true });
    }

    assert.ok(existsSync(envPath));
    assert.ok(existsSync(profilePath));
    assert.ok(!existsSync(keyPath));
    console.log("dotenvx bundled host smoke OK");
  } finally {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
