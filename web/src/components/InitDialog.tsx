// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * InitDialog — shared component for the Init entry points.
 *
 * Fetches /api/doctor on mount, renders a compact Prerequisites summary
 * (installed / missing per CLI), and — when readyForManager is true — shows a
 * Manager picker limited to installed CLIs.
 *
 * When the user clicks "Initialize", posts /api/init with
 * { dir, manager: { command } } and calls onSuccess with the managerCommand.
 *
 * Used by:
 *   - <NoProjectDecisionPanel /> ("Initialize openspec here" button)
 *   - <OnboardingProject /> (new-project onboarding flow)
 *
 * Landed by expand-init-to-scaffold-agents.
 */
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { fetchDoctor, initProject } from "../api";
import type { Cli, DoctorReport } from "../types";
import { CLI_PRIORITY } from "../types";

export type InitDialogProps = {
  /** Absolute path of the directory to initialize. */
  dir: string;
  /** Additional POST /api/init fields (e.g. autoCreateDir, autoGitInit). */
  initOptions?: {
    force?: boolean;
    skipGitignore?: boolean;
    autoCreateDir?: boolean;
    autoGitInit?: boolean;
  };
  /** Called after a successful init with the chosen managerCommand. */
  onSuccess: (managerCommand: Cli) => void;
  /** Called when the user cancels or closes the dialog. */
  onCancel: () => void;
};

/** Human-readable labels for each CLI. */
const CLI_LABELS: Record<Cli, string> = {
  claude: "Claude (claude)",
  codex: "Codex (codex)",
  agy: "Agy (agy)",
  copilot: "GitHub Copilot (copilot)",
  gemini: "Gemini (gemini)",
  opencode: "OpenCode (opencode)",
  cursor: "Cursor (cursor)",
  antigravity: "Antigravity (antigravity)",
};

/** Manager-eligible CLIs — the picker offers only these. The rest
 *  (codex/copilot/gemini/cursor/antigravity) are still valid as
 *  agmsg-spawned WORKERS but have not been validated as Manager.
 *  See `server/sync/pty.ts` MANAGER_STARTUP_STRATEGIES: each CLI here
 *  needs a startup strategy AND its own dispatch skill surface to run
 *  the workflow. */
const MANAGER_VERIFIED: readonly Cli[] = ["claude"];
const MANAGER_UNVERIFIED: readonly Cli[] = ["opencode", "agy"];
const MANAGER_CANDIDATES: readonly Cli[] = [
  ...MANAGER_VERIFIED,
  ...MANAGER_UNVERIFIED,
];
function isManagerCandidate(cli: Cli): boolean {
  return MANAGER_CANDIDATES.includes(cli);
}
function isManagerUnverified(cli: Cli): boolean {
  return MANAGER_UNVERIFIED.includes(cli);
}

