import { useCallback, useEffect, useState } from "react";
import { getSessionToken } from "../runtime";
import { CopyIcon } from "../components/ClipboardCopyButton";
import { writeClipboardText } from "../clipboardBridge";

type Profile = {
  name: string;
  path: string;
  exists: boolean;
  isBase: boolean;
  selected: boolean;
};

type Variable = {
  key: string;
  maskedValue: string;
  source: string;
  sourcePath: string;
  reserved: boolean;
};

type Snapshot = {
  profiles: Profile[];
  selection: { selectedProfile: string | null; preferences: Record<string, unknown> };
  orderedFiles: string[];
  variables: Variable[];
  diagnostics: Array<{ kind: string; severity: string; message: string; path?: string }>;
  encryption: {
    ready: boolean;
    status: "ready" | "missing";
    sources: string[];
    keyIdentifiers?: string[];
    source?: string | null;
    native?: { supported: boolean; platform: NodeJS.Platform; tool?: string; reason?: string };
  };
  revision: string;
};

export type DraftState = {
  edits: Record<string, string>;
  removals: string[];
};

const DRAFT_STORAGE_KEY = "ithyno-environment-draft";
const LAST_APPLIED_REVISION_STORAGE_KEY = "ithyno-environment-last-applied-revision";

export function hasRevealedEnvironmentValue(revealed: Record<string, string>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(revealed, key);
}

export function removeRevealedEnvironmentValue(
  revealed: Record<string, string>,
  key: string,
): Record<string, string> {
  const next = { ...revealed };
  delete next[key];
  return next;
}

export function stageEnvironmentRemoval(draft: DraftState, key: string): DraftState {
  return {
    edits: Object.fromEntries(Object.entries(draft.edits).filter(([entryKey]) => entryKey !== key)),
    removals: [...new Set([...draft.removals, key])],
  };
}

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["X-Session-Token"] = token;
  return headers;
}

export function readDraftState(storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): DraftState {
  if (!storage) return { edits: {}, removals: [] };
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return { edits: {}, removals: [] };
    const parsed = JSON.parse(raw) as Partial<DraftState>;
    return {
      edits: parsed.edits ?? {},
      removals: parsed.removals ?? [],
    };
  } catch {
    return { edits: {}, removals: [] };
  }
}

