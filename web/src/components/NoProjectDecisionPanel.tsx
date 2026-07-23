// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Two-branch decision panel shown when the user opens a folder that has no
 * openspec/ directory. Landed by unify-open-project-3-branch;
 * narrowed to 2 branches (Cancel removed) per user feedback 2026-07-22.
 *
 * Extended by expand-init-to-scaffold-agents: the Initialize button now
 * opens <InitDialog /> for prerequisite check + Manager CLI selection before
 * POSTing /api/init.
 *
 * Actions:
 *   • Initialize openspec here → open InitDialog → POST /api/init + refetch state
 *   • Browse read-only → setBrowseMode(true) → renders <ReadOnlyBrowse />
 */
import { useState } from "react";
import { useStore } from "../store";
import { InitDialog } from "./InitDialog";
import type { Cli } from "../types";

type Props = {
  projectRoot: string;
  hasClaudeMd: boolean;
};

export function NoProjectDecisionPanel({ projectRoot, hasClaudeMd }: Props) {
  const setBrowseMode = useStore((s) => s.setBrowseMode);
  const load = useStore((s) => s.load);

  const [showDialog, setShowDialog] = useState(false);

  function handleBrowse() {
    setBrowseMode(true);
  }

  async function handleInitSuccess(_managerCommand: Cli) {
    setShowDialog(false);
    // Refetch state — the new openspec/ + agents.yaml should now exist.
    await load();
  }

  return (
    <>
      <div className="no-project-panel">
        <h2>No OpenSpec project found</h2>
        <p className="no-project-path muted">
          <code>{projectRoot}</code>
        </p>
        <p>Choose how you want to continue:</p>

        <div className="no-project-actions">
          <button
            className="btn-primary"
            onClick={() => setShowDialog(true)}
            disabled={showDialog}
          >
            Initialize openspec here
          </button>
          <button className="btn-secondary" onClick={handleBrowse} disabled={showDialog}>
            Browse read-only
          </button>
        </div>

        {hasClaudeMd && (
          <p className="no-project-claude-hint">
            This project has <code>CLAUDE.md</code> — ithyno will pick it up as
            agent-facing context once openspec is initialized.
          </p>
        )}
      </div>

      {showDialog && (
        <InitDialog
          dir={projectRoot}
          onSuccess={(cli) => void handleInitSuccess(cli)}
          onCancel={() => setShowDialog(false)}
        />
      )}
    </>
  );
}
