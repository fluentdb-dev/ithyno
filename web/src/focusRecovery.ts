// SPDX-License-Identifier: GPL-3.0-or-later
import type { AuthProbeResult } from "./api";

/**
 * Decision produced by the focus/visibility recovery path:
 *   "no-op"        — dashboard is healthy or auth is transiently unavailable; do nothing.
 *   "reconnect"    — auth confirmed; reconnect WebSocket and refresh workspace state.
 *   "reload-shell" — server explicitly rejected credentials; recreate the containing shell.
 */
export type RecoveryDecision = "no-op" | "reconnect" | "reload-shell";

/**
 * Pure recovery decision for a window focus / visibility event.
 *
 * Rules:
 * - Connected dashboard → always "no-op" (preserve open dialogs and form state).
 * - Disconnected + auth valid → "reconnect" (refresh state without shell reload).
 * - Disconnected + auth unauthorized → "reload-shell" (explicit credential rejection).
 * - Disconnected + auth unavailable → "no-op" (let WebSocket retry handle it).
 */
export function recoverDecision(
  connected: boolean,
  authResult: AuthProbeResult,
): RecoveryDecision {
  if (connected) return "no-op";
  if (authResult === "valid") return "reconnect";
  if (authResult === "unauthorized") return "reload-shell";
  return "no-op"; // "unavailable" — leave UI mounted
}
