// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from "vitest";
import { selectStartAgent } from "./selectStartAgent";
import type { AgentPublic } from "../types";

function mkAgent(name: string, roles: string[]): AgentPublic {
  return {
    name,
    hasEnv: false,
    role: roles[0] ?? "",
    roles,
    mode: "single-prompt",
  };
}

describe("selectStartAgent", () => {
  it("returns 'none' when no agents defined", () => {
    expect(selectStartAgent([])).toEqual({ kind: "none" });
  });

  it("returns 'none' when only non-code, non-manager roles exist", () => {
    const r = selectStartAgent([mkAgent("rev", ["review"])]);
    expect(r).toEqual({ kind: "none" });
  });

  it("auto-selects the sole code agent (pre-multi-agent behavior)", () => {
    const claude = mkAgent("claude", ["code"]);
    const r = selectStartAgent([claude]);
    expect(r).toEqual({ kind: "auto", agent: claude });
  });

  it("auto-selects the sole code agent even when other-role agents coexist", () => {
    const claude = mkAgent("claude", ["code"]);
    const pptr = mkAgent("pptr", ["manager"]);
    const copilotRev = mkAgent("copilot-review", ["review"]);
    const r = selectStartAgent([claude, pptr, copilotRev]);
    expect(r).toEqual({ kind: "auto", agent: claude });
  });

  it("returns 'pick' with only code agents when there are multiple code agents", () => {
    const a = mkAgent("a", ["code"]);
    const b = mkAgent("b", ["code"]);
    const mgr = mkAgent("mgr", ["manager"]);
    const r = selectStartAgent([a, mgr, b]);
    expect(r).toEqual({ kind: "pick", candidates: [a, b] });
  });

  it("falls back to manager when no code agent exists", () => {
    const mgr = mkAgent("mgr", ["manager"]);
    const rev = mkAgent("rev", ["review"]);
    const r = selectStartAgent([rev, mgr]);
    expect(r).toEqual({ kind: "fallback-manager", agent: mgr });
  });

  it("treats a multi-role agent that includes 'code' as a code agent", () => {
    const universal = mkAgent("universal", ["code", "review", "verify"]);
    const r = selectStartAgent([universal]);
    expect(r).toEqual({ kind: "auto", agent: universal });
  });
});
