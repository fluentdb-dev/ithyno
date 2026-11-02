// SPDX-License-Identifier: GPL-3.0-or-later

import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const catalogPath = join(repoRoot, "server", "agent-cli-capabilities.json");

const DEFAULT_SETTLE_MS = 2_500;
const MAX_OUTPUT_BYTES = 32_768;

const preferredValues = {
  claude: {
    model: "sonnet",
    effort: "high",
    permissionMode: "plan",
  },
  codex: {
    model: "gpt-6.1-sol",
    profile: "default",
    sandbox: "read-only",
    approval: "on-request",
  },
  agy: {
    model: "gemini-3.6-flash",
    effort: "medium",
    mode: "plan",
    sandbox: true,
  },
  copilot: {
    model: "claude-sonnet-5.5",
    reasoningEffort: "medium",
    context: "default",
    autoTier: "efficiency",
    mode: "plan",
  },
};

const sessionArgs = {
  claude: ["--continue"],
  codex: ["resume", "--last"],
  agy: [],
  copilot: ["--continue"],
};

const argvErrorPatterns = [
  /unexpected argument/i,
  /unknown (?:argument|option|flag|command)/i,
  /unrecognized (?:argument|option|flag|command)/i,
  /invalid command format/i,
  /cannot be used with/i,
  /(?:argument|option).*(?:requires|needs).*value/i,
  /a value is required for/i,
];

export function resolveInstalledCommand(aliases) {
  const locator = process.platform === "win32" ? "where" : "which";
  for (const alias of aliases) {
    const result = spawnSync(locator, [alias], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const candidate = String(result.stdout || "").split(/\r?\n/)[0]?.trim();
    if (candidate) return candidate;
  }
  return null;
}

function fieldValue(adapterId, field) {
  const preferred = preferredValues[adapterId]?.[field.key];
  if (preferred !== undefined) return preferred;
  if (field.kind === "boolean") return true;
  if (Array.isArray(field.choices) && field.choices.length > 0) return field.choices[0];
  return `ithyno-${field.key}-probe`;
}

function serializeField(field, value) {
  if (field.kind === "boolean") return value ? [field.flag] : [];
  return [field.flag, String(value)];
}

/**
 * Build the same kind of argv produced by the UI, while keeping mutually
 * exclusive dangerous switches out of the normal combined case.
 */
export function buildValidationCases(adapterId, adapter) {
  const dangerousFlags = new Set(adapter.danger ?? []);
  const isDangerous = (field) => field.dangerous || dangerousFlags.has(field.flag);
  const normalFields = adapter.fields.filter((field) => !isDangerous(field));
  const normalArgs = [
    ...(sessionArgs[adapterId] ?? []),
    ...normalFields.flatMap((field) => serializeField(field, fieldValue(adapterId, field))),
  ];
  const cases = [{ name: "normal builder arguments", args: normalArgs }];

  for (const field of adapter.fields.filter(isDangerous)) {
    const modelField = adapter.fields.find((candidate) => candidate.key === "model");
    const modelArgs = modelField
      ? serializeField(modelField, fieldValue(adapterId, modelField))
      : [];
    cases.push({
      name: field.label,
      args: [...modelArgs, ...serializeField(field, true)],
    });
  }

  return cases;
}

export function containsArgvError(output) {
  return argvErrorPatterns.some((pattern) => pattern.test(output));
}

function appendLimited(current, chunk) {
  const next = `${current}${String(chunk)}`;
  return next.length <= MAX_OUTPUT_BYTES ? next : next.slice(-MAX_OUTPUT_BYTES);
}

function terminateProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export function runValidationCase(executable, testCase, settleMs = DEFAULT_SETTLE_MS) {
  return new Promise((resolveResult) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer;
    const startedAt = Date.now();
    const child = spawn(executable, testCase.args, {
      detached: process.platform !== "win32",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    child.stdout?.on("data", (chunk) => { stdout = appendLimited(stdout, chunk); });
    child.stderr?.on("data", (chunk) => { stderr = appendLimited(stderr, chunk); });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveResult({ ...result, stdout, stderr, durationMs: Date.now() - startedAt });
    };

    child.once("error", (error) => {
      finish({ accepted: false, kind: "spawn-error", error: error.message });
    });
    child.once("exit", (code, signal) => {
      const output = `${stdout}\n${stderr}`;
      finish({
        accepted: !containsArgvError(output),
        kind: containsArgvError(output) ? "argv-error" : "early-exit",
        code,
        signal,
      });
    });

    timer = setTimeout(() => {
      terminateProcessTree(child);
      finish({ accepted: true, kind: "started", code: null, signal: "SIGTERM" });
    }, settleMs);
  });
}

function compactOutput(result) {
  const output = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
  return output.split(/\r?\n/).slice(0, 6).join("\n");
}

async function main() {
  const requireAll = process.argv.includes("--require-all");
  const settleArg = process.argv.find((arg) => arg.startsWith("--settle-ms="));
  const settleMs = settleArg ? Number(settleArg.slice("--settle-ms=".length)) : DEFAULT_SETTLE_MS;
  if (!Number.isInteger(settleMs) || settleMs < 250 || settleMs > 30_000) {
    throw new Error("--settle-ms must be an integer between 250 and 30000");
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  let failures = 0;
  let checked = 0;
  let skipped = 0;

  for (const [adapterId, adapter] of Object.entries(catalog.adapters)) {
    const executable = resolveInstalledCommand(adapter.aliases ?? [adapterId]);
    if (!executable) {
      skipped += 1;
      console.log(`SKIP ${adapter.displayName}: executable not installed`);
      if (requireAll) failures += 1;
      continue;
    }

    for (const testCase of buildValidationCases(adapterId, adapter)) {
      checked += 1;
      const result = await runValidationCase(executable, testCase, settleMs);
      if (result.accepted) {
        const detail = result.kind === "started"
          ? `accepted and remained running for ${result.durationMs}ms`
          : `accepted; runtime exited with code ${String(result.code)}`;
        console.log(`PASS ${adapter.displayName} / ${testCase.name}: ${detail}`);
      } else {
        failures += 1;
        console.error(`FAIL ${adapter.displayName} / ${testCase.name}: ${result.error ?? "argv rejected"}`);
        const output = compactOutput(result);
        if (output) console.error(output);
      }
    }
  }

  console.log(`Checked ${checked} argv case(s); skipped ${skipped} missing CLI(s); failures ${failures}.`);
  if (failures > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
