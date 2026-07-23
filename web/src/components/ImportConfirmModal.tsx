// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * ImportConfirmModal — shows preflight info for a spec-generation import job.
 *
 * Props:
 *   projectRoot: string — the target project root
 *   onConfirm(jobId: string): void — called when user confirms, jobId from server
 *   onCancel(): void — called when user cancels
 */

import { useEffect, useState } from "react";
import { getSessionToken } from "../runtime";

type PreflightData = {
  jobId: string;
  estimatedContextBytes: number;
  scanCounts: { code: number; docs: number };
  filesToScan: string[];
  dry?: boolean;
};

type Props = {
  projectRoot: string;
  /** Called when the server accepted the import dispatch. No jobId is
   *  passed — progress is tracked via the WS state-replaced broadcast. */
  onConfirm: () => void;
  onCancel: () => void;
};

function bytesToHuman(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Rough token estimate: ~4 chars per token on average. */
function estimateTokens(bytes: number): string {
  const tokens = Math.round(bytes / 4);
  if (tokens < 1000) return `~${tokens}`;
  if (tokens < 1_000_000) return `~${(tokens / 1000).toFixed(0)}K`;
  return `~${(tokens / 1_000_000).toFixed(1)}M`;
}

export function ImportConfirmModal({ projectRoot, onConfirm, onCancel }: Props) {
  const [preflight, setPreflight] = useState<PreflightData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  // Fetch dry-run preflight on mount
  useEffect(() => {
    const token = getSessionToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["X-Session-Token"] = token;

    fetch("/api/import/spec-generation", {
      method: "POST",
      headers,
      body: JSON.stringify({ projectRoot, force: false, dry: true }),
    })
      .then(async (res) => {
        const data = (await res.json()) as PreflightData & { error?: string };
        if (!res.ok) {
          setError(data.error ?? `Error ${res.status}`);
        } else {
          setPreflight(data);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Network error");
      })
      .finally(() => setLoading(false));
  }, [projectRoot]);

  const handleConfirm = async (): Promise<void> => {
    if (confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const token = getSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["X-Session-Token"] = token;

      const res = await fetch("/api/import/spec-generation", {
        method: "POST",
        headers,
        body: JSON.stringify({ projectRoot, force: false, dry: false }),
      });
      const data = (await res.json()) as PreflightData & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        setConfirming(false);
        return;
      }
      onConfirm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
      setConfirming(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal import-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Import: Generate OpenSpec Specs</h2>
        <p className="modal-subtitle">
          <code>{projectRoot}</code>
        </p>

        {loading && <p className="empty">Scanning project…</p>}

        {error && (
          <div className="import-error">
            <strong>Cannot start import:</strong> {error}
          </div>
        )}

        {preflight && !error && (
          <div className="import-preflight">
            <table className="preflight-table">
              <tbody>
                <tr>
                  <th>Code files</th>
                  <td>{preflight.scanCounts.code}</td>
                </tr>
                <tr>
                  <th>Doc files</th>
                  <td>{preflight.scanCounts.docs}</td>
                </tr>
                <tr>
                  <th>Est. context</th>
                  <td>{bytesToHuman(preflight.estimatedContextBytes)}</td>
                </tr>
                <tr>
                  <th>Est. tokens sent</th>
                  <td>{estimateTokens(preflight.estimatedContextBytes)}</td>
                </tr>
              </tbody>
            </table>

            {preflight.filesToScan.length > 0 && (
              <details className="files-to-scan">
                <summary>Files to scan (first {preflight.filesToScan.length})</summary>
                <ul>
                  {preflight.filesToScan.map((f) => (
                    <li key={f}>
                      <code>{f}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="import-disclaimer">
              A Claude Code subagent will read your code and docs and write first-draft
              OpenSpec specs. The generated specs are <strong>not committed</strong> — you
              review and commit manually. LLM usage costs apply.
            </p>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
          {preflight && !error && (
            <button
              className="btn-primary"
              onClick={() => void handleConfirm()}
              disabled={confirming || loading}
            >
              {confirming ? "Starting…" : "Generate Specs"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
