// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { cancelAgentJob, saveAgentConfig } from "../api";
import type {
  AgentConfigPayload,
  AgentPublic,
  JobSummary,
  ManagerStatus,
} from "../types";
import { DiffView } from "../components/DiffView";
import { AgentOutputView } from "../components/AgentOutputView";
import { AgentConfigModal } from "../components/AgentConfigModal";

/**
 * Agents tab. Three sections in reading order:
 *
 *   1. Live             — running jobs
 *   2. Configured (idle)— agents.yaml minus the ones currently running
 *   3. Recent jobs      — finished jobs with verdict badge on review runs
 *
 * The tab is fleet-centric: it answers "which agents exist and which are
 * running right now" but does NOT drill into per-change details (that's
 * the Kanban / Change detail pages' job).
 */

export function Agents() {
  const jobsMap = useStore((s) => s.jobs);
  const jobs = useMemo(() => Object.values(jobsMap), [jobsMap]);
  const agents = useStore((s) => s.agents);
  const agentConfigError = useStore((s) => s.agentConfigError);
  const managerStatus = useStore((s) => s.managerStatus);
  const loadAgents = useStore((s) => s.loadAgents);
  const loadJobs = useStore((s) => s.loadJobs);
  const loadManagerStatus = useStore((s) => s.loadManagerStatus);
  const pushToast = useStore((s) => s.pushToast);
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get("job");
  const focusedTab = (searchParams.get("tab") as "output" | "diff" | null) ?? undefined;

  // Config editor state (Phase 5.2):
  //   null    — no modal open
  //   "new"   — Add mode (empty modal)
  //   Agent   — Edit mode (prefilled with the seed agent)
  const [editing, setEditing] = useState<AgentPublic | "new" | null>(null);
  const [addModePrefill, setAddModePrefill] = useState<AgentPublic | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<AgentPublic | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSave = async (payload: AgentConfigPayload) => {
    await saveAgentConfig(payload);
    setEditing(null);
    pushToast("info", "Saved to agents.yaml");
    await loadAgents();
  };

  const handleDelete = async (agent: AgentPublic) => {
    setBusy(true);
    try {
      await saveAgentConfig({ action: "delete", name: agent.name });
      setConfirmingDelete(null);
      pushToast("info", `Deleted agent ${agent.name}`);
      await loadAgents();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadAgents();
    void loadJobs();
    void loadManagerStatus();
  }, [loadAgents, loadJobs, loadManagerStatus]);

  const sorted = [...jobs].sort((a, b) => b.startedAt - a.startedAt);
  const active = sorted.filter((j) => j.status === "running");
  const finished = sorted.filter((j) => j.status !== "running");

  // Configured (idle): agents from agents.yaml that do NOT have a
  // currently-running job AND are not the Manager (Manager gets its
  // own section per add-agents-tab-manager-section). Match by name.
  // Defensive helper: server may still be running the pre-reshape
  // registry, which returns agents without `roles[]`. Fall back to the
  // deprecated scalar `role` field so the UI doesn't crash mid-render.
  const isManager = (a: AgentPublic): boolean =>
    Array.isArray(a.roles) ? a.roles.includes("manager") : a.role === "manager";

  const runningAgentNames = new Set(active.map((j) => j.agentName));
  const idleAgents = agents.filter(
    (a) => !runningAgentNames.has(a.name) && !isManager(a),
  );

  // Manager singleton (refine-agents-config-modal). Used by the modal
  // to hide the `manager` role option in Add mode when one already
  // exists, and by the row to hide the Delete button on the manager.
  const existingManager = agents.find(isManager) ?? null;
  const existingManagerName = existingManager?.name ?? null;

  return (
    <div className="agents-page">
      <h2>Agents</h2>

      {agentConfigError && (
        <div className="parse-error">⚠ agents.yaml: {agentConfigError}</div>
      )}

      <ManagerSection
        status={managerStatus}
        onEdit={(agent) => setEditing(agent)}
        onDeclare={(prefill) => {
          setAddModePrefill(prefill);
          setEditing("new");
        }}
      />

      <section className="agents-section">
        <h3>Live ({active.length})</h3>
        {active.length === 0 ? (
          <p className="empty">No agents currently running.</p>
        ) : (
          active.map((j) => (
            <JobRow key={j.id} job={j} initialTab={j.id === focusedJobId ? focusedTab : undefined} />
          ))
        )}
      </section>

      <section className="agents-section">
        <h3>Configured (idle) ({idleAgents.length})</h3>
        {agents.length === 0 ? (
          <p className="empty">
            No agents defined. Create <code>agents.yaml</code> at the project root (see{" "}
            <code>agents.yaml.example</code>) and define at least one agent to enable the Run
            button on Kanban cards.
          </p>
        ) : idleAgents.length === 0 ? (
          <p className="empty">All configured agents are currently running.</p>
        ) : (
          <ul className="agents-list">
            {idleAgents.map((a) => (
              <AgentRow
                key={a.name}
                agent={a}
                onEdit={() => setEditing(a)}
                onDelete={() => setConfirmingDelete(a)}
              />
            ))}
          </ul>
        )}
        {!agentConfigError && (
          <button
            type="button"
            className="action-btn ghost agents-add-btn"
            onClick={() => setEditing("new")}
          >
            + Add agent
          </button>
        )}
      </section>

      <section className="agents-section">
        <h3>Recent jobs ({finished.length})</h3>
        {finished.length === 0 ? (
          <p className="empty">No finished jobs yet.</p>
        ) : (
          finished
            .slice(0, 50)
            .map((j) => (
              <JobRow key={j.id} job={j} initialTab={j.id === focusedJobId ? focusedTab : undefined} />
            ))
        )}
      </section>

      {editing && (
        <AgentConfigModal
          seed={editing}
          existingNames={agents.map((a) => a.name)}
          existingManagerName={existingManagerName}
          addModePrefill={addModePrefill}
          onCancel={() => {
            setEditing(null);
            setAddModePrefill(null);
          }}
          onSubmit={async (payload) => {
            await handleSave(payload);
            setAddModePrefill(null);
          }}
        />
      )}

      {confirmingDelete && (
        <DeleteConfirmDialog
          agent={confirmingDelete}
          busy={busy}
          onConfirm={() => void handleDelete(confirmingDelete)}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}

function ManagerSection({
  status,
  onEdit,
  onDeclare,
}: {
  status: ManagerStatus | null;
  onEdit: (agent: AgentPublic) => void;
  onDeclare: (prefill: AgentPublic) => void;
}) {
  if (status === null) {
    return (
      <section className="agents-section manager-section">
        <h3>Manager</h3>
        <p className="empty">Loading manager status…</p>
      </section>
    );
  }

  // Declared state: agents.yaml has a role: manager entry.
  if (status.agentEntry) {
    const a = status.agentEntry;
    return (
      <section className="agents-section manager-section">
        <h3>Manager</h3>
        <ul className="agents-list">
          <li className="agent-row">
            <span className="agent-name">{a.name}</span>
            <span className="job-role-badge">MANAGER</span>
            {status.resolvedStartup && (
              <code className="manager-startup">{status.resolvedStartup}</code>
            )}
            {status.initialInput && (
              <span className="muted">initialInput: {status.initialInput}</span>
            )}
            {a.description && <span className="muted">— {a.description}</span>}
            <span className="agent-row-actions">
              <button type="button" className="action-btn ghost" onClick={() => onEdit(a)}>
                Edit
              </button>
            </span>
          </li>
        </ul>
      </section>
    );
  }

  // "Not configured" state: no role: manager entry BUT the Terminal
  // panel is open, so something is actually running. Say that plainly.
  if (status.terminalActive) {
    const explanation =
      status.fallbackSource === "env"
        ? "Currently running the command from ITHYNO_TERMINAL_STARTUP."
        : "Currently running the built-in default startup command.";
    const prefill = fallbackToPrefillAgent(status);
    return (
      <section className="agents-section manager-section">
        <h3>Manager</h3>
        <div className="manager-fallback-card">
          <div>
            <strong>Manager (not configured in agents.yaml):</strong>{" "}
            <code className="manager-startup">{status.resolvedStartup ?? "(none)"}</code>
          </div>
          {status.initialInput && (
            <div className="muted">initialInput: {status.initialInput}</div>
          )}
          <div className="muted">{explanation}</div>
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="action-btn ghost"
              onClick={() => onDeclare(prefill)}
            >
              Declare in agents.yaml
            </button>
          </div>
        </div>
      </section>
    );
  }

  // Idle state: no manager declared, no terminal open.
  return (
    <section className="agents-section manager-section">
      <h3>Manager</h3>
      <p className="empty">
        No manager declared. Opening a change view launches the Terminal
        panel, which will run the built-in default until you declare one.
      </p>
    </section>
  );
}

/** Parse `resolvedStartup` ("claude --continue") into an AgentPublic-shaped
 *  prefill for the Declare-in-agents.yaml modal. Naive whitespace split
 *  is fine for the common case; users can adjust in the modal. */
function fallbackToPrefillAgent(status: ManagerStatus): AgentPublic {
  const parts = (status.resolvedStartup ?? "").trim().split(/\s+/).filter(Boolean);
  const [command, ...args] = parts;
  const initial = status.initialInput ?? undefined;
  return {
    name: "",
    role: "manager", // deprecated read alias
    roles: ["manager"],
    mode: "live-shell",
    command: command ?? "",
    args,
    hasEnv: false,
    initialInput: initial,
    prompts: initial ? { manager: initial } : undefined,
    specialties: [],
    concurrency: 1,
  };
}

function DeleteConfirmDialog({
  agent,
  busy,
  onConfirm,
  onCancel,
}: {
  agent: AgentPublic;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Delete agent — {agent.name}</h3>
        <p>
          This removes <code>{agent.name}</code> from <code>agents.yaml</code>.
        </p>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  onEdit,
  onDelete,
}: {
  agent: AgentPublic;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Manager row is edit-only (refine-agents-config-modal). Deleting the
  // Manager from the UI silently disables the Terminal panel's
  // auto-launch — a footgun. Users who really want to remove it can
  // hand-edit agents.yaml.
  // Defensive: pre-reshape server returns agents without roles[]/mode.
  const rolesDisplay =
    Array.isArray(agent.roles) && agent.roles.length > 0
      ? agent.roles.join(", ")
      : (agent.role ?? "code");
  const modeDisplay = agent.mode ?? "single-prompt";
  const canDelete = Array.isArray(agent.roles)
    ? !agent.roles.includes("manager")
    : agent.role !== "manager";
  return (
    <li className="agent-row">
      <span className="agent-name">{agent.name}</span>
      <span className="job-role-badge">{rolesDisplay}</span>
      <span className="job-mode-badge muted">mode: {modeDisplay}</span>
      {agent.specialties.length > 0 && (
        <span className="muted">specialties: [{agent.specialties.join(", ")}]</span>
      )}
      {agent.description && <span className="muted">— {agent.description}</span>}
      <span className="agent-row-actions">
        <button type="button" className="action-btn ghost" onClick={onEdit}>
          Edit
        </button>
        {canDelete && (
          <button type="button" className="action-btn ghost" onClick={onDelete}>
            Delete
          </button>
        )}
      </span>
    </li>
  );
}

function JobRow({ job, initialTab }: { job: JobSummary; initialTab?: "output" | "diff" }) {
  const [open, setOpen] = useState(job.status === "running" || initialTab === "diff");
  const defaultTab: "output" | "diff" = initialTab ?? (job.status === "running" ? "output" : "diff");
  const [tab, setTab] = useState<"output" | "diff">(defaultTab);
  const [cancelling, setCancelling] = useState(false);

  return (
    <div className={`job-row job-${job.status}`}>
      <div className="job-row-head">
        <button className="job-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? "▾" : "▸"}
        </button>
        <Link to={`/change/${encodeURIComponent(job.changeId)}`} className="job-change">
          {job.changeId}
        </Link>
        <span className="job-agent">{job.agentName}</span>
        <span className={`job-status status-${job.status}`}>{job.status}</span>
        {job.verdict && <JobVerdictBadge verdict={job.verdict} />}
        {job.status === "running" && (
          <button
            className="action-btn ghost"
            disabled={cancelling}
            onClick={() => {
              setCancelling(true);
              void cancelAgentJob(job.id).catch(() => setCancelling(false));
            }}
          >
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
        <span className="job-meta muted">
          {new Date(job.startedAt).toLocaleString()}
          {job.exitCode != null && ` · exit ${job.exitCode}`}
        </span>
      </div>
      {open && (
        <div className="job-body">
          <div className="job-tabs">
            <button
              className={tab === "output" ? "active" : ""}
              onClick={() => setTab("output")}
            >
              Output
            </button>
            <button
              className={tab === "diff" ? "active" : ""}
              onClick={() => setTab("diff")}
            >
              Diff
            </button>
          </div>
          {tab === "output" ? (
            <AgentOutputView jobId={job.id} />
          ) : (
            <DiffView jobId={job.id} />
          )}
        </div>
      )}
    </div>
  );
}

function JobVerdictBadge({ verdict }: { verdict: NonNullable<JobSummary["verdict"]> }) {
  const isPass = verdict.verdict === "pass";
  const label = isPass
    ? "pass"
    : `needs-rework (${verdict.findings.length})`;
  const title = verdict.summary || label;
  return (
    <span
      className={`job-verdict-badge ${isPass ? "pass" : "rework"}`}
      title={title}
    >
      {isPass ? "✓ " : "⚠ "}
      {label}
    </span>
  );
}
