// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { useStore } from "../store";
import { setParallelExecution } from "../api";

/**
 * Settings tab. Landed by add-parallel-execution-config.
 *
 * Currently exposes the top-level `parallelExecution` boolean from
 * agents.yaml. Off (default) = Start dispatches via terminal inject
 * (`/opsx:apply <id>`). On = Start spawns a headless agent in a
 * `.worktrees/<id>/` worktree so multiple changes can run in parallel.
 *
 * The Start flow silently follows this flag; per-change
 * `proposal.execution` overrides still win when set.
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
              When on, <code>Start</code> spawns headless agents in isolated
              worktrees under <code>.worktrees/&lt;change&gt;/</code>, so
              multiple changes can run at once. When off, <code>Start</code>{" "}
              injects <code>/opsx:apply &lt;change&gt;</code> into the
              embedded terminal for interactive work. Per-change{" "}
              <code>proposal.execution</code> overrides always win.
            </p>
          </span>
        </label>
      </section>
    </div>
  );
}
