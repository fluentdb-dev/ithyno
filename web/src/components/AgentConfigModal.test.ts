// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";

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
});
