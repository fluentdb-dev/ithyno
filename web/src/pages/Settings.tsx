// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { setAgmsgConfig, setParallelExecution } from "../api";

/**
 * Settings tab. Landed by add-parallel-execution-config; updated for
 * redesign-skill-namespace-and-dispatch; extended by add-agmsg-config-write
 * with an Agmsg section wired to `POST /api/config/agmsg`.
 *
 * Exposes user-editable top-level fields in agents.yaml:
 *   - parallelExecution (boolean toggle) — routing decision the
 *     dispatcher reads.
 *   - agmsg block ({ team, storage? }) — enables the tmux+agmsg
 *     multi-agent flavor. Absent block = feature disabled.
 */
export function Settings() {
  const parallelExecution = useStore((s) => s.parallelExecution);
  const agmsg = useStore((s) => s.agmsg);
  const pushToast = useStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);

  const onToggleParallel = async (next: boolean) => {
    setBusy(true);
    try {
      await setParallelExecution(next);
      pushToast(
        "info",
        next ? "Parallel execution enabled" : "Parallel execution disabled",
      );
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
            onChange={(e) => void onToggleParallel(e.target.checked)}
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

      <AgmsgSection storeAgmsg={agmsg} disabled={busy} pushToast={pushToast} />
    </div>
  );
}

type AgmsgConfig = { team: string; storage?: string };

function AgmsgSection(props: {
  storeAgmsg: AgmsgConfig | null;
  disabled: boolean;
  pushToast: (kind: "info" | "error", msg: string) => void;
}) {
  const { storeAgmsg, disabled, pushToast } = props;

  const [enabled, setEnabled] = useState<boolean>(storeAgmsg !== null);
  const [team, setTeam] = useState<string>(storeAgmsg?.team ?? "");
  const [storage, setStorage] = useState<string>(storeAgmsg?.storage ?? "");
  const [busy, setBusy] = useState(false);

  // Sync from store when the WS broadcast lands (after a save, or an
  // external agents.yaml edit).
  useEffect(() => {
    setEnabled(storeAgmsg !== null);
    setTeam(storeAgmsg?.team ?? "");
    setStorage(storeAgmsg?.storage ?? "");
  }, [storeAgmsg]);

  const dirty =
    enabled !== (storeAgmsg !== null) ||
    (enabled && team !== (storeAgmsg?.team ?? "")) ||
    (enabled && (storage || "") !== (storeAgmsg?.storage ?? ""));

  const canSave =
    dirty && !disabled && !busy && (!enabled || team.trim().length > 0);

  const onSave = async () => {
    setBusy(true);
    try {
      if (enabled) {
        await setAgmsgConfig({
          enabled: true,
          team: team.trim(),
          ...(storage.trim() ? { storage: storage.trim() } : {}),
        });
        pushToast("info", "agmsg block saved");
      } else {
        await setAgmsgConfig({ enabled: false });
        pushToast("info", "agmsg block removed");
      }
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h3>Agmsg (multi-agent messaging)</h3>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled || busy}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <strong>Enable</strong>
          <p className="muted">
            When on, the embedded Terminal panel wraps its startup in{" "}
            <code>tmux new-session</code> and the dispatcher routes{" "}
            <code>mode: live-shell</code> workers through{" "}
            <code>/agmsg spawn</code> instead of{" "}
            <code>-p</code> subprocess / Task tool. Requires the agmsg plugin
            installed locally (
            <code>/plugin marketplace add fujibee/agmsg</code>).
          </p>
        </span>
      </label>

      <div className="settings-field">
        <label>
          <span>
            <strong>Team name</strong>
            <p className="muted">Required when enabled. Names the agmsg team room.</p>
          </span>
          <input
            type="text"
            value={team}
            placeholder="openspec-ui"
            disabled={disabled || busy || !enabled}
            onChange={(e) => setTeam(e.target.value)}
          />
        </label>
      </div>

      <div className="settings-field">
        <label>
          <span>
            <strong>Storage path</strong>
            <p className="muted">
              Optional. Path to the SQLite messages DB. When empty, agmsg's
              default (<code>~/.agents/skills/agmsg/db/messages.db</code>) is
              used.
            </p>
          </span>
          <input
            type="text"
            value={storage}
            placeholder=".worktrees/.agmsg.sqlite"
            disabled={disabled || busy || !enabled}
            onChange={(e) => setStorage(e.target.value)}
          />
        </label>
      </div>

      <div className="settings-actions">
        <button type="button" disabled={!canSave} onClick={() => void onSave()}>
          {busy ? "Saving…" : "Save agmsg config"}
        </button>
      </div>
    </section>
  );
}
