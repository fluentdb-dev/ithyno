// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * ImportProgress — SSE consumer that shows live import job progress.
 *
 * Props:
 *   jobId: string — the import job id
 *   onDone(capabilities: string[]): void — called when import completes
 *   onError(message: string): void — called on error
 *   onRetry(): void — called when user clicks Retry
 *   onCancel(): void — called when user clicks Cancel
 */

import { useEffect, useRef, useState } from "react";
import { getSessionToken } from "../runtime";

type DonePayload = { capabilities: string[]; durationMs: number };

type ProgressLine = {
  kind: "read" | "drafted" | "other";
  text: string;
};

type Props = {
  jobId: string;
  onDone: (capabilities: string[]) => void;
  onError: (message: string) => void;
  onRetry: () => void;
  onCancel: () => void;
};

function parseLine(raw: string): ProgressLine {
  if (raw.startsWith("[import] read: ")) {
    return { kind: "read", text: raw.slice("[import] read: ".length) };
  }
  if (raw.startsWith("[import] drafted: ")) {
    return { kind: "drafted", text: raw.slice("[import] drafted: ".length) };
  }
  return { kind: "other", text: raw };
}

export function ImportProgress({ jobId, onDone, onError, onRetry, onCancel }: Props) {
  const [lines, setLines] = useState<ProgressLine[]>([]);
  const [status, setStatus] = useState<"running" | "done" | "error">("running");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = getSessionToken();
    const url = token
      ? `/api/import/spec-generation/${encodeURIComponent(jobId)}/events?token=${encodeURIComponent(token)}`
      : `/api/import/spec-generation/${encodeURIComponent(jobId)}/events`;

    const es = new EventSource(url);

    es.addEventListener("progress", (ev: MessageEvent) => {
      const line = parseLine(ev.data as string);
      setLines((prev) => [...prev, line]);
    });

    es.addEventListener("done", (ev: MessageEvent) => {
      es.close();
      try {
        const payload = JSON.parse(ev.data as string) as DonePayload;
        setStatus("done");
        onDone(payload.capabilities);
      } catch {
        setStatus("done");
        onDone([]);
      }
    });

    es.addEventListener("error", (ev: Event) => {
      es.close();
      const msg = (ev as MessageEvent).data
        ? String((ev as MessageEvent).data)
        : "Stream error";
      setStatus("error");
      setErrorMsg(msg);
      onError(msg);
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      es.close();
      setStatus("error");
      const msg = "Connection to import stream lost";
      setErrorMsg(msg);
      onError(msg);
    };

    return () => {
      es.close();
    };
  }, [jobId, onDone, onError]);

  // Auto-scroll to bottom as new lines arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const drafts = lines.filter((l) => l.kind === "drafted");
  const reads = lines.filter((l) => l.kind === "read");

  return (
    <div className="import-progress">
      <div className="import-progress-header">
        <h3>Generating OpenSpec Specs…</h3>
        {status === "running" && (
          <span className="spinner" aria-label="Running" />
        )}
        {status === "done" && (
          <span className="import-done-icon" aria-label="Done">Done</span>
        )}
        {status === "error" && (
          <span className="import-error-icon" aria-label="Error">Error</span>
        )}
      </div>

      {status !== "error" && (
        <div className="import-stats">
          <span>Files read: {reads.length}</span>
          <span>Capabilities drafted: {drafts.length}</span>
        </div>
      )}

      <div className="import-log">
        {lines.map((l, i) => (
          <div key={i} className={`import-log-line import-log-${l.kind}`}>
            {l.kind === "read" && <span className="import-prefix">read</span>}
            {l.kind === "drafted" && <span className="import-prefix drafted">drafted</span>}
            <span className="import-line-text">{l.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {status === "error" && (
        <div className="import-error">
          <strong>Import failed:</strong> {errorMsg}
          <div className="modal-actions" style={{ marginTop: "0.75rem" }}>
            <button className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn-primary" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      )}

      {status === "running" && (
        <div className="import-progress-footer">
          <button className="btn-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
