// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { useStore } from "../store";
import { injectPty } from "../api";
import type { Change } from "../types";
import { CommandModal } from "../components/CommandModal";
import { isVsCodeShell } from "../runtime/shell";

/**
 * Unified Start-implementation flow, shared between Kanban Start button and
 * the ChangeDetail Start button.
 *
 * Landed by wire-role-to-cli-in-manager-skill (Phase 1 — UI walk-back):
 * the UI no longer makes execution decisions. It always injects
 * `/opsx:apply <change-id>` into the embedded terminal. Worktree
 * spawn, per-role agent selection, and `parallelExecution` consumption
 * are moved to the skill layer (Phase 2, deferred).
 *
 * The UI does NOT gate on `agents.yaml` contents. When agents.yaml is
 * empty or lacks a code-role entry, the skill falls back to Manager;
 * Manager itself uses built-in defaults when no manager entry is
 * declared. All that decision-making lives in the skill layer.
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

  const [applyPending, setApplyPending] = useState<{ change: Change } | null>(null);

  const startImplementation = async (change: Change) => {
    if (!terminalAvailable) {
      pushToast(
        "error",
        "No embedded terminal — open a change view to spawn one.",
      );
      return;
    }
    console.log("[start]", change.id, "opening apply modal");
    setApplyPending({ change });
  };

  const runApplyInject = async (line: string) => {
    const res = await injectPty(line, true);
    if ((res as { status?: string }).status === "ok") {
      pushToast("info", "Sent to terminal");
      setApplyPending(null);
    } else if ((res as { status?: string }).status === "no-terminal") {
      pushToast(
        "error",
        (res as { reason?: string }).reason ?? "No terminal open. Open a change view to start one.",
      );
    } else {
      pushToast("error", (res as { error?: string }).error ?? "Inject failed");
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
          title={`Apply this change`}
          build={() => `/opsx:apply ${applyPending.change.id}`}
          submitLabel="Send /opsx:apply"
          onCancel={() => setApplyPending(null)}
          onSubmit={runApplyInject}
        />
      )}
    </>
  );

  return { startImplementation, startFlowModals };
}
