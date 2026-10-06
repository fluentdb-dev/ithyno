// SPDX-License-Identifier: GPL-3.0-or-later
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLI_ADAPTERS,
  detectCliArgConflicts,
  joinArgv,
  mergeCliArgs,
  parseCliArgs,
  parseCodexModelListOutput,
  parseCodexModelMetadata,
  parseModelListOutput,
  resolveCliAdapter,
  resolveCliExecutablePath,
  runCliProbe,
  runCodexAppServerModelProbe,
  runCodexAppServerModelProbeDetailed,
  sanitizePersistedArgs,
  sanitizeProbeEnv,
  splitArgv,
} from "./cli-command-builder.js";

function makeFakeCodexExecutable(mode: "valid" | "missing-init" | "missing-model-list") {
  const dir = mkdtempSync(join(tmpdir(), "ithyno-codex-fixture-"));
  const scriptPath = join(dir, "codex");
  const script = [
    "#!/usr/bin/env node",
    `const mode = ${JSON.stringify(mode)};`,
    "const write = (packet) => process.stdout.write(JSON.stringify(packet) + '\\n');",
    "const args = process.argv.slice(2);",
    "if (args.includes('--version')) { process.stdout.write('codex 0.160.1\\n'); process.exit(0); }",
    "if (args.includes('--help')) { process.stdout.write('usage: codex [options]\\n--model\\n'); process.exit(0); }",
    "if (args[0] !== 'app-server') { process.exit(0); }",
    "let buffer = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    "  buffer += chunk;",
    "  const lines = buffer.split(/\\r?\\n/);",
    "  buffer = lines.pop() || '';",
    "  for (const line of lines) {",
    "    if (!line.trim()) continue;",
    "    const request = JSON.parse(line);",
    "    if (request.method === 'initialize') {",
    "      if (mode === 'missing-init' || !request.params || !request.params.clientInfo) {",
    "        write({ jsonrpc: '2.0', id: request.id ?? 1, error: { code: -32602, message: 'missing initialize params' } });",
    "        process.exit(1);",
    "      }",
    "      write({ jsonrpc: '2.0', id: request.id, result: { ok: true } });",
    "      continue;",
    "    }",
    "    if (request.method === 'initialized') {",
    "      continue;",
    "    }",
    "    if (request.method === 'model/list') {",
    "      if (mode === 'missing-model-list' || !request.params) {",
    "        write({ jsonrpc: '2.0', id: request.id ?? 2, error: { code: -32602, message: 'missing model/list params' } });",
    "        process.exit(1);",
    "      }",
    "      write({",
    "        jsonrpc: '2.0',",
    "        id: request.id ?? 2,",
    "        result: {",
    "          data: [",
    "            { id: 'gpt-5.1', displayName: 'GPT-5.1', supportedReasoningEfforts: ['low', 'medium'], defaultReasoningEffort: 'medium' },",
    "            { model: 'claude-3.7-sonnet', displayName: 'Claude 3.7 Sonnet' }",
    "          ]",
    "        }",
    "      });",
    "      process.exit(0);",
    "    }",
    "  }",
    "});",
    "process.stdin.on('end', () => { process.exit(0); });",
  ].join("\n");
  writeFileSync(scriptPath, script, "utf8");
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("cli command builder args safety", () => {
  it("preserves user-owned manager and codex options without broad sanitization", () => {
    const args = [
      "--profile",
      "fast",
      "--model",
      "sonnet",
      "--foo",
      "bar",
      "-p",
      "/opsx:apply add-123",
      "--dangerously-skip-permissions",
      "exec",
      "/opsx:review add-123",
      "--session-id",
      "abc123",
      "--resume",
      "last",
    ];

    expect(sanitizePersistedArgs(args)).toEqual(args);
    expect(parseCliArgs(args).values).toMatchObject({
      profile: ["fast"],
      model: ["sonnet"],
      "dangerously-skip-permissions": ["true"],
    });
    expect(parseCliArgs(args).unknown).toContain("--foo");
    expect(parseCliArgs(args).unknown).toContain("bar");
    expect(parseCliArgs(args).unknown).toContain("--resume");
    expect(parseCliArgs(args).unknown).toContain("abc123");
  });

  it("round-trips quoted values without collapsing spaces", () => {
    const input = '--flag "hello world" --other \'two words\' --path="/tmp/example file"';
    const parsed = splitArgv(input);
    expect(parsed).toEqual([
      "--flag",
      "hello world",
      "--other",
      "two words",
      "--path=/tmp/example file",
    ]);
    expect(joinArgv(parsed)).toContain("hello world");
  });

  it("keeps unknown args in order while updating a selected recognized value", () => {
    const args = ["--profile", "fast", "--model", "old-model", "--foo", "keep-me", "--bar", "still-here"];
    const merged = mergeCliArgs(args, { model: "new-model" });
    expect(merged).toEqual(["--profile", "fast", "--foo", "keep-me", "--bar", "still-here", "--model", "new-model"]);
  });

  it("detects duplicate option conflicts from parsed argv", () => {
    const args = ["--model", "first", "--model", "second", "--mode", "plan", "--mode=accept-edits"];
    expect(detectCliArgConflicts(args)).toContain("model");
    expect(detectCliArgConflicts(args)).toContain("mode");
  });

  it("resolves allow-listed adapters and exposes dangerous controls", () => {
    expect(resolveCliAdapter("claude")).toBe(CLI_ADAPTERS.claude);
    expect(resolveCliAdapter("/usr/local/bin/codex")).toBe(CLI_ADAPTERS.codex);
    expect(resolveCliAdapter("agy")).toBe(CLI_ADAPTERS.agy);
    expect(resolveCliAdapter("copilot")).toBe(CLI_ADAPTERS.copilot);
    expect(CLI_ADAPTERS.codex.dangerousFlags).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(CLI_ADAPTERS.claude.modelDiscovery).toBe("manual");
  });

  it("parses native model discovery output from agy and codex", () => {
    expect(parseModelListOutput("agy", "gemini-3.8-flash-high\nclaude-opus-5-5-medium\n")).toEqual([
      "gemini-3.8-flash-high",
      "claude-opus-5-5-medium",
    ]);
    expect(parseModelListOutput("codex", '{"models":[{"id":"gpt-6.1-sol"},{"model":"gpt-5.6-luna"}]}')).toEqual([
      "gpt-6.1-sol",
      "gpt-5.6-luna",
    ]);
  });

  it("strips credential-bearing env vars before probes", () => {
    const env = sanitizeProbeEnv({
      PATH: "/usr/local/bin",
      ITHYNO_SESSION_TOKEN: "secret",
      ITHYNO_BASE: "/tmp/project",
      DOTENV_PRIVATE_KEY: "abc",
      GITHUB_TOKEN: "token",
      OTHER: "keep",
    });
    expect(env.ITHYNO_SESSION_TOKEN).toBeUndefined();
    expect(env.ITHYNO_BASE).toBeUndefined();
    expect(env.DOTENV_PRIVATE_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.OTHER).toBe("keep");
  });

  it("applies output caps and timeouts to probe processes", async () => {
    const timeoutResult = await runCliProbe([process.execPath, "-e", "setTimeout(() => {}, 2000)"], {
      timeoutMs: 50,
      outputLimit: 4096,
    });
    expect(timeoutResult.timedOut).toBe(true);
    expect(timeoutResult.error).toMatch(/timed out/i);

    const capResult = await runCliProbe([process.execPath, "-e", `console.log(${JSON.stringify("x".repeat(32_000))})`], {
      timeoutMs: 2000,
      outputLimit: 128,
    });
    expect(capResult.timedOut).toBe(true);
    expect(capResult.error).toMatch(/output exceeded/i);
  });

  it("parses richer Codex model payloads from result.data metadata", () => {
    const payload = JSON.stringify({
      result: {
        data: [
          { id: "gpt-5.1", label: "GPT-5.1", supportedReasoningEfforts: ["low", "medium"], defaultReasoningEffort: "medium" },
          { model: "claude-3.7-sonnet", label: "Claude 3.7" },
        ],
      },
    });
    expect(parseCodexModelListOutput(payload)).toEqual(["gpt-5.1", "claude-3.7-sonnet"]);
    expect(parseCodexModelMetadata(payload)).toMatchObject([
      { id: "gpt-5.1", displayName: "GPT-5.1", supportedReasoningEfforts: ["low", "medium"], defaultReasoningEffort: "medium" },
      { model: "claude-3.7-sonnet" },
    ]);
  });

  it("parses the real Codex ModelListResponse reasoning effort shape", () => {
    const payload = JSON.stringify({
      result: {
        data: [
          {
            id: "gpt-5.1",
            displayName: "GPT-5.1",
            supportedReasoningEfforts: [
              { reasoningEffort: "minimal", description: "Cheapest fast reasoning" },
              { reasoningEffort: "medium", description: "Balanced reasoning" },
            ],
            defaultReasoningEffort: "medium",
          },
        ],
      },
    });

    expect(parseCodexModelMetadata(payload)).toMatchObject([
      {
        id: "gpt-5.1",
        displayName: "GPT-5.1",
        supportedReasoningEfforts: ["minimal", "medium"],
        defaultReasoningEffort: "medium",
      },
    ]);
  });

  it("rejects incomplete Codex app-server handshakes and proves the full handshake returns model metadata", async () => {
    const missingInit = makeFakeCodexExecutable("missing-init");
    const missingInitResult = await runCodexAppServerModelProbe(missingInit);
    expect(missingInitResult).toEqual([]);
    rmSync(missingInit, { recursive: true, force: true });

    const missingModelList = makeFakeCodexExecutable("missing-model-list");
    const missingListResult = await runCodexAppServerModelProbe(missingModelList);
    expect(missingListResult).toEqual([]);
    rmSync(missingModelList, { recursive: true, force: true });

    const valid = makeFakeCodexExecutable("valid");
    try {
      const models = await runCodexAppServerModelProbe(valid);
      expect(models).toEqual(["gpt-5.1", "claude-3.7-sonnet"]);
      const details = await runCodexAppServerModelProbeDetailed(valid);
      expect(details.metadata).toMatchObject([
        { id: "gpt-5.1", displayName: "GPT-5.1", supportedReasoningEfforts: ["low", "medium"], defaultReasoningEffort: "medium" },
        { model: "claude-3.7-sonnet", displayName: "Claude 3.7 Sonnet" },
      ]);
    } finally {
      rmSync(valid, { recursive: true, force: true });
    }
  });

  it("uses the selected executable path when probing Codex", async () => {
    const fakeCodex = makeFakeCodexExecutable("valid");
    try {
      const version = await runCliProbe(["codex", "--version"], { executablePath: fakeCodex });
      expect(version.ok).toBe(true);
      expect(version.stdout).toContain("codex 0.160.1");

      const models = await runCodexAppServerModelProbe(fakeCodex);
      expect(models).toEqual(["gpt-5.1", "claude-3.7-sonnet"]);
      expect(resolveCliExecutablePath(fakeCodex)).toContain("codex");
    } finally {
      rmSync(fakeCodex, { recursive: true, force: true });
    }
  });
});
