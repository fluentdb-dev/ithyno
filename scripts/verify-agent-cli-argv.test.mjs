// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildValidationCases,
  containsArgvError,
} from "./verify-agent-cli-argv.mjs";

const catalog = JSON.parse(
  readFileSync(new URL("../server/agent-cli-capabilities.json", import.meta.url), "utf8"),
);

describe("agent CLI argv smoke verification", () => {
  it("builds adapter-specific normal cases without leaking foreign CLI flags", () => {
    const codex = buildValidationCases("codex", catalog.adapters.codex)[0]?.args ?? [];
    const copilot = buildValidationCases("copilot", catalog.adapters.copilot)[0]?.args ?? [];

    expect(codex).toContain("resume");
    expect(codex).toContain("--sandbox");
    expect(codex).not.toContain("--auto-tier");
    expect(codex).not.toContain("--mode");

    expect(copilot).toContain("--continue");
    expect(copilot).toContain("--auto-tier");
    expect(copilot).toContain("--mode");
    expect(copilot).not.toContain("resume");
    expect(copilot).not.toContain("--sandbox");
  });

  it("isolates dangerous flags from the combined normal case", () => {
    const cases = buildValidationCases("codex", catalog.adapters.codex);
    expect(cases[0]?.args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(cases[0]?.args).not.toContain("--approve-for-me");
    expect(cases.some((entry) => entry.args.includes("--dangerously-bypass-approvals-and-sandbox"))).toBe(true);
    expect(cases.some((entry) => entry.args.includes("--approve-for-me"))).toBe(true);
  });

  it("recognizes representative parser rejection messages", () => {
    expect(containsArgvError("error: unexpected argument '--auto-tier' found")).toBe(true);
    expect(containsArgvError("error: Invalid command format.")).toBe(true);
    expect(containsArgvError("authentication required")).toBe(false);
  });
});