export function writeDraftState(draft: DraftState, storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): void {
  if (!storage) return;
  storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function buildPendingOperations(targetProfile: string | null | undefined, draft: DraftState): string[] {
  const operations: string[] = [];
  const target = targetProfile ?? "default";
  for (const [key, value] of Object.entries(draft.edits)) {
    operations.push(`write ${key}=${value} into ${target}`);
  }
  for (const key of draft.removals) {
    operations.push(`remove ${key} from ${target}`);
  }
  return operations;
}

export function describeEncryptionStatus(
  status: "ready" | "missing",
  details?: {
    source?: string | null;
    keyIdentifiers?: string[];
    native?: { supported: boolean; platform: NodeJS.Platform; tool?: string; reason?: string };
  },
) {
  if (status === "ready") {
    if (details?.source) return `ready (${details.source})`;
    return "ready";
  }

  const keyIdentifiers = details?.keyIdentifiers && details.keyIdentifiers.length > 0
    ? details.keyIdentifiers.join(", ")
    : ".env.keys";
  if (details?.native && !details.native.supported) {
    return `missing (standard ${keyIdentifiers} is the default local key source; native key storage is unavailable on this host)`;
  }
  return `missing (confirm first encryption for the selected profile to create ${keyIdentifiers})`;
}

export function shouldShowRestartRequired(lastAppliedRevision: string | null, snapshotRevision: string | null, managerRunning: boolean): boolean {
  if (!managerRunning || !lastAppliedRevision || !snapshotRevision) return false;
  return lastAppliedRevision !== snapshotRevision;
}

function readLastAppliedRevision(storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(LAST_APPLIED_REVISION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastAppliedRevision(revision: string | null, storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): void {
  if (!storage) return;
  if (!revision) {
    storage.removeItem(LAST_APPLIED_REVISION_STORAGE_KEY);
    return;
  }
  storage.setItem(LAST_APPLIED_REVISION_STORAGE_KEY, revision);
}

export function EnvironmentEmptyState() {
  return (
    <div className="environment-empty-state">
      <strong>No env files exist yet.</strong>
      <p>Create the first project profile with the name field above, or add a .env file manually. ithyno session variables stay separate from project variables.</p>
    </div>
  );
}

export function EnvironmentNoProfileState({
  createProfileName,
  setCreateProfileName,
  onCreateProfile,
  loading,
}: {
  createProfileName: string;
  setCreateProfileName: (value: string) => void;
  onCreateProfile: () => void | Promise<void>;
  loading: boolean;
}) {
  return (
    <section className="settings-section environment-empty-hero">
      <h3>Profile</h3>
      <div className="environment-empty-hero-body">
        <strong>No environment is configured yet.</strong>
        <p>
          Create the first project profile to apply dotenv values to new Manager PTYs and AgentRunner workers.
        </p>
        <div className="environment-inline-controls environment-inline-controls--stacked">
          <input
            className="environment-input"
            value={createProfileName}
            onChange={(e) => setCreateProfileName(e.target.value)}
            placeholder="Create profile name"
          />
          <button onClick={() => void onCreateProfile()} disabled={loading}>
            Create first profile
          </button>
        </div>
      </div>
    </section>
  );
}

export function EnvironmentValueCell({ variable, revealedValue }: { variable: Variable; revealedValue?: string }) {
  return <span className="environment-value-cell">{revealedValue ?? variable.maskedValue}</span>;
}

function RevealIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 3C4.5 3 1.73 5.61 1 9c.73 3.39 3.5 6 7 6s6.27-2.61 7-6c-.73-3.39-3.5-6-7-6zm0 9c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"
        fill="currentColor"
      />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 8l.5-.5M8 4c3.5 0 6.27 2.61 7 6-.73 3.39-3.5 6-7 6s-6.27-2.61-7-6c.73-3.39 3.5-6 7-6zm0 5c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 2l12 12"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10.5 1.5L14.5 5.5M1.5 14.5H5.5L14 6L10 2L1.5 10.5V14.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4H3.5M3.5 4V13.5C3.5 14.03 3.97 14.5 4.5 14.5H11.5C12.03 14.5 12.5 14.03 12.5 13.5V4M3.5 4H12.5M6.5 7V12M9.5 7V12M4.5 4V2.5C4.5 2.22 4.72 2 5 2H11C11.28 2 11.5 2.22 11.5 2.5V4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface EnvironmentActionButtonsProps {
  variable: Variable;
  isRevealed: boolean;
  onToggleReveal: (key: string) => Promise<void>;
  onCopy: (key: string) => Promise<void>;
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
}

export function EnvironmentActionButtons({
  variable,
  isRevealed,
  onToggleReveal,
  onCopy,
  onEdit,
  onDelete,
}: EnvironmentActionButtonsProps) {
  const [revealing, setRevealing] = useState(false);

  const handleToggleReveal = useCallback(async () => {
    setRevealing(true);
    try {
      await onToggleReveal(variable.key);
    } finally {
      setRevealing(false);
    }
  }, [variable.key, onToggleReveal]);

  return (
    <div className="environment-actions">
      <button
        type="button"
        className="environment-action-button environment-action-button--reveal"
        onClick={() => void handleToggleReveal()}
        disabled={revealing}
        aria-label={isRevealed ? "Hide value" : "Reveal value"}
        title={isRevealed ? "Hide value" : "Reveal value"}
      >
        {isRevealed ? <HideIcon /> : <RevealIcon />}
      </button>
      <button
        type="button"
        className="environment-action-button environment-action-button--copy"
        onClick={() => void onCopy(variable.key)}
        aria-label="Copy value"
        title="Copy value"
      >
        <CopyIcon copied={false} />
      </button>
      <button
        type="button"
        className="environment-action-button environment-action-button--edit"
        onClick={() => onEdit(variable.key)}
        aria-label="Edit value"
        title="Edit value"
      >
        <EditIcon />
      </button>
      <button
        type="button"
        className="environment-action-button environment-action-button--delete"
        onClick={() => onDelete(variable.key)}
        aria-label="Delete value"
        title="Delete value"
      >
        <DeleteIcon />
      </button>
    </div>
  );
}

export function EnvironmentDeleteConfirmDialog({
  variableKey,
  onConfirm,
  onCancel,
}: {
  variableKey: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Delete ${variableKey}`} onClick={(event) => event.stopPropagation()}>
        <h3>Delete variable — {variableKey}</h3>
        <p>
          This removes <code>{variableKey}</code> from the selected environment profile after you save the pending changes.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export function EnvironmentProfileDeleteDialog({
  profile,
  profilePath,
  onConfirm,
  onCancel,
}: {
  profile: string;
  profilePath: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Delete profile ${profile}`} onClick={(event) => event.stopPropagation()}>
        <h3>Delete profile — {profile}</h3>
        <p>
          This removes the exact project file <code>{profilePath}</code>. It does not touch <code>.env.keys</code> or native key storage.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="danger" onClick={onConfirm}>Delete profile</button>
        </div>
      </div>
    </div>
  );
}

export function Environment() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [managerRunning, setManagerRunning] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => readDraftState());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deletingProfile, setDeletingProfile] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [createProfileName, setCreateProfileName] = useState("");
  const [showCreateProfileForm, setShowCreateProfileForm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    writeDraftState(draft);
  }, [draft]);

  const refreshSnapshot = async (): Promise<Snapshot | null> => {
    const [envRes, healthRes] = await Promise.all([
      fetch("/api/environment"),
      fetch("/api/health"),
    ]);
    let nextSnapshot: Snapshot | null = null;
    if (envRes.ok) {
      nextSnapshot = await envRes.json() as Snapshot;
      setSnapshot(nextSnapshot);
    }
    let nextManagerRunning = false;
    if (healthRes.ok) {
      const health = await healthRes.json() as { terminal?: { available?: boolean } };
      nextManagerRunning = Boolean(health.terminal?.available);
      setManagerRunning(nextManagerRunning);
    }
    setRestartRequired(shouldShowRestartRequired(readLastAppliedRevision(), nextSnapshot?.revision ?? null, nextManagerRunning));
    return nextSnapshot;
  };

  const load = async () => {
    setLoading(true);
    try {
      return await refreshSnapshot();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const pendingOperations = () => buildPendingOperations(snapshot?.selection.selectedProfile ?? null, draft);

  const onSelect = async (profile: string | null) => {
    const previousRevision = snapshot?.revision ?? null;
    setLoading(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/environment/selection", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ selectedProfile: profile }),
      });
      if (res.ok) {
        const payload = await res.json() as { snapshot: Snapshot };
        setSnapshot(payload.snapshot);
        if (managerRunning) {
          setRestartRequired(true);
          writeLastAppliedRevision(previousRevision);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchEnvironmentValue = async (key: string) => {
    const res = await fetch("/api/environment/reveal", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ key }),
    });
    if (!res.ok) return undefined;
    const payload = await res.json() as { value: string };
    return payload.value;
  };

  const onReveal = async (key: string) => {
    const value = await fetchEnvironmentValue(key);
    if (value === undefined) return undefined;
    setRevealed((cur) => ({ ...cur, [key]: value }));
    return value;
  };

  const toggleReveal = async (key: string) => {
    if (hasRevealedEnvironmentValue(revealed, key)) {
      setRevealed((cur) => removeRevealedEnvironmentValue(cur, key));
    } else {
      await onReveal(key);
    }
  };

  const onCopy = async (key: string) => {
    const value = hasRevealedEnvironmentValue(revealed, key)
      ? revealed[key]
      : await fetchEnvironmentValue(key);
    if (value === undefined) return;
    await writeClipboardText(value);
  };

  const openReview = async () => {
    setSaveError(null);
    await refreshSnapshot();
    setReviewOpen(true);
  };

  const stageEdit = (key: string) => {
    setEditingKey(key);
    setEditingValue(revealed[key] ?? "");
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    setDraft((cur) => ({
      edits: { ...cur.edits, [editingKey]: editingValue },
      removals: cur.removals.filter((key) => key !== editingKey),
    }));
    setEditingKey(null);
    setEditingValue("");
    await openReview();
    if (managerRunning) setRestartRequired(true);
  };

  const confirmRemoveVariable = async () => {
    if (!deletingKey) return;
    const key = deletingKey;
    setDeletingKey(null);
    setDraft((cur) => stageEnvironmentRemoval(cur, key));
    if (managerRunning) setRestartRequired(true);
    await openReview();
  };

  const confirmDeleteProfile = async () => {
    if (!snapshot || !deletingProfile) return;
    const profile = deletingProfile;
    const profilePath = snapshot.profiles.find((item) => item.name === profile)?.path ?? null;
    setDeletingProfile(null);
    try {
      const res = await fetch("/api/environment/profile-delete", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ profile, path: profilePath }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(payload.error ?? "Unable to delete profile");
        return;
      }
      setDraft({ edits: {}, removals: [] });
      setRevealed({});
      setEditingKey(null);
      setEditingValue("");
      await refreshSnapshot();
      if (managerRunning) {
        setRestartRequired(true);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to delete profile");
    }
  };

  const stageVariable = async () => {
    const key = newKey.trim();
    if (!key) return;
    setDraft((cur) => ({
      edits: { ...cur.edits, [key]: newValue },
      removals: cur.removals.filter((entryKey) => entryKey !== key),
    }));
    setNewKey("");
    setNewValue("");
    await openReview();
    if (managerRunning) setRestartRequired(true);
  };

  const createProfile = async () => {
    const profile = createProfileName.trim();
    if (!profile) return;
    const previousRevision = snapshot?.revision ?? null;
    setLoading(true);
    setSaveError(null);
    try {
      const createRes = await fetch("/api/environment/mutate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ profile, values: {} }),
      });
      if (!createRes.ok) {
        const payload = await createRes.json().catch(() => ({})) as { error?: string };
        setSaveError(payload.error ?? "Unable to create profile");
        return;
      }
      const selectRes = await fetch("/api/environment/selection", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ selectedProfile: profile }),
      });
      if (selectRes.ok) {
        const payload = await selectRes.json() as { snapshot: Snapshot };
        setSnapshot(payload.snapshot);
        if (managerRunning) {
          setRestartRequired(true);
          writeLastAppliedRevision(previousRevision);
        }
      }
      setCreateProfileName("");
      setShowCreateProfileForm(false);
    } finally {
      setLoading(false);
    }
  };

  const saveChanges = async () => {
    if (!snapshot) return;
    const previousRevision = snapshot.revision;
    setSaving(true);
    setSaveError(null);
    try {
      const refreshed = await fetch("/api/environment");
      const latestSnapshot = refreshed.ok ? (await refreshed.json() as Snapshot) : snapshot;
      const targetProfile = latestSnapshot.selection.selectedProfile ?? "default";
      const res = await fetch("/api/environment/mutate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          profile: targetProfile,
          values: draft.edits,
          remove: draft.removals,
          revision: latestSnapshot.revision,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string };
        const message = payload.error === "stale revision"
          ? "The environment file changed since this page loaded. Refresh it and save again."
          : payload.error ?? "Unable to save environment changes";
        setSaveError(message);
        return;
      }
      const refreshedAfter = await fetch("/api/environment");
      if (refreshedAfter.ok) {
        setSnapshot(await refreshedAfter.json());
      }
      setDraft({ edits: {}, removals: [] });
      setReviewOpen(false);
      if (managerRunning) {
        setRestartRequired(true);
        writeLastAppliedRevision(previousRevision);
      }
      setRevealed((cur) => Object.fromEntries(Object.entries(cur).filter(([key]) => !draft.edits[key] && !draft.removals.includes(key))));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page environment-page">
      <h2>Development Environment</h2>
      <p className="muted environment-description">
        Discover project .env profiles, select one for new Manager PTYs and AgentRunner workers, reveal values explicitly, and save changes after a review.
      </p>
      {snapshot ? (
        <p className={snapshot.encryption.status === "missing" ? "environment-status environment-status-warning" : "environment-status environment-status-ok"}>
          {describeEncryptionStatus(snapshot.encryption.status, {
            source: snapshot.encryption.source,
            keyIdentifiers: snapshot.encryption.keyIdentifiers,
            native: snapshot.encryption.native,
          })}
        </p>
      ) : null}
      {managerRunning && restartRequired ? (
        <div className="info-banner">
          Restart required: the Manager is still running and the selected profile or edits will only take effect after a restart.
        </div>
      ) : null}
      {snapshot ? (
        <>
          {snapshot.profiles.length === 0 ? (
            <EnvironmentNoProfileState
              createProfileName={createProfileName}
              setCreateProfileName={setCreateProfileName}
              onCreateProfile={createProfile}
              loading={loading}
            />
          ) : (
            <section className="settings-section">
              <div className="environment-header-row">
                <h3>Profile</h3>
                <button
                  className="environment-action-link"
                  onClick={() => setShowCreateProfileForm((cur) => !cur)}
                  disabled={loading}
                >
                  {showCreateProfileForm ? "Close" : "Create profile"}
                </button>
              </div>

              {showCreateProfileForm ? (
                <div className="environment-create-card">
                  <div className="environment-inline-controls environment-inline-controls--stacked">
                    <input
                      className="environment-input"
                      value={createProfileName}
                      onChange={(e) => setCreateProfileName(e.target.value)}
                      placeholder="Create profile name"
                    />
                    <button onClick={() => void createProfile()} disabled={loading || !createProfileName.trim()}>
                      Create profile
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="settings-field">
                <label>
                  <span><strong>Active profile</strong></span>
                  <select
                    className="environment-select"
                    value={snapshot.selection.selectedProfile ?? ""}
                    onChange={(e) => void onSelect(e.target.value || null)}
                    disabled={loading}
                  >
                    <option value="">No profile</option>
                    {snapshot.profiles.map((profile) => (
                      <option key={profile.name} value={profile.name}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
                {snapshot.selection.selectedProfile ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => setDeletingProfile(snapshot.selection.selectedProfile ?? null)}
                    disabled={loading}
                  >
                    Delete profile
                  </button>
                ) : null}
              </div>
            </section>
          )}

          {reviewOpen ? (
            <div className="environment-save-dialog-backdrop" onClick={() => setReviewOpen(false)}>
              <div
                className="environment-save-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Confirm save"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="environment-save-dialog-inner">
                  <h3 className="modal-title">Confirm save</h3>
                  <p className="modal-subtitle">
                    <code>{snapshot.profiles.find((profile) => profile.name === (snapshot.selection.selectedProfile ?? "default"))?.path ?? ".env"}</code>
                  </p>
                  <ul className="environment-list">
                    {pendingOperations().map((operation) => (
                      <li key={operation}>{operation}</li>
                    ))}
                  </ul>
                  {saveError ? <p className="environment-error">{saveError}</p> : null}
                  <div className="modal-actions">
                    <button className="btn-secondary" onClick={() => setReviewOpen(false)} disabled={saving}>Cancel</button>
                    <button className="btn-primary" onClick={() => void saveChanges()} disabled={saving}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {snapshot.profiles.length === 0 ? null : (
            <section className="settings-section">
              <div className="settings-field">
                <label>
                  <span>
                    <strong>New variable</strong>
                    <p>Stage a single key/value pair before reviewing and saving the profile.</p>
                  </span>
                  <div className="environment-inline-controls environment-inline-controls--stacked">
                    <input
                      className="environment-input"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="KEY"
                    />
                    <input
                      className="environment-input"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="value"
                    />
                    <button onClick={() => void stageVariable()}>Stage variable</button>
                  </div>
                </label>
              </div>

              <h3 style={{ marginTop: 20 }}>Variables</h3>
              {snapshot.variables.length === 0 ? (
                <div className="environment-empty-state environment-empty-plain">
                  <strong>No variables defined for this profile yet.</strong>
                </div>
              ) : (
                <div className="environment-table-wrap">
                  <table className="environment-table">
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                        <th>Source</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.variables.map((variable) => (
                        <tr key={variable.key}>
                          <td>{variable.key}</td>
                          <td><EnvironmentValueCell variable={variable} revealedValue={revealed[variable.key]} /></td>
                          <td>{variable.source}</td>
                          <td>
                            <EnvironmentActionButtons
                              variable={variable}
                              isRevealed={hasRevealedEnvironmentValue(revealed, variable.key)}
                              onToggleReveal={toggleReveal}
                              onCopy={onCopy}
                              onEdit={stageEdit}
                              onDelete={setDeletingKey}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}


          {saveError ? <p className="environment-error">{saveError}</p> : null}
          {deletingProfile ? (
            <EnvironmentProfileDeleteDialog
              profile={deletingProfile}
              profilePath={snapshot.profiles.find((profile) => profile.name === deletingProfile)?.path ?? ".env"}
              onConfirm={() => void confirmDeleteProfile()}
              onCancel={() => setDeletingProfile(null)}
            />
          ) : null}
          {deletingKey ? (
            <EnvironmentDeleteConfirmDialog
              variableKey={deletingKey}
              onConfirm={() => void confirmRemoveVariable()}
              onCancel={() => setDeletingKey(null)}
            />
          ) : null}
          {editingKey ? (
            <section className="settings-section environment-panel">
              <h3>Edit {editingKey}</h3>
              <div className="environment-inline-controls environment-inline-controls--stacked">
                <input
                  className="environment-input"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                />
                <button onClick={saveEdit}>Save</button>
                <button onClick={() => setEditingKey(null)}>Cancel</button>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="muted">Loading…</p>
      )}
    </div>
  );
}
