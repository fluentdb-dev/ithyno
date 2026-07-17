// SPDX-License-Identifier: GPL-3.0-or-later
//
// Canonical error strings for the dashboard, per the "Error Display
// Convention" requirement (normalize-error-display). Any message that
// appears at 2+ call sites lives here so wording stays uniform.
//
// Async-action failures use these constants via
// `pushToast("error", ERR.…)`; load-time / server errors that share
// text across pages do the same.
//
// If a message is truly single-call-site (a one-off toast in one
// component with no other consumers), keeping the string inline is
// fine — this file is for *shared* strings, not every string.

export const ERR = {
  /** Embedded terminal isn't attached — nothing to inject into. */
  NO_TERMINAL: "No terminal — open a change view to spawn one.",

  /** Terminal is attached but the inject request failed (server-side
   *  or PTY-write error). Generic fallback; call sites that get a
   *  specific `reason` from the server should show that instead. */
  INJECT_FAILED: "Inject failed.",

  /** Confirmation that the injected line reached the terminal. */
  SENT_TO_TERMINAL: "Sent to terminal",

  /** parallelExecution=false lock is held by a different change, so
   *  the Start action is refused. */
  LOCK_HELD: (change: string): string =>
    `Change ${change} is currently running. Merge or discard it first.`,
} as const;
