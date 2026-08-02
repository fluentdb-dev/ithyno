// SPDX-License-Identifier: GPL-3.0-or-later
// Shared onboarding page consumed by Electron (child BrowserWindow),
// browser (React Router navigate), and VS Code (webview panel). Reads
// `target` + optional `channel` from query, opens POST /api/init/stream
// via `fetch`, parses SSE frames, and drives step + log UI.
// Landed by add-new-project-onboarding-window.
//
// Extended by expand-init-to-scaffold-agents: before starting the onboarding
// chain, renders <InitDialog /> so the user can review Prerequisites and pick
// a Manager CLI. The chosen CLI is forwarded to POST /api/init/stream via
// X-Manager-Command header (or embedded in body once the SSE endpoint grows
// manager support). For now, after the SSE chain completes, we POST /api/init
// with the chosen manager to write agents.yaml.
//
// Extended by limit-agmsg-install-prompt-triggers: once the chain
// completes (isComplete), an optional "Agmsg" section offers Install
// (PrereqInstallModal) + Configure (AgmsgConfigModal) — deliberately
// placed AFTER Manager CLI selection and the scaffold/openspec-init
// steps, not alongside the Prerequisites list in InitDialog. agmsg is
// unrelated to whether a Manager CLI can run at all, so it doesn't
// belong in that gating step.
import { useEffect, useMemo, useRef, useState } from "react";
import { getSessionToken } from "../runtime";
import {
  closeOnboarding,
  detectChannel,
  openProject,
  type OnboardingChannel,
} from "../lib/onboardingChannel";
import { InitDialog } from "../components/InitDialog";
import { PrereqInstallModal } from "../components/PrereqInstallModal";
import { AgmsgConfigModal } from "../components/AgmsgConfigModal";
import { fetchDoctor, initProject } from "../api";
import { isAbsolutePath } from "../lib/paths";
import type { Cli, DoctorReport } from "../types";

type Step = "prereq" | "scaffold" | "openspec-init" | "agents-yaml";
type StepStatus = "pending" | "in-progress" | "done" | "failed";
type ChainEvent =
  | { type: "step-start"; step: "scaffold" | "openspec-init" }
  | {
      type: "log";
      step: "scaffold" | "openspec-init";
      line: string;
      stream: "stdout" | "stderr";
    }
  | { type: "step-done"; step: "scaffold" | "openspec-init" }
  | { type: "complete"; target: string }
  | { type: "error"; step: "scaffold" | "openspec-init"; message: string };

const STEP_LABELS: Record<Step, string> = {
  prereq: "Check prerequisites",
  scaffold: "Scaffold ithyno files",
  "openspec-init": "Install OpenSpec",
  "agents-yaml": "Write agents.yaml",
};

const MAX_LOG_LINES = 500;

interface LogLine {
  step: "scaffold" | "openspec-init";
  line: string;
  stream: "stdout" | "stderr";
  id: number;
}

function icon(status: StepStatus): string {
  switch (status) {
    case "pending":
      return "○";
    case "in-progress":
      return "⏵";
    case "done":
      return "✓";
    case "failed":
      return "✗";
  }
}

