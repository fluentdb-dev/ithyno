// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef, useState } from "react";
import { useStartFlow } from "../hooks/useStartFlow";
import { startableCandidates } from "../util/changeState";
import { TagChipList } from "./TagChip";
import type { Change, JobSummary } from "../types";

type Props = {
  changes: Change[];
  jobByChange: Map<string, JobSummary>;
  /** When provided, use this Start handler instead of the launcher's own
   *  useStartFlow instance. Pass the parent's `startImplementation` so the
   *  parent's `StartFlowModals` renders the resulting modals. */
  startImplementation?: (change: Change) => void | Promise<void>;
};

/**
 * Column-header Start launcher for the IN-PROGRESS column. Mirrors the
 * `+ New Change` button pattern in TODO. Opens a popover of startable
 * changes; picking one dispatches through the shared Start flow, which
 * silently resolves the mode from `parallelExecution` config (per-change
 * `proposal.execution` overrides still win).
 */
export function ParallelStartLauncher({ changes, jobByChange, startImplementation }: Props) {
  const ownFlow = useStartFlow();
  const start = startImplementation ?? ownFlow.startImplementation;

  const candidates = useMemo(
    () => startableCandidates(changes, jobByChange),
    [changes, jobByChange],
  );

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Post wire-role-to-cli-in-manager-skill (Phase 1): the UI no longer gates
  // on `agents.length === 0`. When agents.yaml lacks a code role, the skill
  // layer falls back to Manager (which has built-in defaults).
  const disabled =
    candidates.length === 0
      ? {
          text: "Nothing startable — all changes are already running or have verify-only work left.",
        }
      : null;

  const label = candidates.length > 0 ? `Start ▾ (${candidates.length})` : "Start ▾";

  return (
    <div className="parallel-start-launcher" ref={popoverRef}>
      <button
        type="button"
        className="kanban-add ghost"
        disabled={!!disabled}
        title={disabled?.text}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && !disabled && (
        <div className="parallel-start-popover" role="dialog" aria-label="Start another change">
          <div className="parallel-start-popover-head">
            <span>Pick a change to start in parallel</span>
          </div>
          <ul>
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="parallel-start-candidate"
                  onClick={() => {
                    setOpen(false);
                    void start(c);
                  }}
                >
                  <span className="parallel-start-candidate-head">
                    <strong>{c.id}</strong>
                    <span className="muted">
                      {c.progress.done}/{c.progress.total}
                    </span>
                  </span>
                  <TagChipList tags={c.proposal?.tags} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!startImplementation && ownFlow.startFlowModals}
    </div>
  );
}
