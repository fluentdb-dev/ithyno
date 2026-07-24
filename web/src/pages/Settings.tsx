// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { installIthyOpsx, setAgmsgConfig, setParallelExecution, uninstallIthyOpsx } from "../api";
import type { CliStatus } from "../api";
import { ThemeToggle } from "../components/ThemeToggle";
import { PrereqInstallModal } from "../components/PrereqInstallModal";
import type { Cli, DoctorReport } from "../types";
import { CLI_PRIORITY } from "../types";

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
  const doctorReport = useStore((s) => s.doctorReport);
  const loadDoctorReport = useStore((s) => s.loadDoctorReport);
  const defaultManager = useStore((s) => s.defaultManager);
  const setDefaultManager = useStore((s) => s.setDefaultManager);
  const [busy, setBusy] = useState(false);

  // Fetch the doctor report on mount
  useEffect(() => {
    void loadDoctorReport();
  }, [loadDoctorReport]);

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

      <PrerequisitesSection report={doctorReport} onRefresh={loadDoctorReport} />

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

      <DefaultManagerSection
        defaultManager={defaultManager}
        onSet={setDefaultManager}
        disabled={busy}
        report={doctorReport}
      />

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

// ---------------------------------------------------------------------------
// Prerequisites section (add-doctor-and-installer)
// ---------------------------------------------------------------------------

const AGENT_CLI_KEYS: Cli[] = [
  "claude",
  "codex",
  "agy",
  "copilot",
  "gemini",
  "opencode",
  "cursor",
];

