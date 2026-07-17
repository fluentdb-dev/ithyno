// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { useStore } from "../store";
import { injectPty } from "../api";
import type { Change } from "../types";
import { CommandModal } from "../components/CommandModal";
import { isVsCodeShell } from "../runtime/shell";
import { ERR } from "../lib/errorMessages";

/**
 * Unified Start-implementation flow, shared between Kanban Start button and
 * the ChangeDetail Start button.
 *
 * Landed by redesign-skill-namespace-and-dispatch: the UI injects
 * `/ithy-opsx:dispatch <change-id>` into the embedded terminal. The
 * persistent Manager (a `claude` live-shell session) sees the input
 * and evaluates the dispatch skill, which reads agents.yaml, sets up
 * a worktree if needed, and runs the code → review → verify loop by
 * dispatching workers per the role→CLI mapping.
 *
 * The UI does NOT gate on `agents.yaml` contents. When agents.yaml is
 * empty or lacks a code-role entry, the dispatcher falls back to
 * Manager self-dispatch. All execution decisions live in the skill
 * layer.
 *
 * The only prerequisite failure surfaced here is embedded-terminal
 * availability — there's literally no place to inject into otherwise.
 */
export function useStartFlow() {
  const storeTerminalAvailable = useStore((s) => s.terminalAvailable);
  // In VS Code, the extension owns a `vscode.window.createTerminal` — inject
  // targets that instead of the embedded xterm pane, so "terminal available"
  // is always true regardless of the server's /api/health probe.
  const terminalAvailable = isVsCodeShell() ? true : storeTerminalAvailable;
  const pushToast = useStore((s) => s.pushToast);
  const parallelExecution = useStore((s) => s.parallelExecution);
  const lock = useStore((s) => s.state?.lock ?? null);

  const [applyPending, setApplyPending] = useState<{ change: Change } | null>(null);

  const startImplementation = async (change: Change) => {
    if (!terminalAvailable) {
      pushToast("error", ERR.NO_TERMINAL);
      return;
    }
    // Lock-based gate (post collapse-jobregistry-and-add-semaphore). Only
    // gates when `parallelExecution: false`. When the lock is held by a
    // different change, block; when held by THIS change, allow (the
    // dispatcher's restart-recovery handles the attach).
    if (parallelExecution === false && lock && lock.change !== change.id) {
      pushToast("error", ERR.LOCK_HELD(lock.change));
      return;
    }
    console.log("[start]", change.id, "opening dispatch modal");
    setApplyPending({ change });
  };

  const runApplyInject = async (line: string) => {
    const res = await injectPty(line, true);
    if ((res as { status?: string }).status === "ok") {
      pushToast("info", ERR.SENT_TO_TERMINAL);
      setApplyPending(null);
    } else if ((res as { status?: string }).status === "no-terminal") {
      pushToast("error", (res as { reason?: string }).reason ?? ERR.NO_TERMINAL);
    } else {
      pushToast("error", (res as { error?: string }).error ?? ERR.INJECT_FAILED);
    }
  };

  // Return JSX (not a component) so React sees stable element types across
  // re-renders. Returning a `() => JSX` component defined inside the hook
  // creates a new function reference every render, which React treats as a
  // new component type — that forces unmount + mount of the modal tree on
  // every parent re-render, causing effect loops.
  const startFlowModals = (
    <>
      {applyPending && (
        <CommandModal
          title={`Dispatch this change`}
          build={() => `/ithy-opsx:dispatch ${applyPending.change.id}`}
          submitLabel="Send /ithy-opsx:dispatch"
          onCancel={() => setApplyPending(null)}
          onSubmit={runApplyInject}
        />
      )}
    </>
  );

  return { startImplementation, startFlowModals };
}