export function OnboardingProject() {
  const [target, channelParam] = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return [p.get("target") ?? "", p.get("channel") ?? null];
  }, []);
  const channel: OnboardingChannel = useMemo(() => detectChannel(), []);

  // Dialog phase: show InitDialog first, then run the chain.
  const [dialogPhase, setDialogPhase] = useState<"dialog" | "running" | "done">("dialog");
  const [chosenCli, setChosenCli] = useState<Cli | null>(null);

  const [status, setStatus] = useState<Record<Step, StepStatus>>({
    prereq: "pending",
    scaffold: "pending",
    "openspec-init": "pending",
    "agents-yaml": "pending",
  });
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const logIdRef = useRef(0);
  const logPaneRef = useRef<HTMLDivElement | null>(null);

  // Agmsg setup (optional) — only relevant once the main chain is done.
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null);
  const [installTool, setInstallTool] = useState<"agmsg" | null>(null);
  const [showAgmsgConfig, setShowAgmsgConfig] = useState(false);

  const targetValid = target.length > 0 && isAbsolutePath(target);

  // Run the onboarding chain after the dialog is dismissed with a chosen CLI.
  useEffect(() => {
    if (dialogPhase !== "running" || !targetValid || chosenCli === null) return;
    let cancelled = false;

    const appendEvent = (e: ChainEvent) => {
      if (cancelled) return;
      if (e.type === "step-start") {
        setStatus((s) => ({ ...s, [e.step]: "in-progress" }));
      } else if (e.type === "step-done") {
        setStatus((s) => ({ ...s, [e.step]: "done" }));
      } else if (e.type === "log") {
        setLogs((prev) => {
          const next = [
            ...prev,
            {
              step: e.step,
              line: e.line,
              stream: e.stream,
              id: ++logIdRef.current,
            },
          ];
          return next.length > MAX_LOG_LINES
            ? next.slice(next.length - MAX_LOG_LINES)
            : next;
        });
      } else if (e.type === "complete") {
        setIsComplete(true);
      } else if (e.type === "error") {
        setStatus((s) => ({ ...s, [e.step]: "failed" }));
        setErrorMessage(e.message);
      }
    };

    const run = async () => {
      // Local flag: set by the SSE error handler so agents-yaml write is
      // skipped when the chain errored. Using a closure-local boolean
      // rather than reading errorMessage state avoids adding errorMessage
      // to the dependency array (which would re-run the effect on every
      // error and restart the SSE chain). (F1 fix — expand-init-to-scaffold-agents rework r2)
      let sseErrored = false;

      // Mark prereq step done (already checked in InitDialog).
      setStatus((s) => ({ ...s, prereq: "done" }));

      const token = getSessionToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };
      if (token) headers["x-session-token"] = token;

      try {
        const res = await fetch("/api/init/stream", {
          method: "POST",
          headers,
          body: JSON.stringify({
            dir: target,
            autoCreateDir: true,
            autoGitInit: true,
            // Forward the picked Manager so the SSE-driven
            // `openspec init --tools <t>` scaffolds the AGENTS.md
            // the chosen CLI reads (e.g. antigravity for agy).
            // Without this the scaffold was always "claude" and
            // non-Claude Managers had no AGENTS.md to consume.
            manager: { command: chosenCli },
          }),
        });
        if (!res.ok || !res.body) {
          setErrorMessage(
            `Server returned ${res.status} — could not start onboarding.`,
          );
          setStatus((s) => ({ ...s, scaffold: "failed" }));
          sseErrored = true;
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split(/\n\n/);
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const evt = JSON.parse(payload) as ChainEvent;
              // Track SSE error before delegating to appendEvent so
              // the agents-yaml guard below sees the flag synchronously.
              if (evt.type === "error") sseErrored = true;
              appendEvent(evt);
            } catch {
              /* skip malformed frame */
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        sseErrored = true;
        setConnectionLost(true);
        setStatus((s) => {
          const next = { ...s };
          for (const step of ["scaffold", "openspec-init"] as const) {
            if (next[step] === "in-progress") next[step] = "failed";
          }
          return next;
        });
        setErrorMessage(
          err instanceof Error ? err.message : "Connection lost",
        );
        return;
      }

      if (cancelled) return;

      // SSE chain complete — write agents.yaml via POST /api/init with
      // agentsYamlOnly: true. This skips runInit so openspec/ is not
      // re-initialized; only the doctor gate + writeAgentsYaml run.
      // (F2 fix — expand-init-to-scaffold-agents rework r2)
      if (!sseErrored) {
        setStatus((s) => ({ ...s, "agents-yaml": "in-progress" }));
        try {
          const result = await initProject({
            dir: target,
            manager: { command: chosenCli! },
            agentsYamlOnly: true,
          });
          if (!result.ok) {
            setStatus((s) => ({ ...s, "agents-yaml": "failed" }));
            setErrorMessage(result.reason ?? "Failed to write agents.yaml");
            return;
          }
          setStatus((s) => ({ ...s, "agents-yaml": "done" }));
        } catch (err) {
          if (cancelled) return;
          setStatus((s) => ({ ...s, "agents-yaml": "failed" }));
          setErrorMessage(
            err instanceof Error ? err.message : "Failed to write agents.yaml",
          );
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dialogPhase, target, targetValid, chosenCli]);

  useEffect(() => {
    const el = logPaneRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  // Check agmsg's install status once the chain completes, so the
  // optional Agmsg section knows whether to show Install.
  useEffect(() => {
    if (!isComplete) return;
    let cancelled = false;
    fetchDoctor()
      .then((r) => {
        if (!cancelled) setDoctorReport(r);
      })
      .catch(() => {
        /* best-effort — the section just won't show install status */
      });
    return () => {
      cancelled = true;
    };
  }, [isComplete]);

  if (!targetValid) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-card">
          <h2>Missing target</h2>
          <p className="muted">
            /onboarding requires a <code>?target=&lt;absolute-path&gt;</code>
            query parameter (e.g. <code>/home/me/project</code> or{" "}
            <code>C:\Users\me\project</code>).
          </p>
          <div className="onboarding-actions">
            <button type="button" onClick={() => closeOnboarding(channel)}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show InitDialog first (prereq check + Manager picker).
  if (dialogPhase === "dialog") {
    return (
      <div className="onboarding-page">
        <InitDialog
          dir={target}
          initOptions={{ autoCreateDir: true, autoGitInit: true }}
          onSuccess={(cli) => {
            setChosenCli(cli);
            setDialogPhase("running");
          }}
          onCancel={() => closeOnboarding(channel)}
        />
      </div>
    );
  }

  const canOpen = isComplete && !errorMessage && !connectionLost;

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <h2>Setting up ithyno project</h2>
        <p className="onboarding-target">
          <code>{target}</code>
        </p>
        {channelParam && (
          <p className="muted" style={{ fontSize: "0.8em" }}>
            Channel: {channel}
          </p>
        )}

        <ul className="onboarding-steps">
          {(["prereq", "scaffold", "openspec-init", "agents-yaml"] as Step[]).map((step) => (
            <li key={step} className={`onboarding-step ${status[step]}`}>
              <span className="onboarding-icon">{icon(status[step])}</span>
              <span className="onboarding-label">{STEP_LABELS[step]}</span>
            </li>
          ))}
        </ul>

        {errorMessage && (
          <div className="onboarding-error">
            <strong>Error:</strong> {errorMessage}
          </div>
        )}
        {connectionLost && !errorMessage && (
          <div className="onboarding-error">
            <strong>Connection lost.</strong> The chain may have continued
            server-side; retry or open a new project via terminal.
          </div>
        )}

        <div
          className="onboarding-log"
          ref={logPaneRef}
          role="log"
          aria-live="polite"
        >
          {logs.length === 0 ? (
            <div className="onboarding-log-empty">Waiting for output…</div>
          ) : (
            logs.map((l) => (
              <div
                key={l.id}
                className={`onboarding-log-line ${l.stream}`}
              >
                <span className="onboarding-log-step">[{l.step}]</span>{" "}
                {l.line}
              </div>
            ))
          )}
        </div>

        {canOpen && (
          <section className="onboarding-section">
            <h3 className="onboarding-section-title">Agmsg (optional — multi-agent messaging)</h3>
            <ul className="onboarding-prereqs">
              <li
                className={`onboarding-prereq ${doctorReport?.agmsg.installed ? "prereq-ok" : "prereq-missing"}`}
              >
                <span className="onboarding-icon">{doctorReport?.agmsg.installed ? "✓" : "○"}</span>
                <span className="onboarding-label">agmsg</span>
                <span className="onboarding-prereq-buttons">
                  {doctorReport && !doctorReport.agmsg.installed && (
                    <button
                      type="button"
                      className="prereq-install-btn"
                      onClick={() => setInstallTool("agmsg")}
                    >
                      Install
                    </button>
                  )}
                  <button type="button" onClick={() => setShowAgmsgConfig(true)}>
                    Configure
                  </button>
                </span>
              </li>
            </ul>
          </section>
        )}

        <div className="onboarding-actions">
          <button
            type="button"
            onClick={() => {
              // Reset state and go back to the Prerequisites / Manager picker
              setStatus({
                prereq: "pending",
                scaffold: "pending",
                "openspec-init": "pending",
                "agents-yaml": "pending",
              });
              setLogs([]);
              setIsComplete(false);
              setErrorMessage(null);
              setConnectionLost(false);
              setChosenCli(null);
              setDialogPhase("dialog");
            }}
            disabled={dialogPhase === "running" && !errorMessage && !connectionLost && !isComplete}
          >
            ← Back
          </button>
          <button type="button" onClick={() => closeOnboarding(channel)}>
            Close
          </button>
          <button
            type="button"
            disabled={!canOpen}
            onClick={() => openProject(channel, target)}
          >
            Open Project
          </button>
        </div>
      </div>

      {installTool && (
        <PrereqInstallModal
          tool={installTool}
          onClose={(didInstall) => {
            setInstallTool(null);
            if (didInstall) {
              void fetchDoctor()
                .then(setDoctorReport)
                .catch(() => {});
            }
          }}
        />
      )}
      {showAgmsgConfig && <AgmsgConfigModal onClose={() => setShowAgmsgConfig(false)} />}
    </div>
  );
}
