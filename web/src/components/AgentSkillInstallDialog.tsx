// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * AgentSkillInstallDialog — modal for inspecting and installing
 * OpenSpec and ithyno skills for one selected Agent CLI.
 *
 * Opened by the `Manage skills` button in Settings > Prerequisites.
 * (add-settings-agent-skill-installer)
 *
 * State machine:
 *   idle      → user reviews info and selects components
 *   executing → SSE in progress, inputs locked
 *   done      → per-component results shown, retry available
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { installAgentSkills } from "../api";
import type { AgentSkillInfo, AgentSkillStatus } from "../api";
import { useStore } from "../store";
import type { CliStatus } from "../types";

type DialogPhase = "idle" | "executing" | "done";

interface ComponentResult {
  status: "success" | "failed";
  error?: string;
}

interface Props {
  cli: string;
  skillInfo: AgentSkillInfo | null | undefined;
  cliStatus: CliStatus | undefined;
  onClose: () => void;
}

function statusLabel(s: AgentSkillStatus): string {
  switch (s) {
    case "installed": return "✓ Installed";
    case "partial": return "⚠ Partial";
    case "update-available": return "↑ Update available";
    case "conflict": return "⚠ Global conflict";
    case "missing": return "✗ Missing";
    case "unsupported": return "— Unsupported";
  }
}

function statusClass(s: AgentSkillStatus): string {
  switch (s) {
    case "installed": return "prereq-ok";
    case "partial": return "prereq-warn";
    case "update-available": return "prereq-warn";
    case "conflict": return "prereq-warn";
    case "missing": return "prereq-missing";
    case "unsupported": return "prereq-muted";
  }
}

