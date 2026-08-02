// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../store";
import { ProgressBar } from "../components/ProgressBar";
import { CommandModal, kebabCaseValid } from "../components/CommandModal";
import { KanbanBoard } from "../components/Kanban";
import { PhaseLaneBoard } from "../components/PhaseLaneBoard";
import { TagChipList } from "../components/TagChip";
import { injectPty } from "../api";
import { ERR } from "../lib/errorMessages";
import type { Change } from "../types";

function quoteForShell(s: string): string {
  // Single-quote for POSIX shells; escape embedded quotes by closing + escaping
  // + reopening. Good enough for descriptions; Claude Code receives the literal.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Case-insensitive substring filter over a change list. Matches against:
 *   - `change.id`
 *   - `change.proposal?.intent` (the closest thing this codebase has to a
 *     proposal "title" — the shipped `ProposalDoc` type has no `title` field)
 *   - any `change.proposal?.tags[]` entry (tags are `string[]` at runtime)
 *
 * Empty / whitespace-only filter text is a pass-through — returns the input
 * array unchanged so cheap identity checks downstream (bucketize memo etc.)
 * stay stable. Landed by add-kanban-search-filter.
 */
export function filterChanges(changes: Change[], filterText: string): Change[] {
  const t = filterText.trim().toLowerCase();
  if (!t) return changes;
  return changes.filter((c) => {
    if (c.id.toLowerCase().includes(t)) return true;
    const intent = c.proposal?.intent;
    if (intent && intent.toLowerCase().includes(t)) return true;
    const tags = c.proposal?.tags;
    if (tags && tags.some((tag) => tag.toLowerCase().includes(t))) return true;
    return false;
  });
}

export function Overview() {
  const state = useStore((s) => s.state)!;
  const pushToast = useStore((s) => s.pushToast);
  const commandStyle = useStore((s) => s.commandStyle);
  const setCommandStyle = useStore((s) => s.setCommandStyle);
  const overviewLayout = useStore((s) => s.overviewLayout);
  const setOverviewLayout = useStore((s) => s.setOverviewLayout);
  const [proposeOpen, setProposeOpen] = useState(false);
  // Session-only filter (deliberately NOT persisted — a stale filter across
  // reloads is a bigger footgun than losing the filter on refresh). See
  // add-kanban-search-filter proposal.
  const [filterText, setFilterText] = useState("");
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const { changes } = state;

  const visibleChanges = useMemo(() => filterChanges(changes, filterText), [changes, filterText]);

  const totals = changes.reduce(
    (acc, c) => ({ done: acc.done + c.progress.done, total: acc.total + c.progress.total }),
    { done: 0, total: 0 },
  );

  // Cmd+F (macOS) / Ctrl+F (other): focus the filter input from anywhere on
  // the Overview page. If the input is ALREADY the active element, we do NOT
  // preempt — the user gets the browser's native find-in-page as a secondary
  // escape hatch. Non-Overview pages never install this listener (this effect
  // only runs while Overview is mounted), so Cmd+F is the browser's default
  // there.
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "f" && e.key !== "F") return;
      const input = filterInputRef.current;
      if (!input) return;
      if (document.activeElement === input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

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
        <input
          ref={filterInputRef}
          className="kanban-filter"
          type="search"
          placeholder="Filter changes…"
          aria-label="Filter changes by id, intent, or tag"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Esc while focused: clear + blur. Prevent default so a browser
              // that treats Esc-in-search-inputs as "clear only" doesn't
              // fight us on the blur.
              e.preventDefault();
              setFilterText("");
              e.currentTarget.blur();
            }
          }}
        />
        <div className="layout-toggle" role="tablist" aria-label="Overview layout">
          <button
            role="tab"
            aria-selected={overviewLayout === "board"}
            aria-label="Phase — Kanban lanes by progress (todo / in-progress / done)"
            data-tooltip="Phase — lanes by progress (todo / in-progress / done)"
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
            aria-selected={overviewLayout === "phase"}
            aria-label="Agent — active workers grouped by role"
            data-tooltip="Agent — active workers grouped by role"
            className={overviewLayout === "phase" ? "active" : ""}
            onClick={() => setOverviewLayout("phase")}
          >
            {/* Icon: 4 vertical bars of equal height — suggests pipeline lanes,
                distinct from the 3-bar Board icon and the 4-square Cards icon. */}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1.5" y="2.5" width="2.4" height="11" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="5.2" y="2.5" width="2.4" height="11" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="8.9" y="2.5" width="2.4" height="11" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <rect x="12.6" y="2.5" width="2.4" height="11" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            role="tab"
            aria-selected={overviewLayout === "cards"}
            aria-label="All — every change as a card"
            data-tooltip="All — every change as a card"
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
        <KanbanBoard changes={visibleChanges} onNewChange={() => setProposeOpen(true)} />
      ) : overviewLayout === "phase" ? (
        <PhaseLaneBoard changes={visibleChanges} />
      ) : (
        <>
          {visibleChanges.length === 0 && (
            <p className="empty">
              {changes.length === 0
                ? "No active changes under openspec/changes/."
                : "No changes match the current filter."}
            </p>
          )}
          <div className="card-grid">
            {visibleChanges.map((c) => (
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
