// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import {
  CLI_FIELD_CATEGORY_ORDER,
  cliSessionStartupOptions,
  cliTextFieldPlaceholder,
  detectCliSessionStartup,
  getCliFieldCategory,
  joinArgv,
  mergeCliArgs,
  migrateCliArgsForAdapterSwitch,
  orderedCliFieldCategories,
  parseCliArgs,
  resolveCliAdapter,
  resetFreeFormCliArgs,
  setCliSessionStartup,
  splitArgv,
} from "../lib/commandBuilder";
import {
  buildAgentConfigSavePayload,
  resolvedModelOptions,
  resolvedVisibleFields,
} from "./AgentConfigModal";

// Client-side kebab-case validation regex mirrored from
// web/src/components/AgentConfigModal.tsx. Extracted so the same
// pattern can be shared with a future server-side validator (Phase 5.3).
const KEBAB_RE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

describe("AgentConfigModal — kebab-case name validation", () => {
  it("accepts single-letter names", () => {
    expect(KEBAB_RE.test("a")).toBe(true);
  });

  it("accepts common agent names", () => {
    expect(KEBAB_RE.test("claude")).toBe(true);
    expect(KEBAB_RE.test("reviewer")).toBe(true);
    expect(KEBAB_RE.test("code-worker")).toBe(true);
    expect(KEBAB_RE.test("verify-2")).toBe(true);
  });

  it("rejects UPPERCASE", () => {
    expect(KEBAB_RE.test("Claude")).toBe(false);
    expect(KEBAB_RE.test("CLAUDE")).toBe(false);
  });

  it("rejects leading digit", () => {
    expect(KEBAB_RE.test("2reviewer")).toBe(false);
  });

  it("rejects leading / trailing hyphen", () => {
    expect(KEBAB_RE.test("-claude")).toBe(false);
    expect(KEBAB_RE.test("claude-")).toBe(false);
  });

  it("rejects spaces and other punctuation", () => {
    expect(KEBAB_RE.test("my agent")).toBe(false);
    expect(KEBAB_RE.test("agent_1")).toBe(false);
    expect(KEBAB_RE.test("agent.dev")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(KEBAB_RE.test("")).toBe(false);
  });

  it("prefers fetched model IDs and hides static fields after failed probes", () => {
    expect(resolvedModelOptions({ availableModels: ["gpt-5.1", "claude-3.7-sonnet"] }, null)).toEqual([
      "gpt-5.1",
      "claude-3.7-sonnet",
    ]);
    expect(resolvedVisibleFields(null, { fields: [{ key: "model", label: "Model", flag: "--model", kind: "text" }] }, "error")).toEqual([]);
    expect(resolvedVisibleFields(null, { fields: [{ key: "model", label: "Model", flag: "--model", kind: "text" }] }, "idle")).toMatchObject([
      { key: "model", flag: "--model" },
    ]);
  });

  it("serializes the agent save payload with fetched models and manual args intact", () => {
    const payload = buildAgentConfigSavePayload({
      form: {
        name: "",
        roles: ["code"],
        prompts: { code: "" },
        command: "codex",
        args: '--model "gpt-5.1" --profile "fast"',
        description: "worker",
        detached: false,
      },
      includesManager: false,
      agmsg: null,
      isAdd: true,
      existingNames: ["code-worker"],
    });

    expect(payload).toMatchObject({
      action: "upsert",
      name: "codex-code",
      roles: ["code"],
      mode: "single-prompt",
      command: "codex",
      args: ["--model", "gpt-5.1", "--profile", "fast"],
      description: "worker",
    });
  });

  it("preserves a partially typed dash-prefixed field value", () => {
    const args = mergeCliArgs([], { model: "-" });

    expect(joinArgv(args)).toBe("--model=-");
    expect(parseCliArgs(splitArgv(joinArgv(args))).values.model).toEqual(["-"]);
  });

  it("parses Codex sandbox as a valued option despite Agy using the same flag as boolean", () => {
    const codex = resolveCliAdapter("codex");
    const agy = resolveCliAdapter("agy");

    expect(parseCliArgs(["--sandbox", "workspace-write"], codex).values.sandbox).toEqual([
      "workspace-write",
    ]);
    expect(parseCliArgs(["--sandbox"], agy).values.sandbox).toEqual(["true"]);
  });

  it("uses value examples instead of CLI flags as text placeholders", () => {
    expect(cliTextFieldPlaceholder("codex", { key: "model", label: "Model" }, ["gpt-example"])).toBe("e.g. gpt-example");
    expect(cliTextFieldPlaceholder("codex", { key: "profile", label: "Profile" })).toBe("e.g. work or fast");
    expect(cliTextFieldPlaceholder("claude", { key: "model", label: "Model" })).toContain("sonnet");
  });

  it("builds manager-only session startup argv for each supported CLI", () => {
    expect(cliSessionStartupOptions("agy")).toEqual([]);
    expect(setCliSessionStartup("codex", ["--model", "gpt-example"], "latest")).toEqual([
      "--model",
      "gpt-example",
      "resume",
      "--last",
    ]);
    expect(detectCliSessionStartup("codex", ["--model", "gpt-example", "resume", "--last"])).toBe("latest");
    expect(detectCliSessionStartup("codex", ["resume", "--last", "--model", "gpt-example"])).toBe("latest");
    expect(setCliSessionStartup("claude", ["--model", "sonnet", "--resume", "session-id"], "latest")).toEqual([
      "--model",
      "sonnet",
      "--continue",
    ]);
    expect(detectCliSessionStartup("copilot", ["--resume", "named-session"])).toBe("custom");
  });

  it("drops Codex-only options when switching to Copilot", () => {
    const migrated = migrateCliArgsForAdapterSwitch(
      [
        "resume",
        "--last",
        "--ask-for-approval",
        "on-request",
        "--sandbox",
        "read-only",
        "--dangerously-bypass-approvals-and-sandbox",
        "--model",
        "claude-sonnet-5.5",
        "--custom-flag",
        "custom-value",
      ],
      resolveCliAdapter("codex"),
      resolveCliAdapter("copilot"),
    );

    expect(migrated).toEqual([
      "--model",
      "claude-sonnet-5.5",
      "--custom-flag",
      "custom-value",
    ]);
  });

  it("removes a shared flag when its meaning differs between CLIs", () => {
    expect(migrateCliArgsForAdapterSwitch(
      ["--sandbox", "workspace-write", "--model", "gpt-example"],
      resolveCliAdapter("codex"),
      resolveCliAdapter("agy"),
    )).toEqual(["--model", "gpt-example"]);
  });

  it("drops Copilot-only options when switching to Codex", () => {
    expect(migrateCliArgsForAdapterSwitch(
      [
        "--continue",
        "--auto-tier",
        "efficiency",
        "--reasoning-effort",
        "medium",
        "--mode",
        "plan",
        "--context",
        "default",
        "--model",
        "gpt-6.1-sol",
      ],
      resolveCliAdapter("copilot"),
      resolveCliAdapter("codex"),
    )).toEqual(["--model", "gpt-6.1-sol"]);
  });

  it("resets only free-form and foreign arguments for the current CLI", () => {
    const copilot = resolveCliAdapter("copilot");
    expect(copilot).not.toBeNull();

    expect(resetFreeFormCliArgs([
      "--continue",
      "--model",
      "claude-sonnet-5.5",
      "--mode",
      "plan",
      "--sandbox",
      "read-only",
      "--custom-flag",
      "custom-value",
    ], copilot!)).toEqual([
      "--continue",
      "--model",
      "claude-sonnet-5.5",
      "--mode",
      "plan",
    ]);
  });

  it("categorizes fields in the required order and keeps empty categories hidden", () => {
    expect(getCliFieldCategory({ flag: "--model", key: "model" })).toBe("model");
    expect(getCliFieldCategory({ flag: "--auto-tier", key: "autoTier" })).toBe("model");
    expect(getCliFieldCategory({ flag: "--reasoning-effort", key: "reasoningEffort" })).toBe("reasoning");
    expect(getCliFieldCategory({ flag: "--permission-mode", key: "permissionMode" })).toBe("permissions");
    expect(getCliFieldCategory({ flag: "--sandbox", key: "sandbox" })).toBe("sandbox");
    expect(getCliFieldCategory({ flag: "--mode", key: "mode" })).toBe("execution");
    expect(getCliFieldCategory({ flag: "--context", key: "context" })).toBe("context");
    expect(getCliFieldCategory({ flag: "--allow-all", key: "allowAll" })).toBe("unattended-dangerous");
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
    expect(orderedCliFieldCategories([{ key: "model", label: "Model", flag: "--model", kind: "text", category: "model" }, { key: "reasoningEffort", label: "Reasoning", flag: "--reasoning-effort", kind: "select", category: "reasoning" }])).toEqual(["model", "reasoning", "advanced"]);
  });
});
