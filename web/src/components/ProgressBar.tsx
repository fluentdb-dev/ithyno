// SPDX-License-Identifier: GPL-3.0-or-later
import type { Progress } from "../types";

export function ProgressBar({ progress, showLabel = true }: { progress: Progress; showLabel?: boolean }) {
  const { done, total } = progress;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const complete = total > 0 && done === total;
  return (
    <div className="progress">
      <div className="progress-track">
        <div className={`progress-fill${complete ? " complete" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <span className="progress-label">
          {done}/{total} · {pct}%
        </span>
      )}
    </div>
  );
}
