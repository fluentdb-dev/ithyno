// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { fetchAgentHooks, setParallelExecution, setTmux, toggleAgentHook, type AgentHookStatus } from "../api";
import type { AgentSkillInfo, AgentSkillStatus, CliStatus } from "../api";
import { ThemeToggle } from "../components/ThemeToggle";
import { PrereqInstallModal } from "../components/PrereqInstallModal";
import { AgmsgConfigModal } from "../components/AgmsgConfigModal";
import { AgentSkillInstallDialog } from "../components/AgentSkillInstallDialog";
import { CommandModal } from "../components/CommandModal";
import { isAbsolutePath } from "../lib/paths";
import { isVsCodeShell, vscodeHostAppName } from "../runtime/shell";
import { isElectronShell } from "../runtime/electron";
import type { AgmsgConfig, Cli, DoctorReport } from "../types";
// Note: the `defaultManager` store slice + localStorage persistence remain
// in place. The Settings-side radio group was removed by
// `remove-default-manager-settings-ui` because it duplicated the Agents
// tab's Manager section with a non-obvious scope difference. InitDialog
// still consults the slice for preselect; a future implicit-set path
// (e.g., remember the last-Init CLI) can wire `setDefaultManager` without
// re-introducing a Settings UI.

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
  const tmux = useStore((s) => s.tmux);
  const agmsg = useStore((s) => s.agmsg);
  const pushToast = useStore((s) => s.pushToast);
  const hasAgentsYaml = useStore((s) => s.state?.hasAgentsYaml ?? true);
  const doctorReport = useStore((s) => s.doctorReport);
  const loadDoctorReport = useStore((s) => s.loadDoctorReport);
  const agentSkills = useStore((s) => s.agentSkills);
  const agentSkillsError = useStore((s) => s.agentSkillsError);
  const loadAgentSkills = useStore((s) => s.loadAgentSkills);
  const [busy, setBusy] = useState(false);
  const [hookStatus, setHookStatus] = useState<AgentHookStatus[]>([]);

  // Fetch the doctor report and agent skill state on mount
  useEffect(() => {
    void loadDoctorReport();
    void loadAgentSkills();
    void fetchAgentHooks().then(setHookStatus).catch(() => undefined);
  }, [loadDoctorReport, loadAgentSkills]);

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

  const onToggleTmux = async (next: boolean) => {
    setBusy(true);
    try {
      await setTmux(next);
      pushToast(
        "info",
        next ? "tmux terminal session wrapping enabled" : "tmux wrapping disabled",
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

      <PrerequisitesSection
        report={doctorReport}
        agentSkills={agentSkills}
        agentSkillsError={agentSkillsError}
        onRefresh={async () => {
          await Promise.all([loadDoctorReport(), loadAgentSkills()]);
        }}
        onRefreshSkills={loadAgentSkills}
        hookStatus={hookStatus}
        onHookChange={async (agentName, enabled, context, hostAppName) => {
          await toggleAgentHook(agentName, enabled, context, hostAppName);
          setHookStatus((items) => items.map((item) => item.agentName === agentName ? { ...item, enabled } : item));
        }}
      />

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

        <label className="settings-toggle" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={tmux}
            disabled={busy}
            onChange={(e) => void onToggleTmux(e.target.checked)}
          />
          <span>
            <strong>Wrap Manager terminal in tmux</strong>
            <p className="muted">
              When enabled (or when <code>agmsg</code> is configured), the Manager's terminal process runs inside a persistent <code>tmux</code> session (<code>tmux new-session -A -s ithyno</code>). Enables session persistence across page reloads and disconnects.
            </p>
          </span>
        </label>
      </section>

      <AgmsgSummarySection agmsg={agmsg} disabled={busy} />

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
    isAbsolutePath(parent.trim()) &&
    name.trim().length > 0;

  const onSubmit = () => {
    if (!canSubmit) return;
    const trimmedParent = parent.trim();
    const sep = trimmedParent.includes("\\") ? "\\" : "/";
    const dir = `${trimmedParent.replace(/[/\\]$/, "")}${sep}${name.trim()}`;
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

/**
 * Summary + "Configure" button that opens the shared `AgmsgConfigModal`.
 * The form itself (Enable/Team/Storage/Save) lives entirely in that
 * modal now — Settings just references it, so New Project's onboarding
 * flow can open the exact same dialog instead of a second copy.
 * (limit-agmsg-install-prompt-triggers)
 */
function AgmsgSummarySection(props: { agmsg: AgmsgConfig | null; disabled: boolean }) {
  const { agmsg, disabled } = props;
  const [open, setOpen] = useState(false);

  return (
    <section className="settings-section">
      <h3>Agmsg (multi-agent messaging)</h3>
      <p className="muted">
        {agmsg ? (
          <>
            Enabled — team <code>{agmsg.team}</code>
          </>
        ) : (
          "Disabled"
        )}
      </p>
      <div className="settings-actions">
        <button type="button" disabled={disabled} onClick={() => setOpen(true)}>
          Configure
        </button>
      </div>
      {open && <AgmsgConfigModal onClose={() => setOpen(false)} />}
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
  agentSkills: AgentSkillInfo[] | null;
  agentSkillsError: string | null;
  onRefresh: () => Promise<void>;
  onRefreshSkills: () => Promise<void>;
  hookStatus: AgentHookStatus[];
  onHookChange: (agentName: string, enabled: boolean, context?: "electron" | "vscode" | "cli", hostAppName?: string) => Promise<void>;
}) {
  const { report, agentSkills, agentSkillsError, onRefresh, onRefreshSkills, hookStatus, onHookChange } = props;
  const notificationContext = isVsCodeShell() ? "vscode" : isElectronShell() ? "electron" : "cli";
  const notificationHostApp = notificationContext === "vscode" ? vscodeHostAppName() : undefined;
  const [installTool, setInstallTool] = useState<"tmux" | "agmsg" | null>(null);
  const [showAlerterCommand, setShowAlerterCommand] = useState(false);
  const [showBurntToastCommand, setShowBurntToastCommand] = useState(false);
  const [skillDialogCli, setSkillDialogCli] = useState<string | null>(null);

  const skillInfoFor = (cli: string): AgentSkillInfo | undefined =>
    agentSkills?.find((s) => s.cli === cli);

  const skillBadge = (state: AgentSkillStatus) => {
    const classes: Record<string, string> = {
      installed: "prereq-ok",
      partial: "prereq-warn",
      "update-available": "prereq-warn",
      conflict: "prereq-warn",
      missing: "prereq-missing",
      unsupported: "prereq-muted",
    };
    const labels: Record<string, string> = {
      installed: "✓ installed",
      partial: "⚠ partial",
      "update-available": "↑ update available",
      conflict: "⚠ conflict",
      missing: "✗ not installed",
      unsupported: "— unsupported",
    };
    return (
      <span className={`prereq-skill-badge ${classes[state] ?? ""}`} title={state}>
        {labels[state] ?? state}
      </span>
    );
  };

  const renderRow = (
    name: string,
    status: CliStatus | undefined,
    installable: "tmux" | "agmsg" | "alerter" | "burntToast" | null,
    hint?: string,
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
          {!status.installed && hint && <div className="prereq-hint muted">{hint}</div>}
        </td>
        <td className="prereq-version">{status.version ?? ""}</td>
        <td className="prereq-path">{status.path ?? ""}</td>
        <td className="prereq-action">
          {installable && !status.installed && (
            <button
              type="button"
              className="prereq-install-btn"
              onClick={() => installable === "alerter" ? setShowAlerterCommand(true) : installable === "burntToast" ? setShowBurntToastCommand(true) : setInstallTool(installable)}
            >
              Install
            </button>
          )}
        </td>
      </tr>
    );
  };

  /** Render an Agent CLI row with skill state badges + Manage skills button. */
  const renderAgentRow = (key: Cli, status: CliStatus | undefined) => {
    const info = skillInfoFor(key);
    const hook = key !== "copilot" ? hookStatus.find((item) => item.command === key && item.supported) : undefined;
    const hookAvailable = key !== "copilot" && ["claude", "codex", "agy"].includes(key) && status?.installed === true;
    const alerterMissing = /Mac/i.test(navigator.platform) && report?.alerter?.installed !== true;
    const unknownSkills = agentSkillsError !== null && agentSkills === null;

    return (
      <tr key={key} className="prereq-row">
        <td className="prereq-name">{key}</td>
        <td className={`prereq-status ${status?.installed ? "prereq-ok" : "prereq-missing"}`}>
          {status ? (status.installed ? "✓" : "✗") : "—"}
        </td>
        <td className="prereq-version">{status?.version ?? ""}</td>
        <td className="prereq-path prereq-skills-cell">
          {unknownSkills ? (
            <span className="prereq-muted" title="Skill state unknown — refresh to retry">
              skills: ?
            </span>
          ) : info ? (
            <span className="prereq-skills-badges">
              <span>OpenSpec: </span>
              {skillBadge(info.openspec.status)}{" "}
              <span>ithyno: </span>
              {skillBadge(info.ithyno.status)}
            </span>
          ) : (
            <span className="prereq-muted">skills: loading…</span>
          )}
        </td>
        <td className="prereq-action">
          {status?.installed && (
            <button
              type="button"
              id={`prereq-manage-skills-${key}`}
              className="prereq-install-btn"
              onClick={() => setSkillDialogCli(key)}
            >
              Manage skills
            </button>
          )}
          {hookAvailable && <button type="button" className="prereq-hook-btn" title={alerterMissing ? "Install alerter for desktop notifications" : hook?.enabled ? "Disable desktop notification" : "Enable desktop notification"} aria-label={alerterMissing ? "Install alerter for desktop notifications" : hook?.enabled ? "Disable desktop notification" : "Enable desktop notification"} onClick={() => alerterMissing ? setShowAlerterCommand(true) : void onHookChange(hook?.agentName ?? key, !hook?.enabled, notificationContext, notificationHostApp)}>{alerterMissing ? "🔔" : hook?.enabled ? "🔔" : "🔕"}</button>}
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
          Skill files can be installed per-CLI using the{" "}
          <strong>Manage skills</strong> button.
        </p>
        {agentSkillsError && (
          <div className="info-banner" role="alert">
            Skill inspection failed: {agentSkillsError}. Skill state may be
            out of date — click Refresh to retry.
          </div>
        )}
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
                  <th>Skills / Path</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {renderRow(
                  "git",
                  report.git,
                  "alerter",
                  report.git.installed === false
                    ? "Required for worktrees and commits. Install: https://git-scm.com/downloads"
                    : undefined,
                )}
                {renderRow(
                  "node",
                  report.node,
                  null,
                  report.node.installed === false
                    ? "Required for New Project / Import (npm, npx). Install: https://nodejs.org"
                    : undefined,
                )}
                {AGENT_CLI_KEYS.map((key) => renderAgentRow(key, report.agents[key]))}
                {(report.alerter || /Mac/i.test(navigator.platform)) && renderRow(
                  "alerter (macOS notifications)",
                  report.alerter ?? { installed: false },
                  "alerter",
                  undefined,
                )}
                {(report.burntToast || /Win/i.test(navigator.platform)) && renderRow(
                  "BurntToast (Windows notifications)",
                  report.burntToast ?? { installed: false },
                  "burntToast",
                  undefined,
                )}
                {renderRow("tmux", report.tmux, "tmux")}
                {renderRow(
                  "agmsg",
                  report.agmsg,
                  "agmsg",
                  report.gitBash?.installed === false ? report.gitBash.error : undefined,
                )}
              </tbody>
            </table>
            <p className="muted prereq-ready">
              <strong>Ready for Manager:</strong>{" "}
              <span className={report.readyForManager ? "prereq-ok" : "prereq-missing"}>
                {report.readyForManager ? "yes" : "no"}
              </span>
            </p>
            <div className="settings-actions">
              <button
                type="button"
                onClick={() => void Promise.all([onRefresh(), onRefreshSkills()])}
              >
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
      {showAlerterCommand && (
        <CommandModal
          title="Install alerter"
          build={() => "brew install vjeantet/tap/alerter"}
          submitLabel="Close"
          onCancel={() => setShowAlerterCommand(false)}
          onSubmit={() => setShowAlerterCommand(false)}
        />
      )}
      {showBurntToastCommand && (
        <CommandModal
          title="Install BurntToast"
          build={() => "Install-Module -Name BurntToast -Scope CurrentUser"}
          submitLabel="Close"
          onCancel={() => setShowBurntToastCommand(false)}
          onSubmit={() => setShowBurntToastCommand(false)}
        />
      )}

      {skillDialogCli && (
        <AgentSkillInstallDialog
          cli={skillDialogCli}
          skillInfo={skillInfoFor(skillDialogCli)}
          cliStatus={report?.agents[skillDialogCli as Cli]}
          onClose={() => setSkillDialogCli(null)}
        />
      )}
    </>
  );
}

// DefaultManagerSection was removed by `remove-default-manager-settings-ui`.
// The Agents tab's Manager section is the sole UI for viewing / editing the
// current project's Manager entry. The `defaultManager` store slice + its
// localStorage persistence remain intact for InitDialog preselect and any
// future implicit-set path.
