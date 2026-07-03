import { useEffect } from "react";

export type UncommittedProposalModalProps = {
  changeId: string;
  files: { untracked: string[]; modified: string[] };
  busy?: boolean;
  onCommitAndStart: () => void;
  onCancel: () => void;
};

/**
 * Shown before Start (Worktree) when `openspec/changes/<id>/` has uncommitted
 * files in the main tree. `git worktree add HEAD` would leave those files
 * behind and the agent would enter an empty change directory — this modal
 * offers to commit the proposal (`propose: <id>`) first, or cancel so the user
 * can commit manually.
 */
export function UncommittedProposalModal({
  changeId,
  files,
  busy,
  onCommitAndStart,
  onCancel,
}: UncommittedProposalModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const untracked = files.untracked;
  const modified = files.modified;
  const total = untracked.length + modified.length;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="modal uncommitted-proposal-modal"
        role="dialog"
        aria-label="Commit proposal before starting"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Proposal not committed</h3>
        <p className="muted uncommitted-proposal-intro">
          The Worktree agent branches from <code>HEAD</code>, so uncommitted
          files under <code>openspec/changes/{changeId}/</code> would be left
          behind. Commit the proposal first, or cancel and commit manually.
        </p>

        <div className="uncommitted-proposal-files">
          {untracked.length > 0 && (
            <>
              <div className="uncommitted-proposal-heading">
                Untracked <span className="muted">({untracked.length})</span>
              </div>
              <ul>
                {untracked.map((p) => (
                  <li key={`u:${p}`}><code>{p}</code></li>
                ))}
              </ul>
            </>
          )}
          {modified.length > 0 && (
            <>
              <div className="uncommitted-proposal-heading">
                Modified <span className="muted">({modified.length})</span>
              </div>
              <ul>
                {modified.map((p) => (
                  <li key={`m:${p}`}><code>{p}</code></li>
                ))}
              </ul>
            </>
          )}
          {total === 0 && (
            <div className="muted">No files listed.</div>
          )}
        </div>

        <div className="modal-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={onCommitAndStart} disabled={busy}>
            {busy ? "Committing…" : "Commit & Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
