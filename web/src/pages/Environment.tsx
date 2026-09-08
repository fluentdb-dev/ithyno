import { useEffect, useState } from "react";
import { getSessionToken } from "../runtime";

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
  encryption: { ready: boolean; status: string; sources: string[] };
  revision: string;
};

export type DraftState = {
  edits: Record<string, string>;
  removals: string[];
};

const DRAFT_STORAGE_KEY = "ithyno-environment-draft";
const LAST_APPLIED_REVISION_STORAGE_KEY = "ithyno-environment-last-applied-revision";

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
    <div style={{ border: "1px solid #d0d7de", background: "#f6f8fa", padding: 16, marginBottom: 16 }}>
      <strong>No env files exist yet.</strong>
      <p>Create the first project profile with the name field above, or add a .env file manually. ithyno session variables stay separate from project variables.</p>
    </div>
  );
}

export function EnvironmentValueCell({ variable, revealedValue }: { variable: Variable; revealedValue?: string }) {
  return <span>{revealedValue ?? variable.maskedValue}</span>;
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
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [createProfileName, setCreateProfileName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    writeDraftState(draft);
  }, [draft]);

  const load = async () => {
    setLoading(true);
    try {
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

  const onReveal = async (key: string) => {
    const res = await fetch("/api/environment/reveal", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ key }),
    });
    if (!res.ok) return undefined;
    const payload = await res.json() as { value: string };
    setRevealed((cur) => ({ ...cur, [key]: payload.value }));
    return payload.value;
  };

  const onCopy = async (key: string) => {
    const value = revealed[key] ?? (await onReveal(key));
    if (!value) return;
    await navigator.clipboard.writeText(value);
  };

  const stageEdit = (key: string) => {
    setEditingKey(key);
    setEditingValue(revealed[key] ?? "");
  };

  const saveEdit = () => {
    if (!editingKey) return;
    setDraft((cur) => ({
      edits: { ...cur.edits, [editingKey]: editingValue },
      removals: cur.removals.filter((key) => key !== editingKey),
    }));
    setEditingKey(null);
    setEditingValue("");
    if (managerRunning) setRestartRequired(true);
  };

  const removeVariable = (key: string) => {
    setDraft((cur) => ({
      edits: Object.fromEntries(Object.entries(cur.edits).filter(([entryKey]) => entryKey !== key)),
      removals: [...new Set([...cur.removals, key])],
    }));
    if (managerRunning) setRestartRequired(true);
  };

  const stageVariable = () => {
    const key = newKey.trim();
    if (!key) return;
    setDraft((cur) => ({
      edits: { ...cur.edits, [key]: newValue },
      removals: cur.removals.filter((entryKey) => entryKey !== key),
    }));
    setNewKey("");
    setNewValue("");
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
      const targetProfile = snapshot.selection.selectedProfile ?? "default";
      const res = await fetch("/api/environment/mutate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          profile: targetProfile,
          values: draft.edits,
          remove: draft.removals,
          revision: snapshot.revision,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(payload.error ?? "Unable to save environment changes");
        return;
      }
      const refreshed = await fetch("/api/environment");
      if (refreshed.ok) {
        setSnapshot(await refreshed.json());
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
    <div style={{ padding: 24 }}>
      <h2>Development Environment</h2>
      <p>Discover project .env profiles, select one for new Manager PTYs and AgentRunner workers, reveal values explicitly, and save changes after a review.</p>
      {managerRunning && restartRequired ? (
        <div style={{ background: "#fff4d6", border: "1px solid #f0b429", padding: 12, marginBottom: 12 }}>
          Restart required: the Manager is still running and the selected profile or edits will only take effect after a restart.
        </div>
      ) : null}
      {snapshot ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <label>
              Selected profile
              <select
                value={snapshot.selection.selectedProfile ?? ""}
                onChange={(e) => void onSelect(e.target.value || null)}
                disabled={loading}
                style={{ marginLeft: 8 }}
              >
                <option value="">No profile</option>
                {snapshot.profiles.map((profile) => (
                  <option key={profile.name} value={profile.name}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ marginBottom: 16 }}>
            <input
              value={createProfileName}
              onChange={(e) => setCreateProfileName(e.target.value)}
              placeholder="Create profile name"
              style={{ marginRight: 8 }}
            />
            <button onClick={() => void createProfile()} disabled={loading}>
              Create profile
            </button>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label>
              New variable
              <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="KEY" style={{ marginLeft: 8, marginRight: 8 }} />
              <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value" style={{ marginRight: 8 }} />
              <button onClick={stageVariable}>Stage variable</button>
            </label>
          </div>
          {(Object.keys(draft.edits).length > 0 || draft.removals.length > 0) ? (
            <div style={{ marginBottom: 16 }}>
              <strong>Pending changes</strong>
              <ul>
                {pendingOperations().map((operation) => (
                  <li key={operation}>{operation}</li>
                ))}
              </ul>
              <button onClick={() => setReviewOpen(true)} disabled={saving}>
                Review save
              </button>
            </div>
          ) : null}
          {snapshot.profiles.length === 0 ? <EnvironmentEmptyState /> : (
            <>
              <h3>Profiles</h3>
              <ul>
                {snapshot.profiles.map((profile) => (
                  <li key={profile.name}>
                    {profile.name} — {profile.path} {profile.selected ? "(selected)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
          {snapshot.profiles.length === 0 ? null : (
            <>
              <h3>Variables</h3>
              <table>
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
                        <button onClick={() => void onReveal(variable.key)} style={{ marginRight: 4 }}>Reveal</button>
                        <button onClick={() => void onCopy(variable.key)} style={{ marginRight: 4 }}>Copy</button>
                        <button onClick={() => stageEdit(variable.key)} style={{ marginRight: 4 }}>Edit</button>
                        <button onClick={() => removeVariable(variable.key)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <h3>Diagnostics</h3>
          <ul>
            {snapshot.diagnostics.map((diag, index) => (
              <li key={`${diag.kind}-${index}`}>{diag.message}</li>
            ))}
          </ul>
          <p>Encryption: {snapshot.encryption.status}</p>
          {saveError ? <p style={{ color: "crimson" }}>{saveError}</p> : null}
          {reviewOpen ? (
            <div style={{ border: "1px solid #d0d7de", background: "#f6f8fa", padding: 16, marginTop: 16 }}>
              <h4>Save review</h4>
              <p>Target file: {snapshot.profiles.find((profile) => profile.name === (snapshot.selection.selectedProfile ?? "default"))?.path ?? ".env"}</p>
              <ul>
                {pendingOperations().map((operation) => (
                  <li key={operation}>{operation}</li>
                ))}
              </ul>
              <button onClick={() => void saveChanges()} disabled={saving}>Save changes</button>
              <button onClick={() => setReviewOpen(false)} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          ) : null}
          {editingKey ? (
            <div style={{ border: "1px solid #d0d7de", background: "#f6f8fa", padding: 16, marginTop: 16 }}>
              <h4>Edit {editingKey}</h4>
              <input value={editingValue} onChange={(e) => setEditingValue(e.target.value)} />
              <button onClick={saveEdit} style={{ marginLeft: 8 }}>Save</button>
              <button onClick={() => setEditingKey(null)} style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          ) : null}
        </>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}
