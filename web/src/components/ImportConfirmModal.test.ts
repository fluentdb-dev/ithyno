// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for ImportConfirmModal logic.
 *
 * The component itself is React/DOM and tested manually (task 8.5). This
 * file tests the helper functions that are pure-logic.
 */
import { describe, expect, it } from "vitest";

// Inline the pure helper logic from the component so it can be tested
// without a DOM environment.

function bytesToHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function estimateTokens(bytes: number): string {
  const tokens = Math.round(bytes / 4);
  if (tokens < 1000) return `~${tokens}`;
  if (tokens < 1_000_000) return `~${(tokens / 1000).toFixed(0)}K`;
  return `~${(tokens / 1_000_000).toFixed(1)}M`;
}

describe("bytesToHuman", () => {
  it("formats bytes", () => {
    expect(bytesToHuman(512)).toBe("512 B");
  });
  it("formats KB", () => {
    expect(bytesToHuman(1536)).toBe("1.5 KB");
  });
  it("formats MB", () => {
    expect(bytesToHuman(2 * 1024 * 1024)).toBe("2.0 MB");
  });
  it("formats fractional MB", () => {
    expect(bytesToHuman(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("estimateTokens", () => {
  it("small count", () => {
    expect(estimateTokens(400)).toBe("~100");
  });
  it("K range", () => {
    expect(estimateTokens(40_000)).toBe("~10K");
  });
  it("M range", () => {
    expect(estimateTokens(4_000_000)).toBe("~1.0M");
  });
  it("returns approximation prefix", () => {
    expect(estimateTokens(8000)).toMatch(/^~\d/);
  });
});
