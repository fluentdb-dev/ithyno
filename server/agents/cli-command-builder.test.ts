// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { sanitizePersistedArgs, splitArgv, joinArgv } from "./cli-command-builder.js";

describe("cli command builder args safety", () => {
  it("preserves unknown arguments while stripping dispatcher-owned prompt transport", () => {
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
    ];

    expect(sanitizePersistedArgs(args)).toEqual([
      "--profile",
      "fast",
      "--model",
      "sonnet",
      "--foo",
      "bar",
      "--dangerously-skip-permissions",
    ]);
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
    expect(joinArgv(parsed)).toContain('hello world');
  });
});
