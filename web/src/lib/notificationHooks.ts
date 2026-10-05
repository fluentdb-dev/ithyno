// SPDX-License-Identifier: GPL-3.0-or-later
import type { Cli } from "../types";

const NOTIFICATION_HOOK_CLIS = new Set<Cli>(["claude", "codex", "agy", "copilot"]);

/** Whether Settings should offer an opt-in notification Hook for this CLI row. */
export function notificationHookAvailable(
  cli: Cli,
  installed: boolean | undefined,
  hookSupported: boolean | undefined,
): boolean {
  return installed === true && hookSupported === true && NOTIFICATION_HOOK_CLIS.has(cli);
}
