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

function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["X-Session-Token"] = token;
  return headers;
}

export function Environment() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const res = await fetch("/api/environment");
    if (!res.ok) return;
    setSnapshot(await res.json());
  };

  useEffect(() => {
    void load();
  }, []);

  const onSelect = async (profile: string | null) => {
    setLoading(true);
    try {
      const res = await fetch("/api/environment/selection", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ selectedProfile: profile }),
      });
      if (res.ok) {
        const payload = await res.json();
        setSnapshot(payload.snapshot as Snapshot);
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
    if (!res.ok) return;
    const payload = await res.json();
    setRevealed((cur) => ({ ...cur, [key]: payload.value }));
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Development Environment</h2>
      <p>Discover project .env profiles, select one for new Manager PTYs and AgentRunner workers, and reveal values explicitly.</p>
      {snapshot ? (
        <>
          <label>
            Selected profile
            <select
              value={snapshot.selection.selectedProfile ?? ""}
              onChange={(e) => onSelect(e.target.value || null)}
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
          <h3>Profiles</h3>
          <ul>
            {snapshot.profiles.map((profile) => (
              <li key={profile.name}>
                {profile.name} — {profile.path} {profile.selected ? "(selected)" : ""}
              </li>
            ))}
          </ul>
          <h3>Variables</h3>
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.variables.map((variable) => (
                <tr key={variable.key}>
                  <td>{variable.key}</td>
                  <td>{revealed[variable.key] ?? variable.maskedValue}</td>
                  <td>{variable.source}</td>
                  <td>
                    <button onClick={() => onReveal(variable.key)}>Reveal</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Diagnostics</h3>
          <ul>
            {snapshot.diagnostics.map((diag, index) => (
              <li key={`${diag.kind}-${index}`}>{diag.message}</li>
            ))}
          </ul>
          <p>Encryption: {snapshot.encryption.status}</p>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}
