// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { cancelAgentJob, saveAgentConfig } from "../api";
import type {
  AgentConfigPayload,
  AgentPublic,
  JobSummary,
  RuntimeDefPublic,
} from "../types";
import { DiffView } from "../components/DiffView";
import { AgentOutputView } from "../components/AgentOutputView";
import { AgentConfigModal } from "../components/AgentConfigModal";

/**
 * Agents tab. Four sections in reading order:
 *
 *   1. Runtimes         — GET /api/agents/runtimes with installed badges
 *   2. Live             — running jobs (role / runtime badges)
 *   3. Configured (idle)— agents.yaml minus the ones currently running
 *   4. Recent jobs      — finished jobs with verdict badge on review runs
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
  const runtimes = useStore((s) => s.runtimes);
  const runtimesError = useStore((s) => s.runtimesError);
  const loadAgents = useStore((s) => s.loadAgents);
  const loadJobs = useStore((s) => s.loadJobs);
  const loadRuntimes = useStore((s) => s.loadRuntimes);
  const pushToast = useStore((s) => s.pushToast);
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get("job");
  const focusedTab = (searchParams.get("tab") as "output" | "diff" | null) ?? undefined;

  // Config editor state (Phase 5.2):
  //   null    — no modal open
  //   "new"   — Add mode (empty modal)
  //   Agent   — Edit mode (prefilled with the seed agent)
  const [editing, setEditing] = useState<AgentPublic | "new" | null>(null);
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
    void loadRuntimes();
  }, [loadAgents, loadJobs, loadRuntimes]);

  const sorted = [...jobs].sort((a, b) => b.startedAt - a.startedAt);
  const active = sorted.filter((j) => j.status === "running");
  const finished = sorted.filter((j) => j.status !== "running");

  // Configured (idle): agents from agents.yaml that do NOT have a
  // currently-running job. Match by name.
  const runningAgentNames = new Set(active.map((j) => j.agentName));
  const idleAgents = agents.filter((a) => !runningAgentNames.has(a.name));

  return (
    <div className="agents-page">
      <h2>Agents</h2>

      {agentConfigError && (
        <div className="parse-error">⚠ agents.yaml: {agentConfigError}</div>
      )}

      <RuntimesSection
        runtimes={runtimes?.runtimes ?? null}
        error={runtimesError}
        onRefresh={() => void loadRuntimes(true)}
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
          runtimes={runtimes?.runtimes ?? []}
          onCancel={() => setEditing(null)}
          onSubmit={handleSave}
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

function RuntimesSection({
  runtimes,
  error,
  onRefresh,
}: {
  runtimes: RuntimeDefPublic[] | null;
  error: string | null;
  onRefresh: () => void;
}) {
  // Hide the section entirely when the server reports zero runtimes.
  // That's the "no runtimes: declared" case per the spec.
  if (runtimes !== null && runtimes.length === 0) return null;

  const installedCount = runtimes?.filter((r) => r.installed).length ?? 0;
  const total = runtimes?.length ?? 0;

  return (
    <section className="agents-section runtimes-section">
      <div className="runtimes-head">
        <h3>
          Runtimes {runtimes && `(${total} declared, ${installedCount} installed)`}
        </h3>
        <button className="action-btn ghost runtimes-refresh" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {error && (
        <div className="parse-error">⚠ Runtimes fetch failed: {error}</div>
      )}
      {runtimes === null ? (
        <p className="empty">Loading runtimes…</p>
      ) : (
        <ul className="runtime-list">
          {runtimes.map((r) => (
            <RuntimeRow key={r.name} runtime={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RuntimeRow({ runtime }: { runtime: RuntimeDefPublic }) {
  return (
    <li className={`runtime-row ${runtime.installed ? "installed" : "missing"}`}>
      <span className="runtime-indicator" aria-hidden>
        {runtime.installed ? "✓" : "○"}
      </span>
      <span className="runtime-name">{runtime.name}</span>
      <span className="runtime-status">
        {runtime.installed ? "installed" : "not found"}
      </span>
      {runtime.installed ? (
        <span className="runtime-capabilities muted">
          interactive: {runtime.supports.interactive ? "yes" : "no"} · artifact:{" "}
          {runtime.supports.artifactOutput ? "yes" : "no"} · diff: {runtime.supports.diff}
        </span>
      ) : (
        runtime.error && <span className="runtime-error muted">— {runtime.error}</span>
      )}
    </li>
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
  const isRuntimeBacked = !!agent.runtime;
  return (
    <li className="agent-row">
      <span className="agent-name">{agent.name}</span>
      <span className="job-role-badge">{agent.role}</span>
      <span className="job-runtime-badge">
        runtime: {isRuntimeBacked ? agent.runtime : "legacy"}
      </span>
      {agent.specialties.length > 0 && (
        <span className="muted">specialties: [{agent.specialties.join(", ")}]</span>
      )}
      {agent.description && <span className="muted">— {agent.description}</span>}
      {agent.dedicated === false && <span className="muted">· pool</span>}
      <span className="agent-row-actions">
        <button type="button" className="action-btn ghost" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="action-btn ghost" onClick={onDelete}>
          Delete
        </button>
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
        <span className="job-role-badge">{job.role}</span>
        <span className="job-runtime-badge">runtime: {job.runtime}</span>
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