export function InitDialog({
  dir,
  initOptions = {},
  onSuccess,
  onCancel,
}: InitDialogProps) {
  const defaultManager = useStore((s) => s.defaultManager);
  const pushToast = useStore((s) => s.pushToast);

  const [report, setReport] = useState<DoctorReport | null>(null);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCli, setSelectedCli] = useState<Cli | null>(null);
  const [initializing, setInitializing] = useState(false);

  // Fetch doctor report on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDoctor()
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        // Pre-select: defaultManager if installed AND Manager-eligible,
        // else first eligible-installed by priority. Manager-eligible ⊂
        // installed — see MANAGER_CANDIDATES above.
        const eligible = CLI_PRIORITY.filter(
          (cli) => r.agents[cli].installed && isManagerCandidate(cli),
        );
        if (eligible.length > 0) {
          const preferred =
            defaultManager &&
            eligible.includes(defaultManager) &&
            isManagerCandidate(defaultManager)
              ? defaultManager
              : eligible[0];
          setSelectedCli(preferred);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setDoctorError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [defaultManager]);

  const installedClis = report
    ? CLI_PRIORITY.filter((cli) => report.agents[cli].installed)
    : [];
  /** Manager picker: only claude / codex / agy show up (of those,
   *  only ones actually installed on the host). Non-candidates still
   *  appear in the Prerequisites list as reachable CLIs — they're just
   *  not usable as Manager yet. */
  const managerChoices = installedClis.filter(isManagerCandidate);
  const readyForManager = managerChoices.length > 0;

  async function handleInit() {
    if (!selectedCli || !readyForManager) return;
    setInitializing(true);
    try {
      // agentsYamlOnly: true — this dialog only exists as the
      // Prerequisites/Manager-picker step ahead of OnboardingProject's
      // own SSE-streamed run (see its useEffect), which is what
      // actually does scaffold + `npm install` + `openspec init` with
      // live progress. Without this flag, that whole (slow, network-
      // bound) chain ran a second time here first — synchronously,
      // hidden behind "Initializing…" — before the log screen even
      // appeared, so pressing Continue looked frozen and the
      // subsequent "live" log was really just a redundant replay.
      const result = await initProject({
        dir,
        manager: { command: selectedCli },
        agentsYamlOnly: true,
        ...initOptions,
      });
      if (!result.ok) {
        pushToast(
          "error",
          result.reason ?? `Initialization failed`,
        );
        return;
      }
      const chosenCli = result.managerCommand ?? selectedCli;
      onSuccess(chosenCli);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setInitializing(false);
    }
  }

  return (
    <div className="onboarding-card">
      <h2>Initialize Project</h2>
      <p className="onboarding-target">
        <code>{dir}</code>
      </p>

      {/* Prerequisites */}
      <section className="onboarding-section">
        <h3 className="onboarding-section-title">Prerequisites</h3>
        {loading && <p className="muted">Checking installed CLIs…</p>}
        {doctorError && (
          <div className="onboarding-error">
            <strong>Error:</strong> Could not check prerequisites: {doctorError}
          </div>
        )}
        {report && (
          <ul className="onboarding-prereqs">
            {CLI_PRIORITY.map((cli) => {
              const status = report.agents[cli];
              return (
                <li
                  key={cli}
                  className={`onboarding-prereq ${status.installed ? "prereq-ok" : "prereq-missing"}`}
                >
                  <span className="onboarding-icon">{status.installed ? "✓" : "○"}</span>
                  <span className="onboarding-label">{CLI_LABELS[cli]}</span>
                  {status.version && (
                    <span className="muted"> ({status.version})</span>
                  )}
                </li>
              );
            })}
            {/* Optional tooling: tmux + agmsg. Status only — neither
                belongs to the Manager-CLI gating this dialog exists
                for. Both are installable from the onboarding screen's
                own Agmsg section after Continue (limit-agmsg-install-
                prompt-triggers), or from Settings > Prerequisites. */}
            {(["tmux", "agmsg"] as const).map((tool) => {
              const status = report[tool];
              return (
                <li
                  key={tool}
                  className={`onboarding-prereq ${status.installed ? "prereq-ok" : "prereq-missing"}`}
                >
                  <span className="onboarding-icon">{status.installed ? "✓" : "○"}</span>
                  <span className="onboarding-label">
                    {tool} <span className="muted">(optional — set up after Continue)</span>
                  </span>
                  {status.version && (
                    <span className="muted"> ({status.version})</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {report && !readyForManager && (
          <div className="onboarding-error">
            <strong>No agent CLI installed.</strong> Install at least one CLI,
            then reload.{" "}
            <a href="/settings" className="onboarding-link">Settings › Prerequisites</a>
          </div>
        )}
      </section>

      {/* Manager picker */}
      {report && readyForManager && (
        <section className="onboarding-section">
          <h3 className="onboarding-section-title">Manager CLI</h3>
          <p className="muted onboarding-section-sub">
            Which agent CLI runs as the Manager in this project.
          </p>
          <div className="onboarding-picker">
            {managerChoices.map((cli) => (
              <label
                key={cli}
                className={`onboarding-picker-item ${selectedCli === cli ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="manager-cli"
                  value={cli}
                  checked={selectedCli === cli}
                  disabled={initializing}
                  onChange={() => setSelectedCli(cli)}
                />
                <span>
                  {CLI_LABELS[cli]}
                  {isManagerUnverified(cli) && (
                    <span className="muted"> (unverified)</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="onboarding-actions">
        <button
          type="button"
          onClick={onCancel}
          disabled={initializing}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleInit()}
          disabled={
            loading ||
            initializing ||
            !readyForManager ||
            selectedCli === null
          }
        >
          {initializing ? "Initializing…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
