// SPDX-License-Identifier: GPL-3.0-or-later
// Shared onboarding page consumed by Electron (child BrowserWindow),
// browser (React Router navigate), and VS Code (webview panel). Reads
// `target` + optional `channel` from query, opens POST /api/init/stream
// via `fetch`, parses SSE frames, and drives step + log UI.
// Landed by add-new-project-onboarding-window.
import { useEffect, useMemo, useRef, useState } from "react";
import { getSessionToken } from "../runtime";
import {
  closeOnboarding,
  detectChannel,
  openProject,
  type OnboardingChannel,
} from "../lib/onboardingChannel";

type Step = "scaffold" | "openspec-init";
type StepStatus = "pending" | "in-progress" | "done" | "failed";
type ChainEvent =
  | { type: "step-start"; step: Step }
  | {
      type: "log";
      step: Step;
      line: string;
      stream: "stdout" | "stderr";
    }
  | { type: "step-done"; step: Step }
  | { type: "complete"; target: string }
  | { type: "error"; step: Step; message: string };

const STEP_LABELS: Record<Step, string> = {
  scaffold: "Scaffold ithyno files",
  "openspec-init": "Install OpenSpec",
};

const MAX_LOG_LINES = 500;

interface LogLine {
  step: Step;
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

  const [status, setStatus] = useState<Record<Step, StepStatus>>({
    scaffold: "pending",
    "openspec-init": "pending",
  });
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const logIdRef = useRef(0);
  const logPaneRef = useRef<HTMLDivElement | null>(null);

  const targetValid = target.length > 0 && target.startsWith("/");

  useEffect(() => {
    if (!targetValid) return;
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
          }),
        });
        if (!res.ok || !res.body) {
          setErrorMessage(
            `Server returned ${res.status} — could not start onboarding.`,
          );
          setStatus((s) => ({ ...s, scaffold: "failed" }));
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
              appendEvent(evt);
            } catch {
              /* skip malformed frame */
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        setConnectionLost(true);
        setStatus((s) => {
          const next = { ...s };
          for (const step of ["scaffold", "openspec-init"] as Step[]) {
            if (next[step] === "in-progress") next[step] = "failed";
          }
          return next;
        });
        setErrorMessage(
          err instanceof Error ? err.message : "Connection lost",
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [target, targetValid]);

  useEffect(() => {
    const el = logPaneRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  if (!targetValid) {
    return (
      <div className="onboarding-page">
        <div className="onboarding-card">
          <h2>Missing target</h2>
          <p className="muted">
            /onboarding requires a <code>?target=&lt;absolute-path&gt;</code>
            query parameter.
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
          {(["scaffold", "openspec-init"] as Step[]).map((step) => (
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

        <div className="onboarding-actions">
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
    </div>
  );
}
