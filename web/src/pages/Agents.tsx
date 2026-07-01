import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { fetchAgentJob, cancelAgentJob } from "../api";
import type { Job, JobSummary, OutputLine } from "../types";
import { DiffView } from "../components/DiffView";

export function Agents() {
  const jobs = useStore((s) => Object.values(s.jobs));
  const agents = useStore((s) => s.agents);
  const agentConfigError = useStore((s) => s.agentConfigError);
  const loadAgents = useStore((s) => s.loadAgents);
  const loadJobs = useStore((s) => s.loadJobs);
  const [searchParams] = useSearchParams();
  const focusedJobId = searchParams.get("job");
  const focusedTab = (searchParams.get("tab") as "output" | "diff" | null) ?? undefined;

  useEffect(() => {
    void loadAgents();
    void loadJobs();
  }, [loadAgents, loadJobs]);

  const sorted = [...jobs].sort((a, b) => b.startedAt - a.startedAt);
  const active = sorted.filter((j) => j.status === "running");
  const finished = sorted.filter((j) => j.status !== "running");

  return (
    <div className="agents-page">
      <h2>Agents</h2>

      {agentConfigError && (
        <div className="parse-error">⚠ agents.yaml: {agentConfigError}</div>
      )}

      <section className="agents-section">
        <h3>Configured agents ({agents.length})</h3>
        {agents.length === 0 ? (
          <p className="empty">
            No agents defined. Create <code>agents.yaml</code> at the project root (see{" "}
            <code>agents.yaml.example</code>) and define at least one agent to enable the Run
            button on Kanban cards.
          </p>
        ) : (
          <ul className="agents-list">
            {agents.map((a) => (
              <li key={a.name}>
                <span className="agent-name">{a.name}</span>
                <code>{a.command} {a.args.join(" ")}</code>
                {a.description && <span className="muted">{a.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="agents-section">
        <h3>Active jobs ({active.length})</h3>
        {active.length === 0 ? (
          <p className="empty">No active agent jobs.</p>
        ) : (
          active.map((j) => (
            <JobRow key={j.id} job={j} initialTab={j.id === focusedJobId ? focusedTab : undefined} />
          ))
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
    </div>
  );
}

function JobRow({ job, initialTab }: { job: JobSummary; initialTab?: "output" | "diff" }) {
  const [open, setOpen] = useState(job.status === "running" || initialTab === "diff");
  const defaultTab: "output" | "diff" = initialTab ?? (job.status === "running" ? "output" : "diff");
  const [tab, setTab] = useState<"output" | "diff">(defaultTab);

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
        {job.status === "running" && (
          <button
            className="action-btn ghost"
            onClick={() => {
              void cancelAgentJob(job.id).catch(() => {});
            }}
          >
            Cancel
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
          {tab === "output" ? <JobOutput jobId={job.id} /> : <DiffView jobId={job.id} />}
        </div>
      )}
    </div>
  );
}

function JobOutput({ jobId }: { jobId: string }) {
  const live = useStore((s) => s.jobOutputs[jobId]);
  const [seeded, setSeeded] = useState<OutputLine[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAgentJob(jobId).then((j: Job | null) => {
      if (!cancelled && j) setSeeded(j.output);
    });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const lines = live ?? seeded ?? [];
  return (
    <pre className="job-output">
      {lines.map((l, i) => (
        <span key={i} className={`out-${l.stream}`}>{l.chunk}</span>
      ))}
    </pre>
  );
}
