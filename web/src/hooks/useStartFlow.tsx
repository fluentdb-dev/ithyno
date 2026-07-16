// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { useStore } from "../store";
import {
  commitChangeProposal,
  fetchChangeGitState,
  injectPty,
  runAgent,
} from "../api";
import type { Change } from "../types";
import { CommandModal } from "../components/CommandModal";
import { AgentPickerModal } from "../components/AgentPickerModal";
import { GitIdentityModal } from "../components/GitIdentityModal";
import { UncommittedProposalModal } from "../components/UncommittedProposalModal";
import { isVsCodeShell } from "../runtime/shell";
import { selectStartAgent } from "../util/selectStartAgent";

/**
 * Unified Start-implementation flow, shared between Kanban Start button and
 * the ChangeDetail Start button.
 *
 * Mode selection order:
 *   1. `change.proposal.execution` — per-change override (still honored)
 *   2. `parallelExecution` config — true → worktree, false → terminal inject
 *
 * Landed by add-parallel-execution-config: no picker modal — mode is
 * resolved silently. Prerequisite failures (no agents / not a repo / no
 * commits / no terminal) surface as toasts.
 *
 * Returns:
 *  - `startImplementation(change)` — resolve mode and dispatch.
 *  - `StartFlowModals` — Apply CommandModal, AgentPickerModal, and
 *    GitIdentityModal downstream renders.
 */
export function useStartFlow() {
  const agents = useStore((s) => s.agents);
  const parallelExecution = useStore((s) => s.parallelExecution);
  const gitStatus = useStore((s) => s.state?.gitStatus);
  const storeTerminalAvailable = useStore((s) => s.terminalAvailable);
  // In VS Code, the extension owns a `vscode.window.createTerminal` — inject
  // targets that instead of the embedded xterm pane, so "terminal available"
  // is always true regardless of the server's /api/health probe (which
  // reports node-pty availability, irrelevant to the VS Code runtime).
  const terminalAvailable = isVsCodeShell() ? true : storeTerminalAvailable;
  const pushToast = useStore((s) => s.pushToast);

  const [applyPending, setApplyPending] = useState<{ change: Change } | null>(null);
  const [agentPicker, setAgentPicker] = useState<{
    change: Change;
    candidates: typeof agents;
  } | null>(null);
  const [uncommittedPending, setUncommittedPending] = useState<{
    change: Change;
    files: { untracked: string[]; modified: string[] };
  } | null>(null);
  const [committingProposal, setCommittingProposal] = useState(false);
  const [openGitPanel, setOpenGitPanel] = useState(false);

  const startTerminalFlow = (change: Change) => {
    if (!terminalAvailable) {
      pushToast("error", "No embedded terminal — open a change view to spawn one.");
      return;
    }
    console.log("[start:terminal]", change.id, "opening apply modal");
    setApplyPending({ change });
  };

  const startWorktreeFlow = async (change: Change, agentName?: string) => {
    if (gitStatus?.isRepo !== true) {
      pushToast(
        "error",
        isVsCodeShell()
          ? "Not a git repository — initialize via VS Code's Source Control."
          : "Not a git repository — initialize via the Git panel first.",
      );
      if (!isVsCodeShell()) setOpenGitPanel(true);
      return;
    }
    if (!gitStatus.hasCommits) {
      pushToast(
        "error",
        'No commits yet — `git worktree add -b` needs a HEAD. Make an initial commit first (e.g. `git commit --allow-empty -m "Initial commit"`).',
      );
      return;
    }
    if (agents.length === 0) {
      pushToast("error", "No agents defined. See agents.yaml.example.");
      return;
    }
    if (!agentName) {
      const selection = selectStartAgent(agents);
      if (selection.kind === "none") {
        console.warn("[start:worktree]", change.id, "aborted: no code or manager agent");
        pushToast(
          "error",
          "No agent with role 'code' or 'manager' in agents.yaml.",
        );
        return;
      }
      if (selection.kind === "pick") {
        console.log("[start:worktree]", change.id, "opening agent picker (multiple code agents)");
        setAgentPicker({ change, candidates: selection.candidates });
        return;
      }
      if (selection.kind === "fallback-manager") {
        console.log("[start:worktree]", change.id, "no code agent → falling back to manager", selection.agent.name);
      }
      agentName = selection.agent.name;
    }
    // Pre-check: `git worktree add HEAD` will silently skip anything the user
    // hasn't committed under `openspec/changes/<id>/`. Surface that before
    // spawning the agent so a fresh /opsx:propose doesn't turn into a
    // wasted round-trip.
    try {
      const state = await fetchChangeGitState(change.id);
      if (state.untracked.length > 0 || state.modified.length > 0) {
        console.log("[start:worktree]", change.id, "proposal uncommitted → modal");
        setUncommittedPending({ change, files: state });
        return;
      }
    } catch (err) {
      // The check is defensive — if it fails (not a repo, git missing,
      // network blip), fall through to the normal spawn.
      console.warn("[start:worktree]", change.id, "git-state check failed:", err);
    }
    console.log("[start:worktree]", change.id, "runAgent →", agentName);
    try {
      const job = await runAgent(change.id, agentName);
      console.log("[start:worktree]", change.id, "job started:", job);
      pushToast("info", `Agent started for ${change.id}`);
    } catch (err) {
      console.error("[start:worktree]", change.id, "failed:", err);
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const commitAndStart = async () => {
    if (!uncommittedPending) return;
    const change = uncommittedPending.change;
    setCommittingProposal(true);
    try {
      await commitChangeProposal(change.id);
      pushToast("info", `Committed proposal for ${change.id}`);
      setUncommittedPending(null);
      // Restart the worktree flow now that the proposal is on HEAD — the
      // pre-check will see an empty git-state and pass through.
      await startWorktreeFlow(change);
    } catch (err) {
      console.error("[start:worktree]", change.id, "commit-proposal failed:", err);
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setCommittingProposal(false);
    }
  };

  const startImplementation = async (change: Change) => {
    // Resolution order: per-change override → parallelExecution config.
    const override = change.proposal?.execution;
    const mode: "worktree" | "terminal" =
      override === "worktree" || override === "terminal"
        ? override
        : parallelExecution
          ? "worktree"
          : "terminal";
    console.log(
      "[start]",
      change.id,
      "mode=",
      mode,
      override ? `(override=${override})` : `(config parallelExecution=${parallelExecution})`,
    );
    if (mode === "worktree") return startWorktreeFlow(change);
    return startTerminalFlow(change);
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
  // every parent re-render, and any useEffect inside a modal fires again
  // and again in an unbounded loop.
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

      {uncommittedPending && (
        <UncommittedProposalModal
          changeId={uncommittedPending.change.id}
          files={uncommittedPending.files}
          busy={committingProposal}
          onCommitAndStart={commitAndStart}
          onCancel={() => setUncommittedPending(null)}
        />
      )}

      {openGitPanel && <GitIdentityModal onClose={() => setOpenGitPanel(false)} />}

      {agentPicker && (
        <AgentPickerModal
          change={agentPicker.change}
          agents={agentPicker.candidates}
          onPick={(agentName) => {
            void startWorktreeFlow(agentPicker.change, agentName);
            setAgentPicker(null);
          }}
          onCancel={() => setAgentPicker(null)}
        />
      )}
    </>
  );

  return { startImplementation, startFlowModals };
}
