// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { ProgressBar } from "../components/ProgressBar";
import { CommandModal, kebabCaseValid } from "../components/CommandModal";
import { KanbanBoard } from "../components/Kanban";
import { TagChipList } from "../components/TagChip";
import { injectPty } from "../api";
import { ERR } from "../lib/errorMessages";

function quoteForShell(s: string): string {
  // Single-quote for POSIX shells; escape embedded quotes by closing + escaping
  // + reopening. Good enough for descriptions; Claude Code receives the literal.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function Overview() {
  const state = useStore((s) => s.state)!;
  const pushToast = useStore((s) => s.pushToast);
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const overviewLayout = useStore((s) => s.overviewLayout);
  const setOverviewLayout = useStore((s) => s.setOverviewLayout);
  const [proposeOpen, setProposeOpen] = useState(false);
  const { changes } = state;

  const totals = changes.reduce(
    (acc, c) => ({ done: acc.done + c.progress.done, total: acc.total + c.progress.total }),
    { done: 0, total: 0 },
  );

  const runInject = async (line: string) => {
    const res = await injectPty(line, true);
    if ((res as any).status === "ok") {
      pushToast("info", ERR.SENT_TO_TERMINAL);
      setProposeOpen(false);
    } else if ((res as any).status === "no-terminal") {
      pushToast("error", (res as any).reason ?? ERR.NO_TERMINAL);
    } else {
      pushToast("error", (res as any).error ?? ERR.INJECT_FAILED);
    }
  };

  return (
    <div className="overview">
      <div className="summary">
        <div>
          <span className="big">{changes.length}</span> active changes
        </div>
        <div className="summary-progress">
          <ProgressBar progress={totals} />
        </div>
        <div className="layout-toggle" role="tablist" aria-label="Overview layout">
          <button
            role="tab"
            aria-selected={overviewLayout === "board"}
            aria-label="Board layout"
            title="Board"
            className={overviewLayout === "board" ? "active" : ""}
            onClick={() => setOverviewLayout("board")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1.5" y="2.5" width="3" height="11" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="6.5" y="2.5" width="3" height="7" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="11.5" y="2.5" width="3" height="9" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            role="tab"
            aria-selected={overviewLayout === "cards"}
            aria-label="Cards layout"
            title="Cards"
            className={overviewLayout === "cards" ? "active" : ""}
            onClick={() => setOverviewLayout("cards")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="1.5" width="5.5" height="5.5" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="1.5" y="9" width="5.5" height="5.5" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="9" width="5.5" height="5.5" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      </div>

      {overviewLayout === "board" ? (
        <KanbanBoard changes={changes} onNewChange={() => setProposeOpen(true)} />
      ) : (
        <>
          {changes.length === 0 && <p className="empty">No active changes under openspec/changes/.</p>}
          <div className="card-grid">
            {changes.map((c) => (
              // The clickable card body is a <Link>; tag chips live outside it
              // because each chip is itself a <Link to="/tags/…"> and HTML
              // forbids nested <a>.
              <div key={c.id} className="card">
                <Link to={`/change/${encodeURIComponent(c.id)}`} className="card-link">
                  <div className="card-head">
                    <h3>{c.id}</h3>
                    {c.deltaSpecs.length > 0 && <span className="badge">{c.deltaSpecs.length} spec Δ</span>}
                  </div>
                  {c.proposal?.intent && <p className="card-intent">{c.proposal.intent}</p>}
                  <ProgressBar progress={c.progress} />
                </Link>
                {c.proposal?.tags && c.proposal.tags.length > 0 && (
                  <div className="card-tags">
                    <TagChipList tags={c.proposal.tags} small />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {proposeOpen && (
        <CommandModal
          title="Propose a new change"
          mode={commandStyle}
          onModeChange={setCommandStyle}
          inputLabel={(m) =>
            m === "cli"
              ? "Change id (kebab-case)"
              : "Describe what you want to build or change"
          }
          inputPlaceholder={(m) =>
            m === "cli"
              ? "e.g. add-task-filter"
              : "e.g. add a task filter that hides completed items"
          }
          validateInput={(v, m) => (m === "cli" ? kebabCaseValid(v.trim()) : v.trim().length > 0)}
          build={(input, m) => {
            const v = input.trim();
            if (!v) return "";
            if (m === "cli") return `npx openspec new change ${v}`;
            return `/opsx:propose ${quoteForShell(v)}`;
          }}
          onCancel={() => setProposeOpen(false)}
          onSubmit={runInject}
        />
      )}
    </div>
  );
}
