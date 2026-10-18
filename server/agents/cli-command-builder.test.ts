// SPDX-License-Identifier: GPL-3.0-or-later
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_DOCUMENTED_MODELS,
  CLI_ADAPTERS,
  COPILOT_DOCUMENTED_MODELS,
  CLI_FIELD_CATEGORY_ORDER,
  detectCliArgConflicts,
  formatArgvPreview,
  getCliFieldCategory,
  joinArgv,
  mergeCliArgs,
  orderedCliFieldCategories,
  parseCliArgs,
  parseCodexModelListOutput,
  parseCodexModelMetadata,
  parseModelListOutput,
  probeCliAdapter,
  resolveCliAdapter,
  resolveCliExecutablePath,
  runCliProbe,
  runCodexAppServerModelProbe,
  runCodexAppServerModelProbeDetailed,
  sanitizePersistedArgs,
  sanitizeProbeEnv,
  splitArgv,
} from "./cli-command-builder.js";
import {
  CLI_ADAPTERS as WEB_CLI_ADAPTERS,
  CLI_FIELD_CATEGORY_CONFIG,
  getCliFieldCategory as getWebCliFieldCategory,
} from "../../web/src/lib/commandBuilder";

function makeFakeExecutable(name: string, script: string) {
  const dir = mkdtempSync(join(tmpdir(), `ithyno-${name}-fixture-`));
  const scriptPath = join(dir, name);
  writeFileSync(scriptPath, script, "utf8");
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

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

  it("assigns model and reasoning fields to the correct sections and keeps the category order deterministic", () => {
    expect(getCliFieldCategory({ flag: "--model", key: "model" })).toBe("model");
    expect(getCliFieldCategory({ flag: "--profile", key: "profile" })).toBe("model");
    expect(getCliFieldCategory({ flag: "--auto-tier", key: "autoTier" })).toBe("model");
    expect(getCliFieldCategory({ flag: "--effort", key: "effort" })).toBe("reasoning");
    expect(getCliFieldCategory({ flag: "--reasoning-effort", key: "reasoningEffort" })).toBe("reasoning");
    expect(getCliFieldCategory({ flag: "--permission-mode", key: "permissionMode" })).toBe("permissions");
    expect(getCliFieldCategory({ flag: "--dangerously-bypass-approvals-and-sandbox", key: "dangerouslyBypassApprovalsAndSandbox" })).toBe("unattended-dangerous");
    expect(getCliFieldCategory({ flag: "--allow-all", key: "allowAll" })).toBe("unattended-dangerous");
    expect(orderedCliFieldCategories(CLI_ADAPTERS.copilot.fields)).toEqual([
      "model",
      "reasoning",
      "execution",
      "context",
      "unattended-dangerous",
      "advanced",
    ]);
    expect(CLI_FIELD_CATEGORY_ORDER).toEqual([
      "model",
      "reasoning",
      "permissions",
      "sandbox",
      "execution",
      "context",
      "tools-access",
      "unattended-dangerous",
      "advanced",
    ]);
  });

  it("omits empty categories, keeps Model and Reasoning open by default, and separates dangerous controls", () => {
    const fields = [
      { key: "model", label: "Model", flag: "--model", kind: "text", category: "model" },
      { key: "reasoningEffort", label: "Reasoning effort", flag: "--reasoning-effort", kind: "select", category: "reasoning" },
      { key: "dangerouslySkipPermissions", label: "Dangerous skip permissions", flag: "--dangerously-skip-permissions", kind: "boolean", category: "unattended-dangerous", dangerous: true },
    ] as const;

    expect(orderedCliFieldCategories(fields)).toEqual(["model", "reasoning", "unattended-dangerous", "advanced"]);
    expect(getCliFieldCategory(fields[2])).toBe("unattended-dangerous");
    expect(CLI_ADAPTERS.claude.fields.filter((field) => getCliFieldCategory(field) === "permissions")).toHaveLength(1);
    expect(CLI_ADAPTERS.copilot.fields.filter((field) => getCliFieldCategory(field) === "unattended-dangerous")).toHaveLength(2);
  });

  it("keeps preview and save lossless for manual args and recognized updates", () => {
    const args = ["--profile", "fast", "--unknown", "keep-me", "--model", "old-model", "--noise", "preserve"];
    const merged = mergeCliArgs(args, { model: "new-model" });
    expect(merged).toEqual(["--profile", "fast", "--unknown", "keep-me", "--noise", "preserve", "--model", "new-model"]);
    expect(formatArgvPreview("codex", merged)).toBe("codex --profile fast --unknown keep-me --noise preserve --model new-model");
    expect(sanitizePersistedArgs(merged)).toEqual(merged);
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

  it("ignores agy progress output and accepts only actual tab-separated model rows", () => {
    const fixture = [
      "Fetching available models...",
      "gemini-3.8-flash-high\tGemini 3.8 Flash High",
      "claude-sonnet-5-5-low\tClaude Sonnet 5.5 Low",
      "gpt-oss-120b-medium\tGPT OSS 120B Medium",
    ].join("\n");

    expect(parseModelListOutput("agy", fixture)).toEqual([
      "gemini-3.8-flash-high",
      "claude-sonnet-5-5-low",
      "gpt-oss-120b-medium",
    ]);
  });

  it("detects Copilot capability flags from its top-level help output", async () => {
    const fakeCopilot = makeFakeExecutable("copilot", [
      "#!/usr/bin/env node",
      "const args = process.argv.slice(2);",
      "if (args.includes('--version')) { console.log('1.0.91'); process.exit(0); }",
      "if (args.includes('--help')) {",
      "  process.stdout.write([",
      "    'GitHub Copilot CLI 1.0.91',",
      "    '',",
      "    'Usage: copilot [options] [command]',",
      "    '',",
      "    'Options:',",
      "    '  --model <model>                 Choose a model',",
      "    '  --reasoning-effort <level>      Reasoning effort (none, minimal, low, medium, high, xhigh, max)',",
      "    '  --context <tier>                Context mode (default, long_context)',",
      "    '  --auto-tier <preference>        Auto routing (efficiency, balance, intelligence)',",
      "    '  --mode <mode>                  Execution mode (interactive, plan, autopilot)',",
      "    '  --allow-all                    Allow all tool and URL usage',",
      "    '  --yolo                         Skip required confirmation prompts',",
      "    '',",
      "    'Examples:',",
      "    '  copilot --model gpt-5 --mode plan',",
      "  ].join('\\n'));",
      "  process.exit(0);",
      "}",
      "process.exit(1);",
    ].join("\n"));

    const result = await probeCliAdapter(CLI_ADAPTERS.copilot, fakeCopilot);
    expect(result.ok).toBe(true);
    expect(result.supported).toBe(true);
    expect(result.fields.map((field) => field.flag)).toEqual(expect.arrayContaining([
      "--model",
      "--reasoning-effort",
      "--context",
      "--auto-tier",
      "--mode",
      "--allow-all",
      "--yolo",
    ]));

    rmSync(fakeCopilot, { recursive: true, force: true });
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

  it("keeps the bundled catalog consistent with server and web adapter/category metadata", () => {
    const catalog = JSON.parse(readFileSync(new URL("../agent-cli-capabilities.json", import.meta.url), "utf8"));
    for (const [id, adapter] of Object.entries(CLI_ADAPTERS)) {
      const webAdapter = WEB_CLI_ADAPTERS[id as keyof typeof WEB_CLI_ADAPTERS];
      expect(webAdapter).toBeDefined();
      const entry = catalog.adapters[id];
      expect(entry).toBeDefined();
      expect(entry.aliases).toEqual(adapter.aliases);
      expect(entry.modelDiscovery).toBe(adapter.modelDiscovery);
      expect(entry.danger).toEqual(adapter.dangerousFlags ?? []);
      expect(entry.fields.map((field: { flag: string }) => field.flag)).toEqual(
        adapter.fields.map((field) => field.flag),
      );
      expect(entry.fields.map((field: { category?: string }) => field.category ?? "advanced")).toEqual(
        adapter.fields.map((field) => getCliFieldCategory(field)),
      );
      expect(entry.fields.map((field: { category?: string }) => field.category ?? "advanced")).toEqual(
        webAdapter.fields.map((field) => getWebCliFieldCategory(field)),
      );
      expect(entry.danger).toEqual(webAdapter.dangerousFlags ?? []);
      expect(Object.keys(CLI_FIELD_CATEGORY_CONFIG)).toEqual(Object.keys({
        model: true,
        reasoning: true,
        permissions: true,
        sandbox: true,
        execution: true,
        context: true,
        "tools-access": true,
        "unattended-dangerous": true,
        advanced: true,
      }));
    }
    expect(catalog.adapters.claude.availableModels).toEqual(CLAUDE_CODE_DOCUMENTED_MODELS);
    expect(catalog.adapters.copilot.availableModels).toEqual(COPILOT_DOCUMENTED_MODELS);
  });

  it("uses adapter-specific option kinds when different CLIs share a flag", () => {
    expect(parseCliArgs(["--sandbox", "workspace-write"], CLI_ADAPTERS.codex).values.sandbox).toEqual([
      "workspace-write",
    ]);
    expect(parseCliArgs(["--sandbox"], CLI_ADAPTERS.agy).values.sandbox).toEqual(["true"]);
  });
});
