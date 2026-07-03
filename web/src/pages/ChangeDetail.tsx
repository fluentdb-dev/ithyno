import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../store";
import { ProgressBar } from "../components/ProgressBar";
import { TaskTree } from "../components/TaskTree";
import { SpecView } from "../components/SpecView";
import { CommandModal } from "../components/CommandModal";
import { TagChipList } from "../components/TagChip";
import { injectPty } from "../api";
import { useStartFlow } from "../hooks/useStartFlow";
import { hasNonVerifyWork, isRunningOrPending } from "../util/changeState";
import { isVsCodeShell } from "../runtime/shell";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Tab = "tasks" | "proposal" | "design" | "delta";

export function ChangeDetail() {
  const { id } = useParams<{ id: string }>();
  const change = useStore((s) => s.state?.changes.find((c) => c.id === id));
  const archivedEntry = useStore((s) => s.state?.archive.find((a) => a.id === id));
  const storeTerminalAvailable = useStore((s) => s.terminalAvailable);
  // In the VS Code shell the extension host owns a terminal, so injection is
  // always possible — keep the action buttons enabled regardless of what the
  // server reports about its own PTY backend.
  const terminalAvailable = isVsCodeShell() ? true : storeTerminalAvailable;
  const terminalVisible = useStore((s) => s.terminalVisible);
  const setTerminalVisible = useStore((s) => s.setTerminalVisible);
  const pushToast = useStore((s) => s.pushToast);
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const agents = useStore((s) => s.agents);
  const jobs = useStore((s) => s.jobs);
  const [tab, setTab] = useState<Tab>("tasks");
  const [pendingAction, setPendingAction] = useState<null | "archive">(null);
  const { startImplementation, StartFlowModals } = useStartFlow();

  const runInject = async (line: string) => {
    const res = await injectPty(line, true);
    if ((res as any).status === "ok") {
      pushToast("info", "Sent to terminal");
      setPendingAction(null);
    } else if ((res as any).status === "no-terminal") {
      pushToast("error", (res as any).reason ?? "No terminal open. Open the terminal pane to start one.");
    } else {
      pushToast("error", (res as any).error ?? "Inject failed");
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
      <div className="detail-head">
        <h2>{change.id}</h2>
        <TagChipList tags={change.proposal?.tags} />
        <ProgressBar progress={change.progress} />
        {(() => {
          const latestJob = Object.values(jobs)
            .filter((j) => j.changeId === change.id)
            .sort((a, b) => b.startedAt - a.startedAt)[0];
          const isDone = change.progress.total > 0 && change.progress.done === change.progress.total;
          const canStart =
            agents.length > 0 &&
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
              title={
                change.proposal?.execution
                  ? `Start (${change.proposal.execution})`
                  : "Start — pick terminal or worktree"
              }
            >
              Start
              {change.proposal?.execution && (
                <span className={`action-badge mode-${change.proposal.execution}`}>
                  {change.proposal.execution}
                </span>
              )}
            </button>
          );
        })()}
        {terminalAvailable && (
          <>
            <button className="action-btn ghost" onClick={() => setPendingAction("archive")}>
              Archive
              <span className={`action-badge mode-${commandStyle}`}>
                {commandStyle === "cli" ? "CLI" : "Claude"}
              </span>
            </button>
            {!isVsCodeShell() && (
              <button className="term-toggle" onClick={() => setTerminalVisible(!terminalVisible)}>
                {terminalVisible ? "▸ Hide terminal" : "◂ Show terminal"}
              </button>
            )}
          </>
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
              : `/opsx:archive ${change.id}`
          }
          submitLabel={commandStyle === "cli" ? "Send npx openspec archive" : "Send /opsx:archive"}
          onCancel={() => setPendingAction(null)}
          onSubmit={runInject}
        />
      )}

      <StartFlowModals />

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
          (change.tasks ? <TaskTree tasks={change.tasks} /> : <p className="empty">No tasks.md.</p>)}

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
