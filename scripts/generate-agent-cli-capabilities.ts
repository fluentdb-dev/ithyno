// SPDX-License-Identifier: GPL-3.0-or-later
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLI_ADAPTERS,
  parseModelListOutput,
  runCodexAppServerModelProbeDetailed,
} from "../server/agents/cli-command-builder.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const outputPath = join(repoRoot, "server", "agent-cli-capabilities.json");

if (process.env.ITHYNO_GENERATE_CLI_CATALOG !== "1") {
  console.error(
    "Refusing to probe installed agent CLIs. Re-run with ITHYNO_GENERATE_CLI_CATALOG=1 npm run generate:cli-catalog.",
  );
  process.exit(1);
}

function resolveInstalledCommand(alias: string) {
  const which = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(which, [alias], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = (result.stdout || "").trim();
  if (!stdout) return null;
  return stdout.split(/\r?\n/)[0]?.trim() || null;
}

async function populateModels(adapterId: string, executablePath: string | null) {
  if (!executablePath) {
    return { availableModels: [], modelMetadata: [] };
  }

  if (adapterId === "codex") {
    const payload = await runCodexAppServerModelProbeDetailed(executablePath);
    return {
      availableModels: payload.models,
      modelMetadata: payload.metadata,
    };
  }

  if (adapterId === "agy") {
    const probe = spawnSync(executablePath, ["models"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = `${probe.stdout || ""}${probe.stderr || ""}`;
    const availableModels = parseModelListOutput("agy", stdout);
    return {
      availableModels,
      modelMetadata: [],
    };
  }

  return { availableModels: [], modelMetadata: [] };
}

async function main() {
  const adapters: Record<string, unknown> = {};
  for (const [adapterId, adapter] of Object.entries(CLI_ADAPTERS)) {
    const installedPath = resolveInstalledCommand(adapter.aliases[0] ?? adapterId);
    const versionProbe = installedPath
      ? spawnSync(installedPath, adapter.versionProbe.slice(1), {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      : null;

    const currentVersion = versionProbe?.stdout?.trim() || versionProbe?.stderr?.trim() || undefined;
    const { availableModels, modelMetadata } = installedPath
      ? await populateModels(adapterId, installedPath)
      : { availableModels: [], modelMetadata: [] };

    adapters[adapterId] = {
      id: adapter.id,
      aliases: adapter.aliases,
      displayName: adapter.displayName,
      currentVersion,
      sourceVersion: currentVersion,
      fields: adapter.fields.map((field) => ({
        key: field.key,
        label: field.label,
        flag: field.flag,
        kind: field.kind,
        category: field.category,
        choices: field.choices ? [...field.choices] : undefined,
        dangerous: field.dangerous,
        guidance: field.guidance,
      })),
      modelDiscovery: adapter.modelDiscovery,
      modelGuidance: adapter.modelGuidance,
      availableModels,
      modelMetadata,
      danger: adapter.dangerousFlags ? [...adapter.dangerousFlags] : [],
    };
  }

  const payload = {
    schemaVersion: 1,
    adapters,
  };

  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath}`);
}

await main();
