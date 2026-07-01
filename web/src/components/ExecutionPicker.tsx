import { useState } from "react";
import type { Change } from "../types";

export type PickerReason = { text: string; hint?: "git-panel" } | null;

export type ExecutionPickerProps = {
  change: Change;
  terminalAvailable: boolean;
  terminalDisabledReason: PickerReason;
  worktreeAvailable: boolean;
  worktreeDisabledReason: PickerReason;
  firstAgent: { name: string; command: string; args: string[] } | undefined;
  onCancel: () => void;
  onPick: (mode: "worktree" | "terminal", save: boolean) => void | Promise<void>;
  onOpenGitPanel: () => void;
};

/**
 * Modal that lets the user pick between terminal and worktree execution and
 * optionally save the choice back into the proposal's frontmatter.
 * Shared between the Kanban Start button and the ChangeDetail Start button.
 */
export function ExecutionPicker({
  change,
  terminalAvailable,
  terminalDisabledReason,
  worktreeAvailable,
  worktreeDisabledReason,
  firstAgent,
  onCancel,
  onPick,
  onOpenGitPanel,
}: ExecutionPickerProps) {
  const [save, setSave] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal execution-picker" onClick={(e) => e.stopPropagation()}>
        <h3>Start implementation — {change.id}</h3>
        <p className="muted">Pick how this change should run.</p>

        <div className="execution-options">
          <div
            className={`execution-option${terminalAvailable ? "" : " disabled"}`}
            role="button"
            aria-disabled={!terminalAvailable}
            title={terminalDisabledReason?.text}
            onClick={() => terminalAvailable && onPick("terminal", save)}
          >
            <div className="execution-option-head">
              <strong>Terminal</strong>
              <span className="muted">Claude auto-resumed · shared session</span>
            </div>
            <p className="muted">
              Inject <code>/opsx:apply {change.id}</code> into the embedded terminal's
              Claude REPL (auto-launched as <code>claude --continue</code> so the last
              session for this project resumes). Runs in the main working tree.
            </p>
            {terminalDisabledReason && (
              <p className="execution-disabled-reason">⚠ {terminalDisabledReason.text}</p>
            )}
          </div>

          <div
            className={`execution-option${worktreeAvailable ? "" : " disabled"}`}
            role="button"
            aria-disabled={!worktreeAvailable}
            title={worktreeDisabledReason?.text}
            onClick={() => worktreeAvailable && onPick("worktree", save)}
          >
            <div className="execution-option-head">
              <strong>Worktree</strong>
              <span className="muted">isolated · parallel-safe</span>
            </div>
            <p className="muted">
              <code>git worktree add .worktrees/{change.id} -b agent/{change.id}</code>{" "}
              then spawn{" "}
              {firstAgent ? (
                <code>
                  {firstAgent.command} {firstAgent.args.join(" ")}
                </code>
              ) : (
                <em>an agent from agents.yaml</em>
              )}
              . Stream output to the Agents page.
            </p>
            {worktreeDisabledReason && (
              <p className="execution-disabled-reason">
                ⚠ {worktreeDisabledReason.text}
                {worktreeDisabledReason.hint === "git-panel" && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenGitPanel();
                      }}
                    >
                      Open Git panel
                    </button>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <label className="execution-save">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
          Save to proposal frontmatter so the next start skips this picker.
        </label>

        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
