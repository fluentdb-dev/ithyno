// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * ImportProjectFlow — orchestrates the full import flow:
 *   idle → confirm → progress → done (banner)
 *
 * Designed to be used from the empty-state (no openspec/ found) OR from a
 * future ReadOnlyBrowse component (once unify-open-project-3-branch merges).
 *
 * Note: ReadOnlyBrowse.tsx is not yet implemented (pending
 * unify-open-project-3-branch merge). Until that change lands, this flow
 * is surfaced via the empty-state button and the Electron/VS Code import
 * menu items (which open an OS folder picker then render this component).
 */

import { useState } from "react";
import { ImportConfirmModal } from "./ImportConfirmModal";
import { ImportProgress } from "./ImportProgress";

type Phase =
  | { name: "idle" }
  | { name: "confirm"; projectRoot: string }
  | { name: "progress"; projectRoot: string; jobId: string }
  | { name: "done"; projectRoot: string; capabilities: string[] };

type Props = {
  /** The target project root to import. If not provided, user enters it. */
  projectRoot?: string;
  /** Called when import completes and dashboard should reload. */
  onComplete: (projectRoot: string) => void;
  /** Called when user cancels the entire flow. */
  onCancel: () => void;
};

export function ImportProjectFlow({ projectRoot: initialRoot, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>(
    initialRoot
      ? { name: "confirm", projectRoot: initialRoot }
      : { name: "idle" },
  );
  const [manualRoot, setManualRoot] = useState("");

  if (phase.name === "idle") {
    return (
      <div className="import-project-flow">
        <h3>Import Existing Project</h3>
        <p>Enter the absolute path to the project you want to import:</p>
        <div className="import-path-input">
          <input
            type="text"
            placeholder="/path/to/your/project"
            value={manualRoot}
            onChange={(e) => setManualRoot(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualRoot.trim()) {
                setPhase({ name: "confirm", projectRoot: manualRoot.trim() });
              }
            }}
            autoFocus
          />
          <button
            className="btn-primary"
            disabled={!manualRoot.trim()}
            onClick={() => {
              if (manualRoot.trim()) {
                setPhase({ name: "confirm", projectRoot: manualRoot.trim() });
              }
            }}
          >
            Continue
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase.name === "confirm") {
    return (
      <ImportConfirmModal
        projectRoot={phase.projectRoot}
        onConfirm={(jobId) =>
          setPhase({ name: "progress", projectRoot: phase.projectRoot, jobId })
        }
        onCancel={onCancel}
      />
    );
  }

  if (phase.name === "progress") {
    return (
      <ImportProgress
        jobId={phase.jobId}
        onDone={(capabilities) =>
          setPhase({ name: "done", projectRoot: phase.projectRoot, capabilities })
        }
        onError={() => {
          // Stay in error state (handled inside ImportProgress)
        }}
        onRetry={() => {
          // Go back to confirm to restart
          setPhase({ name: "confirm", projectRoot: phase.projectRoot });
        }}
        onCancel={onCancel}
      />
    );
  }

  // done — trigger completion in parent
  if (phase.name === "done") {
    onComplete(phase.projectRoot);
    return null;
  }

  return null;
}
