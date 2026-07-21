// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { ProgressBar } from "../components/ProgressBar";
import { TaskTree } from "../components/TaskTree";
import { SpecView } from "../components/SpecView";
import { CommandModal } from "../components/CommandModal";
import { TagChipList } from "../components/TagChip";
import { injectPty, fetchChange } from "../api";
import { useStartFlow } from "../hooks/useStartFlow";
import { ERR } from "../lib/errorMessages";
import { hasNonVerifyWork, isRunningOrPending } from "../util/changeState";
import type { Change as ChangeType } from "../types";
import { isVsCodeShell } from "../runtime/shell";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Tab = "tasks" | "proposal" | "design" | "delta";

const TASK_FILTER_PREFIX = "ithyno.taskFilter.";
function readTaskFilter(changeId: string | undefined): boolean {
  if (!changeId) return false;
  try {
    return localStorage.getItem(TASK_FILTER_PREFIX + changeId) === "1";
  } catch {
    return false;
  }
}
function writeTaskFilter(changeId: string | undefined, v: boolean): void {
  if (!changeId) return;
  try {
    localStorage.setItem(TASK_FILTER_PREFIX + changeId, v ? "1" : "0");
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function ChangeDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isWorktreeView = searchParams.get("tree") === "worktree";
  const [worktreeChange, setWorktreeChange] = useState<ChangeType | null>(null);
  const [worktreeGone, setWorktreeGone] = useState(false);

  // add-worktree-change-view: when the URL says `tree=worktree`, fetch the
  // change from `.worktrees/<id>/openspec/` so the tabs render whatever the
  // running agent has produced. Fall back to the store's main-tree change
  // (below) if the fetch 404s — the worktree may have been Discarded
  // between the Kanban card click and this render.
  useEffect(() => {
    if (!isWorktreeView || !id) {
      setWorktreeChange(null);
      setWorktreeGone(false);
      return;
    }
    let cancelled = false;
    setWorktreeGone(false);
    fetchChange(id, { tree: "worktree" })
      .then((c) => {
        if (!cancelled) setWorktreeChange(c);
      })
      .catch((err) => {
        if (cancelled) return;
        if ((err as { status?: number }).status === 404) {
          setWorktreeChange(null);
          setWorktreeGone(true);
        } else {
          console.error("[change-detail] worktree fetch failed:", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, isWorktreeView]);

  const mainChange = useStore((s) => s.state?.changes.find((c) => c.id === id));
  // A fresher worktree Change may have been pushed via WS
  // (`worktree-change-updated`) since the initial fetch — prefer that if
  // present, so verify ticks reflect across clients without a page reload.
  const wsWorktreeChange = useStore((s) => (id ? s.worktreeChangeById[id] : undefined));
  const effectiveWorktreeChange = wsWorktreeChange ?? worktreeChange;
  const change = isWorktreeView && effectiveWorktreeChange ? effectiveWorktreeChange : mainChange;
  const archivedEntry = useStore((s) => s.state?.archive.find((a) => a.id === id));
  const storeTerminalAvailable = useStore((s) => s.terminalAvailable);
  // In the VS Code shell the extension host owns a terminal, so injection is
  // always possible — keep the action buttons enabled regardless of what the
  // server reports about its own PTY backend.
  const terminalAvailable = isVsCodeShell() ? true : storeTerminalAvailable;
  const pushToast = useStore((s) => s.pushToast);
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const jobs = useStore((s) => s.jobs);
  // Live worktree progress — same source as the Kanban card. Prefer the
  // WS-driven per-change slice; fall back to the running job's own
  // `worktreeProgress` snapshot (populated at job start / orphan adoption).
  const worktreeProgressFromWs = useStore((s) => (id ? s.worktreeProgress[id] : undefined));
  const [tab, setTab] = useState<Tab>("tasks");
  const [pendingAction, setPendingAction] = useState<null | "archive">(null);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(() => readTaskFilter(id));
  // Re-hydrate when the user navigates between change ids without unmounting.
  useEffect(() => {
    setShowIncompleteOnly(readTaskFilter(id));
  }, [id]);
  const toggleTaskFilter = (v: boolean) => {
    setShowIncompleteOnly(v);
    writeTaskFilter(id, v);
  };
  const { startImplementation, startFlowModals } = useStartFlow();

  const runInject = async (line: string) => {
    const res = await injectPty(line, true);
    if ((res as any).status === "ok") {
      pushToast("info", ERR.SENT_TO_TERMINAL);
      setPendingAction(null);
    } else if ((res as any).status === "no-terminal") {
      pushToast("error", (res as any).reason ?? ERR.NO_TERMINAL);
    } else {
      pushToast("error", (res as any).error ?? ERR.INJECT_FAILED);
    }
  };

  if (!change && archivedEntry) {
    const { progress, archivedAt, outcome } = archivedEntry;
    return (
      <div className="archived-panel" role="status">
        <div className="archived-head">
          <span className="archived-badge">Archived</span>
          {archivedAt && <span className="archived-date">{archivedAt}</span>}
        </div>
        <h2>{id}</h2>
        <p className="archived-progress">
          {progress.total > 0
            ? `${progress.done}/${progress.total} tasks complete`
            : "Archived"}
        </p>
        <p className="muted">
          This change has been archived. Its delta specs were merged into the
          current specs, and the full history is preserved under{" "}
          <code>openspec/changes/archive/</code>.
        </p>
        {outcome && (
          <div className="archived-outcome">
            <h3>Outcome</h3>
            <div className="archived-outcome-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{outcome.body}</ReactMarkdown>
            </div>
          </div>
        )}
        <Link to="/" className="primary archived-back">
          ← Back to Overview
        </Link>
      </div>
    );
  }

  if (!change) {
    return (
      <div className="empty-state">
        <p>Change “{id}” not found.</p>
        <Link to="/">← Back to overview</Link>
      </div>
    );
  }

  return (
    <div className="change-detail">
      <Link to="/" className="back">
        ← Overview
      </Link>
      {worktreeGone && isWorktreeView && (
        <div className="notice">
          ⚠ worktree gone — showing main tree.{" "}
          <Link to={`/change/${encodeURIComponent(id ?? "")}`}>drop the ?tree=worktree</Link>
        </div>
      )}
      <div className="detail-head">
        <h2>
          {change.id}
          {(() => {
            const latestJob = Object.values(jobs)
              .filter((j) => j.changeId === change.id)
              .sort((a, b) => b.startedAt - a.startedAt)[0];
            const worktreeProgress = worktreeProgressFromWs ?? latestJob?.worktreeProgress;
            const hasWorktree =
              !!worktreeProgress && !!latestJob && latestJob.status !== "cancelled";
            if (isWorktreeView && worktreeChange) {
              return (
                <Link
                  to={`/change/${encodeURIComponent(id ?? "")}`}
                  className="detail-tree-pill"
                  title="Switch to main-tree view (URL without ?tree=worktree)."
                >
                  viewing worktree · switch to main
                </Link>
              );
            }
            if (!isWorktreeView && hasWorktree) {
              return (
                <Link
                  to={`/change/${change.id}?tree=worktree`}
                  className="detail-tree-pill"
                  title="Switch to the agent's worktree view (URL with ?tree=worktree)."
                >
                  viewing main · switch to worktree
                </Link>
              );
            }
            return null;
          })()}
        </h2>
        <TagChipList tags={change.proposal?.tags} />
        {(() => {
          const latestJob = Object.values(jobs)
            .filter((j) => j.changeId === change.id)
            .sort((a, b) => b.startedAt - a.startedAt)[0];
          const worktreeProgress = worktreeProgressFromWs ?? latestJob?.worktreeProgress;
          const displayed =
            !!worktreeProgress && !!latestJob && latestJob.status !== "cancelled"
              ? worktreeProgress
              : change.progress;
          return <ProgressBar progress={displayed} />;
        })()}
        {(() => {
          const latestJob = Object.values(jobs)
            .filter((j) => j.changeId === change.id)
            .sort((a, b) => b.startedAt - a.startedAt)[0];
          const worktreeProgress = worktreeProgressFromWs ?? latestJob?.worktreeProgress;
          const effectiveProgress =
            worktreeProgress && latestJob && latestJob.status !== "cancelled"
              ? worktreeProgress
              : change.progress;
          const isDone = effectiveProgress.total > 0 && effectiveProgress.done === effectiveProgress.total;
          // Post wire-role-to-cli-in-manager-skill (Phase 1): the UI no
          // longer gates on `agents.length`. When agents.yaml lacks a
          // code role, the skill falls back to Manager (which has
          // built-in defaults).
          const canStart =
            !isDone &&
            !isRunningOrPending(latestJob) &&
            hasNonVerifyWork(change.tasks);
          if (!canStart) {
            if (isRunningOrPending(latestJob)) {
              return (
                <span className="action-badge mode-worktree" title="Agent job is currently running.">
                  Running
                </span>
              );
            }
            if (!hasNonVerifyWork(change.tasks) && !isDone) {
              return (
                <span
                  className="kanban-verify-only"
                  title="All remaining tasks are under a verification section — human review needed."
                >
                  verify only
                </span>
              );
            }
            return null;
          }
          return (
            <button
              className="action-btn primary"
              onClick={() => {
                startImplementation(change).catch((err) => {
                  console.error("[start] unhandled:", err);
                });
              }}
              title="Start — opens modal to inject /ithy-opsx:dispatch into the terminal"
            >
              Start
            </button>
          );
        })()}
        {terminalAvailable && (
          <button className="action-btn ghost" onClick={() => setPendingAction("archive")}>
            Archive
            <span className={`action-badge mode-${commandStyle}`}>
              {commandStyle === "cli" ? "CLI" : "Claude"}
            </span>
          </button>
        )}
      </div>

      {pendingAction === "archive" && (
        <CommandModal
          title="Archive this change"
          mode={commandStyle}
          onModeChange={setCommandStyle}
          build={(_input, m) =>
            m === "cli"
              ? `npx openspec archive ${change.id}`
              : `/ithy-opsx:archive ${change.id}`
          }
          submitLabel={commandStyle === "cli" ? "Send npx openspec archive" : "Send /ithy-opsx:archive"}
          onCancel={() => setPendingAction(null)}
          onSubmit={runInject}
        />
      )}

      {startFlowModals}

      <div className="tabs">
        <button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>
          Tasks
        </button>
        <button className={tab === "proposal" ? "active" : ""} onClick={() => setTab("proposal")}>
          Proposal
        </button>
        <button className={tab === "design" ? "active" : ""} onClick={() => setTab("design")}>
          Design
        </button>
        <button className={tab === "delta" ? "active" : ""} onClick={() => setTab("delta")}>
          Delta Specs {change.deltaSpecs.length > 0 && <span className="badge">{change.deltaSpecs.length}</span>}
        </button>
      </div>

      <div className="tab-body">
        {tab === "tasks" &&
          (change.tasks ? (
            <>
              <div className="tasks-filter">
                <label>
                  <input
                    type="checkbox"
                    checked={showIncompleteOnly}
                    onChange={(e) => toggleTaskFilter(e.target.checked)}
                  />
                  Show incomplete only
                </label>
              </div>
              <TaskTree tasks={change.tasks} hideCompleted={showIncompleteOnly} />
            </>
          ) : (
            <p className="empty">No tasks.md.</p>
          ))}

        {tab === "proposal" &&
          (change.proposal ? (
            <div className="doc">
              {change.proposal.intent && (
                <section>
                  <h4>Intent</h4>
                  <pre className="md-raw">{change.proposal.intent}</pre>
                </section>
              )}
              {change.proposal.scope && (
                <section>
                  <h4>Scope</h4>
                  <pre className="md-raw">{change.proposal.scope}</pre>
                </section>
              )}
              {change.proposal.approach && (
                <section>
                  <h4>Approach</h4>
                  <pre className="md-raw">{change.proposal.approach}</pre>
                </section>
              )}
              {!change.proposal.intent && !change.proposal.scope && !change.proposal.approach && (
                <pre className="md-raw">{change.proposal.raw}</pre>
              )}
            </div>
          ) : (
            <p className="empty">No proposal.md.</p>
          ))}

        {tab === "design" &&
          (change.design ? <pre className="md-raw">{change.design.raw}</pre> : <p className="empty">No design.md.</p>)}

        {tab === "delta" &&
          (change.deltaSpecs.length > 0 ? (
            change.deltaSpecs.map((spec) => <SpecView key={spec.domain} spec={spec} />)
          ) : (
            <p className="empty">No delta specs.</p>
          ))}
      </div>
    </div>
  );
}
