// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { useStore } from "../store";
import { setParallelExecution } from "../api";

/**
 * Settings tab. Landed by add-parallel-execution-config; updated for
 * redesign-skill-namespace-and-dispatch.
 *
 * Exposes the top-level `parallelExecution` boolean from agents.yaml.
 * The Kanban Start button always injects `/ithy-opsx:dispatch <id>`
 * into the terminal — the dispatcher skill reads this flag and either
 * runs workers in the main tree (`false`) or creates a `.worktrees/
 * <id>/` isolated tree (`true`). Per-change `proposal.execution`
 * overrides still win when set.
 */
export function Settings() {
  const parallelExecution = useStore((s) => s.parallelExecution);
  const pushToast = useStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      await setParallelExecution(next);
      pushToast(
        "info",
        next ? "Parallel execution enabled" : "Parallel execution disabled",
      );
      // Store slice updates via the `agents-updated` WS broadcast the server
      // fires after the atomic yaml write; no explicit reload needed here.
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Execution</h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={parallelExecution}
            disabled={busy}
            onChange={(e) => void onToggle(e.target.checked)}
          />
          <span>
            <strong>Parallel execution</strong>
            <p className="muted">
              When on, the dispatcher (<code>/ithy-opsx:dispatch</code>) spawns
              workers inside an isolated worktree under{" "}
              <code>.worktrees/&lt;change&gt;/</code>, so multiple changes can
              run at once. When off, workers run in the main tree — Start
              still injects <code>/ithy-opsx:dispatch &lt;change&gt;</code> into
              the embedded terminal. Per-change{" "}
              <code>proposal.execution</code> overrides always win.
            </p>
          </span>
        </label>
      </section>
    </div>
  );
}
