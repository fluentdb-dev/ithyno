// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Two-branch decision panel shown when the user opens a folder that has no
 * openspec/ directory. Landed by unify-open-project-3-branch;
 * narrowed to 2 branches (Cancel removed) per user feedback 2026-07-22.
 * Second-branch semantics updated per simplify-browse-to-kanban 2026-07-24:
 * "Browse read-only" (which mounted a markdown-tree viewer) is now
 * "Open dashboard anyway" (renders the empty Kanban directly).
 *
 * Initialize button navigates to `/onboarding?target=<projectRoot>`,
 * matching the same transition Settings > New Project uses. The Onboarding
 * page drives the SSE-streamed runInit + `openspec init` chain and switches
 * to the initialized project on completion.
 *
 * Actions:
 *   • Initialize openspec here → navigate to /onboarding?target=<projectRoot>
 *   • Open dashboard anyway → setBrowseMode(true) → App.tsx renders the
 *     normal chrome (topbar + Routes) with an empty Overview / Kanban
 */
import { useStore } from "../store";

type Props = {
  projectRoot: string;
  hasClaudeMd: boolean;
};

export function NoProjectDecisionPanel({ projectRoot, hasClaudeMd }: Props) {
  const setBrowseMode = useStore((s) => s.setBrowseMode);

  function handleBrowse() {
    setBrowseMode(true);
  }

  function handleInitialize() {
    const q = new URLSearchParams({ target: projectRoot, channel: "browser" });
    window.location.href = `/onboarding?${q.toString()}`;
  }

  return (
    <div className="no-project-panel">
      <h2>No OpenSpec project found</h2>
      <p className="no-project-path muted">
        <code>{projectRoot}</code>
      </p>
      <p>Choose how you want to continue:</p>

      <div className="no-project-actions">
        <button className="btn-primary" onClick={handleInitialize}>
          Initialize openspec here
        </button>
        <button className="btn-secondary" onClick={handleBrowse}>
          Open dashboard anyway
        </button>
      </div>

      {hasClaudeMd && (
        <p className="no-project-claude-hint">
          This project has <code>CLAUDE.md</code> — ithyno will pick it up as
          agent-facing context once openspec is initialized.
        </p>
      )}
    </div>
  );
}