export function AgentSkillInstallDialog({ cli, skillInfo, cliStatus, onClose }: Props) {
  const loadAgentSkills = useStore((s) => s.loadAgentSkills);
  const projectRoot = useStore((s) => s.state?.root ?? "");

  const [phase, setPhase] = useState<DialogPhase>("idle");
  const [includeOpenspec, setIncludeOpenspec] = useState(true);
  const [includeIthyno, setIncludeIthyno] = useState(true);
  const [lines, setLines] = useState<string[]>([]);
  const [openspecResult, setOpenspecResult] = useState<ComponentResult | null>(null);
  const [ithynoResult, setIthynoResult] = useState<ComponentResult | null>(null);
  const [aggregateResult, setAggregateResult] = useState<"success" | "partial" | "failed" | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | undefined>(undefined);

  // Auto-scroll log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  // Escape key closes when not executing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "executing") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, onClose]);

  // Cleanup reader on unmount
  useEffect(() => {
    return () => {
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  const openspecState: AgentSkillStatus = skillInfo?.openspec.status ?? "unsupported";
  const ithynoState: AgentSkillStatus = skillInfo?.ithyno.status ?? "unsupported";
  const cliMissing = cliStatus && !cliStatus.installed;

  const canInstall =
    phase === "idle" &&
    (includeOpenspec || includeIthyno);

  const onInstall = useCallback(async () => {
    setPhase("executing");
    setLines([]);
    setOpenspecResult(null);
    setIthynoResult(null);
    setAggregateResult(null);

    const components: Array<"openspec" | "ithyno"> = [];
    if (includeOpenspec) components.push("openspec");
    if (includeIthyno) components.push("ithyno");

    let res: Response;
    try {
      res = await installAgentSkills(cli, components);
    } catch (err) {
      setLines([`Network error: ${err instanceof Error ? err.message : String(err)}`]);
      setAggregateResult("failed");
      setPhase("done");
      return;
    }

    if (!res.ok && res.status !== 200) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setLines([`Error ${res.status}: ${body.error ?? "install failed"}`]);
      if (res.status === 409) {
        setLines((prev) => [
          ...prev,
          "Another installation is already running for this CLI in this project.",
        ]);
      }
      setAggregateResult("failed");
      setPhase("done");
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      setLines(["No response body — cannot stream progress."]);
      setAggregateResult("failed");
      setPhase("done");
      return;
    }
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done: rdDone, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const eventLine = part.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const eventName = eventLine?.slice(7) ?? "progress";
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (eventName === "progress") {
            const line = String(data.line ?? "");
            if (line) setLines((prev) => [...prev, line]);
          } else if (eventName === "component-result") {
            const comp = data.component as string;
            const status = data.status as "success" | "failed";
            const error = data.error as string | undefined;
            if (comp === "openspec") setOpenspecResult({ status, error });
            if (comp === "ithyno") setIthynoResult({ status, error });
          } else if (eventName === "done") {
            const result = data.result as "success" | "partial" | "failed" | undefined;
            setAggregateResult(result ?? "failed");
          }
        }
        if (rdDone) break;
      }
    } catch (err) {
      setLines((prev) => [
        ...prev,
        `Stream error: ${err instanceof Error ? err.message : String(err)}`,
      ]);
      setAggregateResult((prev) => prev ?? "failed");
    } finally {
      setPhase("done");
    }

    // Refresh skill state in Settings after any result
    void loadAgentSkills();
  }, [cli, includeOpenspec, includeIthyno, loadAgentSkills]);

  const onRetry = () => {
    setPhase("idle");
    setLines([]);
    setOpenspecResult(null);
    setIthynoResult(null);
    setAggregateResult(null);
  };

  return (
    <div
      className="prereq-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-skill-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "executing") onClose();
      }}
    >
      <div className="prereq-modal agent-skill-dialog">
        <h3 id="agent-skill-dialog-title">Manage skills — {cli}</h3>

        {cliMissing && (
          <div className="info-banner agent-skill-warning" role="alert">
            <strong>CLI executable not installed.</strong> You can still pre-install
            project-local skill files, but the agent cannot run until{" "}
            <code>{cli}</code> is installed and authenticated.
          </div>
        )}

        <table className="agent-skill-info-table">
          <tbody>
            <tr>
              <th>Project</th>
              <td>
                <code>{projectRoot || "—"}</code>
              </td>
            </tr>
            <tr>
              <th>OpenSpec</th>
              <td className={statusClass(openspecState)}>{statusLabel(openspecState)}</td>
            </tr>
            <tr>
              <th>ithyno skills</th>
              <td className={statusClass(ithynoState)}>{statusLabel(ithynoState)}</td>
            </tr>
          </tbody>
        </table>

        {skillInfo?.ithyno.diagnostics && skillInfo.ithyno.diagnostics.length > 0 && (
          <div className="info-banner agent-skill-warning" role="alert">
            <strong>ithyno configuration diagnostics</strong>
            <ul>
              {skillInfo.ithyno.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Component selection */}
        {phase !== "done" && (
          <div className="agent-skill-components">
            <p className="muted">Select components to install:</p>
            <label className="settings-toggle">
              <input
                type="checkbox"
                id={`agent-skill-openspec-${cli}`}
                checked={includeOpenspec}
                disabled={phase === "executing"}
                onChange={(e) => setIncludeOpenspec(e.target.checked)}
              />
              <span>
                <strong>OpenSpec</strong>
                <p className="muted">
                  Runs <code>npx openspec init</code> with the{" "}
                  <code>--tools {cli === "agy" ? "antigravity" : cli === "copilot" ? "github-copilot" : cli}</code>{" "}
                  adapter into the current project.
                </p>
                {skillInfo?.openspec.paths && skillInfo.openspec.paths.length > 0 && (
                  <div className="agent-skill-paths-preview">
                    <span className="muted">Target paths:</span>
                    <ul>
                      {skillInfo.openspec.paths.map((p) => (
                        <li key={p}><code>{p}</code></li>
                      ))}
                    </ul>
                  </div>
                )}
              </span>
            </label>
            <label className="settings-toggle" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                id={`agent-skill-ithyno-${cli}`}
                checked={includeIthyno}
                disabled={phase === "executing"}
                onChange={(e) => setIncludeIthyno(e.target.checked)}
              />
              <span>
                <strong>ithyno skills</strong>
                <p className="muted">
                  Renders the cross-CLI skill files (SKILL.md definitions) into
                  this project using the {cli} renderer.
                </p>
                {skillInfo?.ithyno.paths && skillInfo.ithyno.paths.length > 0 && (
                  <div className="agent-skill-paths-preview">
                    <span className="muted">Target paths:</span>
                    <ul>
                      {skillInfo.ithyno.paths.map((p) => (
                        <li key={p}><code>{p}</code></li>
                      ))}
                    </ul>
                  </div>
                )}
              </span>
            </label>
          </div>
        )}

        {/* Progress log */}
        {(lines.length > 0 || phase === "executing") && (
          <div className="prereq-modal-output" ref={scrollRef}>
            {lines.map((l, i) => (
              <div key={i} className="prereq-output-line">
                {l}
              </div>
            ))}
            {phase === "executing" && (
              <div className="prereq-output-line prereq-spinner">…</div>
            )}
          </div>
        )}

        {/* Component results */}
        {phase === "done" && (
          <div className="agent-skill-results">
            {openspecResult && (
              <p className={openspecResult.status === "success" ? "prereq-ok" : "prereq-missing"}>
                OpenSpec: {openspecResult.status === "success" ? "✓ Success" : `✗ Failed${openspecResult.error ? ` — ${openspecResult.error}` : ""}`}
              </p>
            )}
            {ithynoResult && (
              <p className={ithynoResult.status === "success" ? "prereq-ok" : "prereq-missing"}>
                ithyno skills: {ithynoResult.status === "success" ? "✓ Success" : `✗ Failed${ithynoResult.error ? ` — ${ithynoResult.error}` : ""}`}
              </p>
            )}
            {aggregateResult && (
              <p
                className={
                  aggregateResult === "success"
                    ? "prereq-ok"
                    : aggregateResult === "partial"
                      ? "prereq-warn"
                      : "prereq-missing"
                }
              >
                <strong>
                  {aggregateResult === "success"
                    ? "All components installed successfully."
                    : aggregateResult === "partial"
                      ? "Partial success — one component failed."
                      : "Installation failed."}
                </strong>
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="prereq-modal-actions">
          <button
            type="button"
            id={`agent-skill-cancel-btn-${cli}`}
            disabled={phase === "executing"}
            onClick={onClose}
          >
            {phase === "done" ? "Close" : "Cancel"}
          </button>
          {phase === "done" && aggregateResult !== "success" ? (
            <button
              type="button"
              id={`agent-skill-retry-btn-${cli}`}
              onClick={onRetry}
            >
              Retry
            </button>
          ) : phase !== "done" ? (
            <button
              type="button"
              id={`agent-skill-install-btn-${cli}`}
              disabled={!canInstall}
              onClick={() => void onInstall()}
            >
              {phase === "executing" ? "Installing…" : "Install"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
