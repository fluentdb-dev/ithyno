// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { notificationHookAvailable } from "./notificationHooks";

describe("notificationHookAvailable", () => {
  it.each(["claude", "codex", "agy", "copilot"] as const)(
    "enables the notification control for installed %s",
    (cli) => {
      expect(notificationHookAvailable(cli, true, true)).toBe(true);
    },
  );

  it("keeps the control hidden when Copilot is not installed", () => {
    expect(notificationHookAvailable("copilot", false, true)).toBe(false);
    expect(notificationHookAvailable("copilot", undefined, true)).toBe(false);
  });

  it("keeps the control hidden until the backend confirms Hook support", () => {
    expect(notificationHookAvailable("copilot", true, false)).toBe(false);
    expect(notificationHookAvailable("copilot", true, undefined)).toBe(false);
  });

  it.each(["gemini", "opencode", "cursor"] as const)(
    "keeps unsupported %s hidden",
    (cli) => {
      expect(notificationHookAvailable(cli, true, true)).toBe(false);
    },
  );
});
