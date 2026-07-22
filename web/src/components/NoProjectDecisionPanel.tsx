// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Three-branch decision panel shown when the user opens a folder that has no
 * openspec/ directory. Landed by unify-open-project-3-branch.
 *
 * Actions:
 *   • Initialize openspec here → POST /api/init + refetch state
 *   • Cancel → Electron: re-open Open Project dialog; browser: show helper
 *   • Browse read-only → setBrowseMode(true) → renders <ReadOnlyBrowse />
 */
import { useState } from "react";
import { useStore } from "../store";
import { getSessionToken } from "../runtime";
import { isElectronShell } from "../runtime/electron";

type Props = {
  projectRoot: string;
  hasClaudeMd: boolean;
};

export function NoProjectDecisionPanel({ projectRoot, hasClaudeMd }: Props) {
  const setBrowseMode = useStore((s) => s.setBrowseMode);
  const load = useStore((s) => s.load);
  const pushToast = useStore((s) => s.pushToast);

  const [initializing, setInitializing] = useState(false);
  const [cancelClicked, setCancelClicked] = useState(false);

  async function handleInitialize() {
    setInitializing(true);
    try {
      const token = getSessionToken();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["X-Session-Token"] = token;
      const res = await fetch("/api/init", {
        method: "POST",
        headers,
        body: JSON.stringify({ dir: projectRoot }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { reason?: string; error?: string };
        pushToast("error", body.reason ?? body.error ?? `Initialization failed (HTTP ${res.status})`);
        return;
      }
      // Refetch state — the new openspec/ directory should now exist.
      await load();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setInitializing(false);
    }
  }

  function handleCancel() {
    if (isElectronShell()) {
      // Trigger the Electron File → Open Project dialog via IPC.
      const w = window as unknown as { ithyno?: { openProject?: () => void } };
      if (w.ithyno?.openProject) {
        w.ithyno.openProject();
      }
    } else {
      // Browser mode: no re-open dialog. Show the helper.
      setCancelClicked(true);
    }
  }

  function handleBrowse() {
    setBrowseMode(true);
  }

  return (
    <div className="no-project-panel">
      <h2>No OpenSpec project found</h2>
      <p className="no-project-path muted">
        <code>{projectRoot}</code>
      </p>
      <p>Choose how you want to continue:</p>

      <div className="no-project-actions">
        <button
          className="btn-primary"
          onClick={() => void handleInitialize()}
          disabled={initializing}
        >
          {initializing ? "Initializing…" : "Initialize openspec here"}
        </button>
        <button className="btn-secondary" onClick={handleCancel} disabled={initializing}>
          Cancel
        </button>
        <button className="btn-secondary" onClick={handleBrowse} disabled={initializing}>
          Browse read-only
        </button>
      </div>

      {hasClaudeMd && (
        <p className="no-project-claude-hint">
          This project has <code>CLAUDE.md</code> — ithyno will pick it up as
          agent-facing context once openspec is initialized.
        </p>
      )}

      {cancelClicked && !isElectronShell() && (
        <div className="no-project-cancel-hint">
          <p>
            To open a different project, restart the server with{" "}
            <code>ithyno --dir &lt;path&gt;</code>.
          </p>
        </div>
      )}
    </div>
  );
}