function PrerequisitesSection(props: {
  report: DoctorReport | null;
  onRefresh: () => Promise<void>;
}) {
  const { report, onRefresh } = props;
  const [installTool, setInstallTool] = useState<"tmux" | "agmsg" | null>(null);

  const renderRow = (
    name: string,
    status: CliStatus | undefined,
    installable: "tmux" | "agmsg" | null,
  ) => {
    if (!status) {
      return (
        <tr key={name} className="prereq-row">
          <td className="prereq-name">{name}</td>
          <td className="prereq-status prereq-missing">—</td>
          <td className="prereq-version"></td>
          <td className="prereq-path"></td>
          <td className="prereq-action"></td>
        </tr>
      );
    }
    return (
      <tr key={name} className="prereq-row">
        <td className="prereq-name">{name}</td>
        <td className={`prereq-status ${status.installed ? "prereq-ok" : "prereq-missing"}`}>
          {status.installed ? "✓" : "✗"}
        </td>
        <td className="prereq-version">{status.version ?? ""}</td>
        <td className="prereq-path">{status.path ?? ""}</td>
        <td className="prereq-action">
          {installable && !status.installed && (
            <button
              type="button"
              className="prereq-install-btn"
              onClick={() => setInstallTool(installable)}
            >
              Install
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      <section className="settings-section prereq-section">
        <h3>Prerequisites</h3>
        <p className="muted">
          Required CLIs and tools. Agent CLIs must be installed manually (auth is
          vendor-specific). tmux and agmsg can be installed from this panel.
        </p>
        {!report ? (
          <p className="muted">Checking prerequisites…</p>
        ) : (
          <>
            <table className="prereq-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Version</th>
                  <th>Path</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {AGENT_CLI_KEYS.map((key) =>
                  renderRow(key, report.agents[key], null),
                )}
                {renderRow("tmux", report.tmux, "tmux")}
                {renderRow("agmsg", report.agmsg, "agmsg")}
              </tbody>
            </table>
            <p className="muted prereq-ready">
              <strong>Ready for Manager:</strong>{" "}
              <span className={report.readyForManager ? "prereq-ok" : "prereq-missing"}>
                {report.readyForManager ? "yes" : "no"}
              </span>
            </p>
            <IthyOpsxRow report={report} onRefresh={onRefresh} />
            <div className="settings-actions">
              <button type="button" onClick={() => void onRefresh()}>
                Refresh
              </button>
            </div>
          </>
        )}
      </section>

      {installTool && (
        <PrereqInstallModal
          tool={installTool}
          onClose={(didInstall) => {
            setInstallTool(null);
            if (didInstall) void onRefresh();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ithy-opsx skills install row (unify-ithyno-slash-command-surface)
// ---------------------------------------------------------------------------

function IthyOpsxRow(props: {
  report: DoctorReport;
  onRefresh: () => Promise<void>;
}) {
  const { report, onRefresh } = props;
  const pushToast = useStore((s) => s.pushToast);
  const [busy, setBusy] = useState<"install" | "uninstall" | null>(null);
  const [confirmingUninstall, setConfirmingUninstall] = useState(false);

  const io = report.ithyOpsx;
  const installed = io.installed;
  const modified = io.userModifiedFiles.length;

  async function handleInstall(force: boolean) {
    setBusy("install");
    try {
      const rep = await installIthyOpsx(force);
      const total = rep.installed + rep.updated;
      pushToast(
        "info",
        total > 0
          ? `Installed ${rep.installed} new + updated ${rep.updated} ithy-opsx file(s)`
          : `ithy-opsx up to date${rep.userModified > 0 ? ` (${rep.userModified} user-modified preserved)` : ""}`,
      );
      await onRefresh();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleUninstall() {
    setBusy("uninstall");
    setConfirmingUninstall(false);
    try {
      const rep = await uninstallIthyOpsx();
      pushToast("info", `Removed ${rep.removed} ithy-opsx file(s) from ~/.claude`);
      await onRefresh();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ithy-opsx-row">
      <div className="ithy-opsx-status">
        <span className={`prereq-status ${installed ? "prereq-ok" : "prereq-missing"}`}>
          {installed ? "✓" : "○"}
        </span>
        <strong>ithy-opsx skills</strong>
        <span className="muted">
          {installed
            ? ` — installed v${io.installedVersion} (${io.commandCount} commands, ${io.skillCount} skills)`
            : ` — not installed (bundle v${io.bundledVersion}, ${io.commandCount} commands, ${io.skillCount} skills)`}
        </span>
        {modified > 0 && (
          <span className="ithy-opsx-modified" title={io.userModifiedFiles.join("\n")}>
            {" ⚠ "}
            {modified} user-modified
          </span>
        )}
        {io.installError && (
          <span className="prereq-missing"> — error: {io.installError}</span>
        )}
      </div>
      <div className="ithy-opsx-actions">
        {!installed && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleInstall(false)}
          >
            {busy === "install" ? "Installing…" : "Install"}
          </button>
        )}
        {installed && (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleInstall(true)}
            >
              {busy === "install" ? "Reinstalling…" : "Reinstall"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmingUninstall(true)}
            >
              Uninstall
            </button>
          </>
        )}
      </div>
      {confirmingUninstall && (
        <div className="modal-backdrop" onClick={() => setConfirmingUninstall(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Uninstall ithy-opsx skills</h3>
            <p className="modal-subtitle">
              Removes {io.commandCount + io.skillCount} file(s) recorded in the manifest
              from <code>~/.claude/</code>. Other files (e.g. agmsg, openspec) are preserved.
            </p>
            <div className="modal-actions">
              <button type="button" onClick={() => setConfirmingUninstall(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={busy !== null}
                onClick={() => void handleUninstall()}
              >
                {busy === "uninstall" ? "Removing…" : "Uninstall"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Human-readable labels for each CLI. Mirrors InitDialog's CLI_LABELS. */
const CLI_LABELS_SETTINGS: Record<Cli, string> = {
  claude: "Claude (claude)",
  codex: "Codex (codex)",
  agy: "Agy (agy)",
  copilot: "GitHub Copilot (copilot)",
  gemini: "Gemini (gemini)",
  opencode: "OpenCode (opencode)",
  cursor: "Cursor (cursor)",
  antigravity: "Antigravity (antigravity)",
};

/**
 * Default Manager preference section (expand-init-to-scaffold-agents).
 * Reads the doctor report from the store (already fetched by the parent
 * Settings page via loadDoctorReport). Radio group limited to installed CLIs.
 */
function DefaultManagerSection(props: {
  defaultManager: Cli | null;
  onSet: (cli: Cli) => void;
  disabled: boolean;
  report: DoctorReport | null;
}) {
  const { defaultManager, onSet, disabled, report } = props;

  const installed = report
    ? CLI_PRIORITY.filter((cli) => report.agents[cli]?.installed)
    : [];

  const effective: Cli | null =
    defaultManager && installed.includes(defaultManager)
      ? defaultManager
      : installed[0] ?? null;

  return (
    <section className="settings-section">
      <h3>Default Manager</h3>
      <p className="muted">
        The agent CLI used as Manager when you initialize a new project. Only
        installed CLIs are shown. Persisted to{" "}
        <code>localStorage["ithyno.defaultManager"]</code>.
      </p>

      {!report && <p className="muted">Checking installed CLIs…</p>}

      {report && installed.length === 0 && (
        <p className="muted">
          No agent CLI detected. Install one (e.g.{" "}
          <code>npm i -g @anthropic-ai/claude-code</code>) and reload.
        </p>
      )}

      {installed.length > 0 && (
        <div className="settings-radio-group">
          {installed.map((cli) => (
            <label key={cli} className="settings-radio">
              <input
                type="radio"
                name="default-manager"
                value={cli}
                checked={effective === cli}
                disabled={disabled}
                onChange={() => onSet(cli)}
              />
              <span>{CLI_LABELS_SETTINGS[cli]}</span>
              {effective === cli && !defaultManager && (
                <span className="muted"> (auto)</span>
              )}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
