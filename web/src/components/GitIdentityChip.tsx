// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from "react";
import { useStore } from "../store";
import { GitIdentityModal } from "./GitIdentityModal";

/**
 * Header chip that reflects the workspace git identity + repo state.
 * Local-server and Electron shells only — the VS Code shell defers to
 * VS Code's Source Control panel and this component is not mounted there.
 *
 * Reads gitStatus + gitConfig from the store so the chip is populated on
 * initial page load, not only after the user opens the modal.
 */
export function GitIdentityChip() {
  const gitStatus = useStore((s) => s.state?.gitStatus);
  const gitConfig = useStore((s) => s.gitConfig);
  const [open, setOpen] = useState(false);

  const isRepo = gitStatus?.isRepo === true;
  const effectiveName = gitConfig?.effective.userName;
  const effectiveEmail = gitConfig?.effective.userEmail;
  const initials = computeInitials(effectiveName);
  const label = effectiveName ?? "Configure git…";
  const tooltip = effectiveName
    ? `${effectiveName}${effectiveEmail ? ` <${effectiveEmail}>` : ""}`
    : isRepo
      ? "No git identity configured"
      : "Not a git repository";

  return (
    <>
      <button
        type="button"
        className={`git-chip${!isRepo ? " git-chip-warn" : ""}`}
        title={tooltip}
        onClick={() => setOpen(true)}
      >
        <span className={`git-chip-avatar${initials ? "" : " git-chip-avatar-empty"}`}>
          {initials || <NeutralIcon />}
          {!isRepo && <span className="git-chip-dot" aria-hidden="true" />}
        </span>
        <span className="git-chip-label">{label}</span>
      </button>
      {open && <GitIdentityModal onClose={() => setOpen(false)} />}
    </>
  );
}

function computeInitials(name: string | undefined): string {
  if (!name) return "";
  const parts = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function NeutralIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 8a3 3 0 100-6 3 3 0 000 6zm-6 6c0-2.8 2.7-5 6-5s6 2.2 6 5v.5H2V14z"
      />
    </svg>
  );
}
