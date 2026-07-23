// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * ImportProgress — shows import-in-progress state and signals completion.
 *
 * Replaces the former SSE-based consumer. Progress is now observed via the
 * workspace file-watch WS broadcast (`state-replaced` events). When the
 * refreshed WorkspaceState has `exists === true` AND
 * `generatedMarkerPresent === true`, the import is complete and
 * `onComplete(state)` is called.
 *
 * See refactor-import-to-task-tool-subagent for the design rationale.
 *
 * Props:
 *   onComplete(state): void — called when generatedMarkerPresent is detected
 *   onCancel(): void — called when user clicks Cancel
 */

import { useEffect, useRef } from "react";
import { useStore } from "../store";
import type { WorkspaceState } from "../types";

type Props = {
  onComplete: (state: WorkspaceState) => void;
  onCancel: () => void;
};

export function ImportProgress({ onComplete, onCancel }: Props) {
  const state = useStore((s) => s.state);
  // Stable ref so the effect closure always sees the latest callback without
  // re-registering the subscription on every parent re-render.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // When the workspace state refreshes (driven by state-replaced WS event →
  // store.load() → fetchState()) and the generated marker is present, fire
  // onComplete. We only need to fire once — the parent (ImportProjectFlow)
  // will unmount this component immediately after.
  useEffect(() => {
    if (state && state.exists && state.generatedMarkerPresent) {
      onCompleteRef.current(state);
    }
  }, [state]);

  return (
    <div className="import-progress">
      <div className="import-progress-header">
        <h3>Generating OpenSpec Specs…</h3>
        <span className="spinner" aria-label="Running" />
      </div>

      <p className="import-progress-desc">
        The Manager is running the import sub-agent. This may take a few minutes
        depending on the project size.
      </p>

      <p className="import-progress-hint">
        Watch the Manager terminal for live progress. The dashboard will
        automatically transition when <code>openspec/GENERATED.md</code> appears.
      </p>

      <div className="import-progress-footer">
        <button className="btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
