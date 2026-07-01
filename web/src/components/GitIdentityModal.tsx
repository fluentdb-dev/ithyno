import { useEffect, useState } from "react";
import { useStore } from "../store";
import { postGitConfig, postGitInit } from "../api";
import type { GitConfig, GitIdentity } from "../types";

type Props = { onClose: () => void };

/**
 * Modal shown when the header chip is clicked. Two visual states:
 *  - "Not a repository" — CTA to run `git init`, identity fields disabled
 *  - "Repository"       — editable local user.name / user.email
 * Config comes from the store (kept in sync via WS `git-status-updated`).
 */
export function GitIdentityModal({ onClose }: Props) {
  const gitStatus = useStore((s) => s.state?.gitStatus);
  const gitConfig = useStore((s) => s.gitConfig);
  const loadGitConfig = useStore((s) => s.loadGitConfig);
  const setGitStatus = useStore((s) => s.setGitStatus);
  const pushToast = useStore((s) => s.pushToast);
  const isRepo = gitStatus?.isRepo === true;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [initing, setIniting] = useState(false);

  // Refresh config when the modal opens so we always see up-to-date local.
  useEffect(() => {
    if (isRepo) void loadGitConfig();
  }, [isRepo, loadGitConfig]);

  // Keep the input fields in sync with the store's local values.
  useEffect(() => {
    setName(gitConfig?.local.userName ?? "");
    setEmail(gitConfig?.local.userEmail ?? "");
  }, [gitConfig?.local.userName, gitConfig?.local.userEmail]);

  const localName = gitConfig?.local.userName ?? "";
  const localEmail = gitConfig?.local.userEmail ?? "";
  const dirty = isRepo && (name !== localName || email !== localEmail);

  const onSave = async () => {
    if (!dirty) return;
    setSaving(true);
    const patch: GitIdentity = {};
    if (name !== localName) patch.userName = name;
    if (email !== localEmail) patch.userEmail = email;
    try {
      await postGitConfig(patch);
      await loadGitConfig();
      pushToast("info", "Git identity saved");
      onClose();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onInit = async () => {
    setIniting(true);
    try {
      const newStatus = await postGitInit();
      // Update the store directly rather than waiting for the WS event —
      // the modal + chip need to reflect the flipped state now.
      setGitStatus(newStatus);
      await loadGitConfig();
      pushToast("info", "Repository initialized");
      onClose();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setIniting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal git-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Git identity</h3>

        {!isRepo ? (
          <div className="git-modal-not-repo">
            <p>
              This workspace is not a git repository yet.
              {gitStatus?.reason === "git-missing" && " (git binary not found in PATH)"}
            </p>
            <button
              type="button"
              className="primary"
              disabled={initing || gitStatus?.reason === "git-missing"}
              onClick={onInit}
            >
              {initing ? "Initializing…" : "Initialize repository"}
            </button>
            <div className="muted git-modal-note">
              A local git repository will be created at the project root. No
              initial commit is made — that decision (branch name, gitignore)
              is yours.
            </div>
          </div>
        ) : (
          <>
            <div className="git-modal-status">
              <div>
                <span className="muted">Repository:</span> <code>{gitStatus.root}</code>
              </div>
              <div>
                <span className="muted">Branch:</span>{" "}
                <code>{gitStatus.headBranch ?? "(detached)"}</code>
              </div>
            </div>

            {!gitStatus.hasCommits && (
              <div className="modal-warning">
                ⚠ No commits yet. Worktree-mode Start needs a HEAD to branch from —
                make an initial commit (e.g. <code>git commit --allow-empty -m "Initial commit"</code>)
                before starting a worktree agent.
              </div>
            )}

            <label className="git-modal-field">
              <span>user.name</span>
              <input
                type="text"
                value={name}
                placeholder={gitConfig?.effective.userName ?? ""}
                onChange={(e) => setName(e.target.value)}
              />
              <span className="git-modal-source muted">
                Source: {sourceLabel(gitConfig, "userName")}
              </span>
            </label>

            <label className="git-modal-field">
              <span>user.email</span>
              <input
                type="email"
                value={email}
                placeholder={gitConfig?.effective.userEmail ?? ""}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="git-modal-source muted">
                Source: {sourceLabel(gitConfig, "userEmail")}
              </span>
            </label>

            <div className="modal-actions">
              <button className="ghost" onClick={onClose}>Close</button>
              <button className="primary" disabled={!dirty || saving} onClick={onSave}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function sourceLabel(config: GitConfig | null, key: "userName" | "userEmail"): string {
  if (!config) return "…";
  const effective = config.effective[key];
  const local = config.local[key];
  if (local !== undefined && local === effective) return "local";
  if (effective !== undefined) return "global / system";
  return "unset";
}
