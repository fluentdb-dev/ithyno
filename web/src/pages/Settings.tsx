// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { setAgmsgConfig, setParallelExecution } from "../api";
import { ThemeToggle } from "../components/ThemeToggle";

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
  const hasAgentsYaml = useStore((s) => s.state?.hasAgentsYaml ?? true);
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

      {!hasAgentsYaml && (
        <div className="info-banner">
          <strong>Embedded terminal is off</strong> — this project has no{" "}
          <code>agents.yaml</code>. Add one at the project root to enable
          agent dispatch and the ithyno terminal panel.
        </div>
      )}

      <section className="settings-section">
        <h3>Appearance</h3>
        <div className="settings-toggle">
          <ThemeToggle />
          <span>
            <strong>Theme</strong>
            <p className="muted">
              Auto follows your OS preference (
              <code>prefers-color-scheme</code>). Light / Dark override the
              system choice for this browser only. Persisted to{" "}
              <code>localStorage["ithyno.theme"]</code>; the embedded terminal
              re-colors live on change.
            </p>
          </span>
        </div>
      </section>

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

      <NewProjectSection disabled={busy} pushToast={pushToast} />
    </div>
  );
}

// New Project form. Collects an absolute parent path + project name,
// then navigates to /onboarding which drives runInit + `openspec init`
// via SSE and switches to the new project when done. The heavy lifting
// lives in web/src/pages/OnboardingProject.tsx (add-new-project-
// onboarding-window).
function NewProjectSection(props: {
  disabled: boolean;
  pushToast: (kind: "info" | "error", msg: string) => void;
}) {
  const { disabled, pushToast } = props;
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");

  const canSubmit =
    !disabled &&
    parent.trim().length > 0 &&
    parent.trim().startsWith("/") &&
    name.trim().length > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    const dir = `${parent.trim().replace(/\/$/, "")}/${name.trim()}`;
    try {
      const q = new URLSearchParams({ target: dir, channel: "browser" });
      window.location.href = `/onboarding?${q.toString()}`;
    } catch (err) {
      pushToast(
        "error",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  return (
    <section className="settings-section">
      <h3>New Project</h3>
      <p className="muted">
        Scaffold a fresh directory with everything ithyno expects and chain
        <code> openspec init </code> so <code>/opsx:*</code> commands are
        ready. Submitting opens a full-screen onboarding page that shows
        each step's progress and lets you switch to the new project on
        completion.
      </p>

      <div className="settings-field">
        <label>
          <span>
            <strong>Parent directory</strong>
            <p className="muted">Absolute path — paste from Finder / Explorer.</p>
          </span>
          <input
            type="text"
            value={parent}
            placeholder="/Users/you/Documents/works"
            disabled={disabled}
            onChange={(e) => setParent(e.target.value)}
          />
        </label>
      </div>

      <div className="settings-field">
        <label>
          <span>
            <strong>Project name</strong>
            <p className="muted">Kebab-case suggested; becomes the target dir name.</p>
          </span>
          <input
            type="text"
            value={name}
            placeholder="my-new-project"
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <div className="settings-actions">
        <button type="button" disabled={!canSubmit} onClick={onSubmit}>
          Create project
        </button>
      </div>
    </section>
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
