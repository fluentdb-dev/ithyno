// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo, useState } from "react";
import { useStore } from "../store";
import { CommandModal } from "../components/CommandModal";
import { injectPty } from "../api";
import type { Change, JobSummary } from "../types";
import { useStartFlow } from "./useStartFlow";
import { ERR } from "../lib/errorMessages";
import { commandForManager } from "../lib/managerCommand";

/**
 * Shared card-action wiring for the Board (`KanbanBoard`) and Phase
 * (`PhaseLaneBoard`) views. Owns the pending modal (Archive / Apply /
 * Merge / Discard), the per-change job lookup, and the start-flow hook —
 * so both boards render identical `<KanbanCard>`s with identical
 * behavior even though they group them differently.
 *
 * Landed by add-phase-lane-view-toggle.
 */

type PendingAction =
  | { kind: "apply"; change: Change }
  | { kind: "archive"; change: Change }
  | { kind: "agent-merge"; change: Change; job: JobSummary }
  | { kind: "agent-discard"; change: Change; job: JobSummary };

function modalTitle(p: PendingAction): string {
  if (p.kind === "apply") return "Apply this change";
  if (p.kind === "archive") return "Archive this change";
  if (p.kind === "agent-merge") return `Merge agent branch for ${p.change.id}`;
  return `Discard agent worktree for ${p.change.id}`;
}

function buildPendingCommand(p: PendingAction, mode: string, agents: ReturnType<typeof useStore.getState>["agents"]): string {
  const id = p.change.id;
  if (p.kind === "apply") return commandForManager(agents, "opsx", "apply", id);
  if (p.kind === "archive") return mode === "cli" ? `npx openspec archive ${id}` : commandForManager(agents, "ithy-opsx", "archive", id);
  if (p.kind === "agent-merge") {
    // Claude mode delegates to the ithy-opsx-merge skill so the auto-stash /
    // auto-pop dance handles a dirty main tree; CLI mode keeps the raw git
    // invocation (users who chose CLI expect to handle stashing themselves).
    return mode === "cli" ? `git merge --no-ff ${p.job.branch}` : commandForManager(agents, "ithy-opsx", "merge", id);
  }
  return `git worktree remove --force ${p.job.worktreePath} && git branch -D ${p.job.branch}`;
}

function modalSubmitLabel(p: PendingAction, commandStyle: "claude" | "cli", agents: ReturnType<typeof useStore.getState>["agents"]): string {
  if (p.kind === "apply") return `Send ${commandForManager(agents, "opsx", "apply")}`;
  if (p.kind === "archive") return commandStyle === "cli" ? "Send npx openspec archive" : `Send ${commandForManager(agents, "ithy-opsx", "archive")}`;
  if (p.kind === "agent-merge") return commandStyle === "cli" ? "Send git merge" : `Send ${commandForManager(agents, "ithy-opsx", "merge")}`;
  return "Send cleanup";
}

export type KanbanCardHandlers = {
  jobByChange: Map<string, JobSummary>;
  onStart: (change: Change) => void;
  onArchive: (change: Change) => void;
  onMerge: (change: Change, job: JobSummary) => void;
  onDiscard: (change: Change, job: JobSummary) => void;
  /** Rendered by the caller. Contains both the pending Command modal and
   *  the start-flow modal stack. */
  modals: React.ReactNode;
};

export function useKanbanActions(): KanbanCardHandlers {
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const pushToast = useStore((s) => s.pushToast);
  const jobs = useStore((s) => s.jobs);
  const agents = useStore((s) => s.agents);
  const clearWorktreeProgress = useStore((s) => s.clearWorktreeProgress);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const { startImplementation, startFlowModals } = useStartFlow();

  // annotate-cards-with-worker-job-state (task 1.1): finished jobs are NOT
  // evicted here. `store.setJobFinished` only flips `status` + stamps
  // `finishedAt`, and the entry survives in `s.jobs` until the server emits
  // `agent-job-removed` (external worktree discard) or the page reloads. So
  // the 30 s post-finish retention the spec requires is already satisfied —
  // no client-side grace timer is needed, and adding an eviction here would
  // regress the Merge / View diff / Discard affordances, which read the same
  // map. The transient-ness of the "done" checkmark is instead enforced by
  // `WorkerStateIndicator`'s DONE_GRACE_MS window at render time.
  const jobByChange = useMemo(() => {
    const m = new Map<string, JobSummary>();
    for (const j of Object.values(jobs)) {
      const prev = m.get(j.changeId);
      if (!prev || j.startedAt > prev.startedAt) m.set(j.changeId, j);
    }
    return m;
  }, [jobs]);

  const onArchive = (change: Change) => setPending({ kind: "archive", change });
  const onStart = (change: Change) => {
    void startImplementation(change);
  };
  const onMerge = (change: Change, job: JobSummary) => setPending({ kind: "agent-merge", change, job });
  const onDiscard = (change: Change, job: JobSummary) => setPending({ kind: "agent-discard", change, job });

  const runInject = async (line: string) => {
    const res = await injectPty(line, true);
    if ((res as any).status === "ok") {
      pushToast("info", "Sent to terminal");
      if (pending && (pending.kind === "agent-merge" || pending.kind === "agent-discard")) {
        clearWorktreeProgress(pending.change.id);
      }
      setPending(null);
    } else if ((res as any).status === "no-terminal") {
      pushToast("error", (res as any).reason ?? ERR.NO_TERMINAL);
    } else {
      pushToast("error", (res as any).error ?? ERR.INJECT_FAILED);
    }
  };

  const modals = (
    <>
      {pending && (
        <CommandModal
          title={modalTitle(pending)}
          mode={pending.kind === "archive" || pending.kind === "agent-merge" ? commandStyle : undefined}
          onModeChange={pending.kind === "archive" || pending.kind === "agent-merge" ? setCommandStyle : undefined}
          build={(_input, m) => buildPendingCommand(pending, m ?? "claude", agents)}
          submitLabel={modalSubmitLabel(pending, commandStyle, agents)}
          onCancel={() => setPending(null)}
          onSubmit={runInject}
        >
          {pending.kind === "archive" && !pending.change.hasOutcome && (
            <div className="modal-warning">⚠ No outcome.md yet — write one before archiving.</div>
          )}
          {pending.kind === "apply" && commandStyle === "cli" && (
            <div className="modal-warning">
              Apply requires Claude Code in the terminal. Switch to Claude mode to send this.
            </div>
          )}
          {pending.kind === "agent-discard" && (
            <div className="modal-warning">
              ⚠ This removes the worktree AND deletes branch <code>{pending.job.branch}</code>.
            </div>
          )}
        </CommandModal>
      )}
      {startFlowModals}
    </>
  );

  return { jobByChange, onStart, onArchive, onMerge, onDiscard, modals };
}
