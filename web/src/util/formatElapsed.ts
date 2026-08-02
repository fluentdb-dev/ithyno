// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Human-readable elapsed duration for the Kanban card's worker-state
 * indicator (annotate-cards-with-worker-job-state).
 *
 * Format rules (two most-significant units, the smaller one dropped when
 * it is zero):
 *   - `< 60s`  → `"12s"`
 *   - `< 1h`   → `"1m 5s"` / `"3m"`
 *   - `< 24h`  → `"3h 12m"` / `"3h"`
 *   - `>= 24h` → `"1d 4h"` / `"1d"`
 *
 * Negative or NaN input clamps to `"0s"` — a clock skew between the server
 * (which stamps `job.startedAt`) and the browser must never render a
 * nonsense duration on the card.
 */
export function formatElapsed(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "0s";

  const totalSec = Math.floor(elapsedMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;

  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const sec = totalSec % 60;
    return sec === 0 ? `${totalMin}m` : `${totalMin}m ${sec}s`;
  }

  const totalHr = Math.floor(totalMin / 60);
  if (totalHr < 24) {
    const min = totalMin % 60;
    return min === 0 ? `${totalHr}h` : `${totalHr}h ${min}m`;
  }

  const days = Math.floor(totalHr / 24);
  const hr = totalHr % 24;
  return hr === 0 ? `${days}d` : `${days}d ${hr}h`;
}

/**
 * Convenience wrapper: elapsed since an absolute epoch-ms timestamp.
 * `now` is injectable so tests (and the card's 30 s tick) stay pure.
 */
export function formatElapsedSince(startedMs: number, now: number = Date.now()): string {
  return formatElapsed(now - startedMs);
}
