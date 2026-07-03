import { useState } from "react";
import { useStore } from "../store";
import {
  commitChangeProposal,
  fetchChangeGitState,
  injectPty,
  runAgent,
  setProposalExecution,
} from "../api";
import type { Change } from "../types";
import { CommandModal } from "../components/CommandModal";
import { ExecutionPicker, type PickerReason } from "../components/ExecutionPicker";
import { AgentPickerModal } from "../components/AgentPickerModal";
import { GitIdentityModal } from "../components/GitIdentityModal";
import { UncommittedProposalModal } from "../components/UncommittedProposalModal";
import { isVsCodeShell } from "../runtime/shell";

/**
 * Unified Start-implementation flow, shared between Kanban Start button and
 * the ChangeDetail Start button.
 *
 * Returns:
 *  - `startImplementation(change)` — dispatch based on `proposal.execution`.
 *    Falls back to the ExecutionPicker when the saved mode's prerequisites
 *    are not met (so the user sees the disabled reason).
 *  - `StartFlowModals` — a component that renders all downstream modals
 *    (Apply CommandModal, ExecutionPicker, AgentPickerModal, GitIdentityModal).
 */
export function useStartFlow() {
  const agents = useStore((s) => s.agents);
  const gitStatus = useStore((s) => s.state?.gitStatus);
  const storeTerminalAvailable = useStore((s) => s.terminalAvailable);
  // In VS Code, the extension owns a `vscode.window.createTerminal` — inject
  // targets that instead of the embedded xterm pane, so "terminal available"
  // is always true regardless of the server's /api/health probe (which
  // reports node-pty availability, irrelevant to the VS Code runtime).
  const terminalAvailable = isVsCodeShell() ? true : storeTerminalAvailable;
  const pushToast = useStore((s) => s.pushToast);

  const [applyPending, setApplyPending] = useState<{ change: Change } | null>(null);
  const [agentPicker, setAgentPicker] = useState<{ change: Change } | null>(null);
  const [executionPicker, setExecutionPicker] = useState<{ change: Change } | null>(null);
  const [uncommittedPending, setUncommittedPending] = useState<{
    change: Change;
    files: { untracked: string[]; modified: string[] };
  } | null>(null);
  const [committingProposal, setCommittingProposal] = useState(false);
  const [openGitPanel, setOpenGitPanel] = useState(false);

  const startTerminalFlow = (change: Change) => {
    console.log("[start:terminal]", change.id, "opening apply modal");
    setApplyPending({ change });
  };

  const startWorktreeFlow = async (change: Change, agentName?: string) => {
    if (!agentName) {
      if (agents.length === 0) {
        console.warn("[start:worktree]", change.id, "aborted: no agents in agents.yaml");
        pushToast("error", "No agents defined. See agents.yaml.example.");
        return;
      }
      if (agents.length === 1) {
        agentName = agents[0].name;
      } else {
        console.log("[start:worktree]", change.id, "opening agent picker (multiple agents)");
        setAgentPicker({ change });
        return;
      }
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
    const mode = change.proposal?.execution;
    console.log("[start]", change.id, "execution=", mode ?? "(unset → picker)");
    if (mode === "worktree") {
      if (
        gitStatus?.isRepo !== true ||
        gitStatus.hasCommits !== true ||
        agents.length === 0
      ) {
        console.log("[start]", change.id, "worktree saved but prerequisites missing → picker");
        setExecutionPicker({ change });
        return;
      }
      return startWorktreeFlow(change);
    }
    if (mode === "terminal") {
      if (!terminalAvailable) {
        console.log("[start]", change.id, "terminal saved but embedded terminal missing → picker");
        setExecutionPicker({ change });
        return;
      }
      return startTerminalFlow(change);
    }
    setExecutionPicker({ change });
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

  const terminalDisabledReason: PickerReason = !terminalAvailable
    ? { text: "No embedded terminal — open a change view to spawn one." }
    : null;

  const worktreeDisabledReason: PickerReason = (() => {
    if (gitStatus?.isRepo !== true) {
      return isVsCodeShell()
        ? { text: "Not a git repository — initialize via VS Code's Source Control." }
        : { text: "Not a git repository — open the Git panel to initialize.", hint: "git-panel" };
    }
    if (!gitStatus.hasCommits) {
      return {
        text: 'No commits yet — `git worktree add -b` needs a HEAD. Make an initial commit first (e.g. `git commit --allow-empty -m "Initial commit"`).',
      };
    }
    if (agents.length === 0) return { text: "No agents in agents.yaml." };
    return null;
  })();

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

      {executionPicker && (
        <ExecutionPicker
          change={executionPicker.change}
          terminalAvailable={terminalAvailable}
          terminalDisabledReason={terminalDisabledReason}
          worktreeAvailable={
            agents.length > 0 &&
            gitStatus?.isRepo === true &&
            gitStatus.hasCommits === true
          }
          worktreeDisabledReason={worktreeDisabledReason}
          onOpenGitPanel={() => {
            setExecutionPicker(null);
            setOpenGitPanel(true);
          }}
          firstAgent={agents[0]}
          onCancel={() => setExecutionPicker(null)}
          onPick={async (mode, save) => {
            const change = executionPicker.change;
            console.log("[picker]", change.id, "mode=", mode, "save=", save);
            setExecutionPicker(null);
            if (save) {
              try {
                await setProposalExecution(change.id, mode);
                console.log("[picker]", change.id, "saved execution to proposal");
                pushToast("info", `Saved execution: ${mode}`);
              } catch (err) {
                console.error("[picker]", change.id, "save failed:", err);
                pushToast("error", err instanceof Error ? err.message : String(err));
              }
            }
            if (mode === "worktree") await startWorktreeFlow(change);
            else startTerminalFlow(change);
          }}
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
          agents={agents}
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
