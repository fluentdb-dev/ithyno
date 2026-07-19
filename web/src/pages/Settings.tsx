// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { useStore } from "../store";
import {
  initProject,
  setAgmsgConfig,
  setParallelExecution,
  type InitProjectResult,
} from "../api";

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

      <NewProjectSection disabled={busy} pushToast={pushToast} />
    </div>
  );
}

// add-init-http-endpoint: minimal "New Project" form. The browser can't
// reliably open a native folder picker, so we accept an absolute parent
// path + project name and let the user paste from Finder / Explorer.
// Electron and VS Code follow-up proposes will layer native pickers on top.
function NewProjectSection(props: {
  disabled: boolean;
  pushToast: (kind: "info" | "error", msg: string) => void;
}) {
  const { disabled, pushToast } = props;
  const [parent, setParent] = useState("");
  const [name, setName] = useState("");
  const [force, setForce] = useState(false);
  const [skipGitignore, setSkipGitignore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InitProjectResult | null>(null);

  const canSubmit =
    !disabled &&
    !busy &&
    parent.trim().length > 0 &&
    parent.trim().startsWith("/") &&
    name.trim().length > 0;

  const onSubmit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const dir = `${parent.trim().replace(/\/$/, "")}/${name.trim()}`;
      const res = await initProject({
        dir,
        force,
        skipGitignore,
        autoCreateDir: true,
        autoGitInit: true,
      });
      setResult(res);
      if (res.ok) {
        pushToast(
          "info",
          `Project scaffolded at ${res.target ?? dir}${
            res.gitInitPerformed ? " (git init ran)" : ""
          }`,
        );
      } else {
        pushToast("error", res.reason ?? "init failed");
      }
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h3>New Project</h3>
      <p className="muted">
        Scaffold a fresh directory with everything ithyno expects (CLAUDE.md,
        the openspec-flow skill, agents.yaml.example, docs/, .gitignore). The
        parent path plus project name are combined into an absolute target;
        the directory is created and{" "}
        <code>git init</code> runs if the target is not already a git repo.
        You'll still need to run <code>openspec init</code> afterward to
        install the <code>/opsx:*</code> commands (the Next Steps panel below
        shows the exact command).
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
            disabled={disabled || busy}
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
            disabled={disabled || busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={force}
          disabled={disabled || busy}
          onChange={(e) => setForce(e.target.checked)}
        />
        <span>
          <strong>Overwrite existing files</strong>
          <p className="muted">
            Skipped by default; enable to force-copy templates over existing
            files at the target.
          </p>
        </span>
      </label>

      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={skipGitignore}
          disabled={disabled || busy}
          onChange={(e) => setSkipGitignore(e.target.checked)}
        />
        <span>
          <strong>Skip .gitignore</strong>
          <p className="muted">Do not append <code>.worktrees/</code> to <code>.gitignore</code>.</p>
        </span>
      </label>

      <div className="settings-actions">
        <button type="button" disabled={!canSubmit} onClick={() => void onSubmit()}>
          {busy ? "Scaffolding…" : "Create project"}
        </button>
      </div>

      {result && result.ok && (
        <div className="settings-result">
          <h4>Result</h4>
          <p className="muted">Target: <code>{result.target}</code></p>
          <ul className="settings-actions-list">
            {(result.actions ?? []).map((a) => (
              <li key={a.path}>
                <code>{a.action}</code>: {a.path}
              </li>
            ))}
            <li>
              <code>gitignore</code>: {result.gitignoreResult}
            </li>
            {result.gitInitPerformed && (
              <li><code>git init</code> ran on the target</li>
            )}
          </ul>
          {result.openspecMissing && (
            <div className="settings-next-steps">
              <p><strong>Next steps</strong></p>
              <pre><code>npx -y -p @fission-ai/openspec@latest openspec init {result.target} --tools claude</code></pre>
              <p className="muted">
                Then re-launch ithyno pointed at the new directory.
              </p>
            </div>
          )}
        </div>
      )}
      {result && !result.ok && (
        <div className="settings-result">
          <h4>Failed</h4>
          <p className="muted"><code>{result.reason}</code></p>
        </div>
      )}
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
