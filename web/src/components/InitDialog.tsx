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
        // Pre-select: defaultManager if installed, else first by priority
        const installed = CLI_PRIORITY.filter((cli) => r.agents[cli].installed);
        if (installed.length > 0) {
          const preferred =
            defaultManager && installed.includes(defaultManager)
              ? defaultManager
              : installed[0];
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
  const readyForManager = report?.readyForManager ?? false;

  async function handleInit() {
    if (!selectedCli || !readyForManager) return;
    setInitializing(true);
    try {
      const result = await initProject({
        dir,
        manager: { command: selectedCli },
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
    <div className="init-dialog-overlay">
      <div className="init-dialog">
        <h3>Initialize Project</h3>
        <p className="muted">
          <code>{dir}</code>
        </p>

        {/* Prerequisites summary */}
        <section className="init-dialog-section">
          <h4>Prerequisites</h4>
          {loading && <p className="muted">Checking…</p>}
          {doctorError && (
            <p className="init-dialog-error">
              Could not check prerequisites: {doctorError}
            </p>
          )}
          {report && (
            <ul className="init-dialog-prereqs">
              {CLI_PRIORITY.map((cli) => {
                const status = report.agents[cli];
                return (
                  <li key={cli} className={status.installed ? "prereq-ok" : "prereq-missing"}>
                    <span className="prereq-icon">{status.installed ? "✓" : "✗"}</span>
                    <span className="prereq-label">{CLI_LABELS[cli]}</span>
                    {status.version && (
                      <span className="prereq-version muted"> ({status.version})</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {report && !readyForManager && (
            <div className="init-dialog-blocked">
              No agent CLI is installed. Install at least one CLI, then try
              again.{" "}
              <a href="/settings" className="init-dialog-link">
                Settings &gt; Prerequisites
              </a>
            </div>
          )}
        </section>

        {/* Manager picker (shown only when ready) */}
        {report && readyForManager && (
          <section className="init-dialog-section">
            <h4>Manager CLI</h4>
            <p className="muted">
              Choose which agent CLI will run as the Manager in this project.
            </p>
            <div className="init-dialog-picker">
              {installedClis.map((cli) => (
                <label key={cli} className="init-dialog-radio">
                  <input
                    type="radio"
                    name="manager-cli"
                    value={cli}
                    checked={selectedCli === cli}
                    disabled={initializing}
                    onChange={() => setSelectedCli(cli)}
                  />
                  <span>{CLI_LABELS[cli]}</span>
                </label>
              ))}
            </div>
          </section>
        )}

        <div className="init-dialog-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={initializing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleInit()}
            disabled={
              loading ||
              initializing ||
              !readyForManager ||
              selectedCli === null
            }
          >
            {initializing ? "Initializing…" : "Initialize"}
          </button>
        </div>
      </div>
    </div>
  );
}
