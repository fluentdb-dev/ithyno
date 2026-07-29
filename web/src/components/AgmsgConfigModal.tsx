// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * AgmsgConfigModal — shared agmsg team-config dialog.
 *
 * Extracted from Settings' formerly-inline `AgmsgSection` so the exact
 * same Enable/Team/Storage/Save UI can also open from the New Project
 * onboarding flow (OnboardingProject), not just Settings. Settings now
 * just opens this modal instead of owning its own copy of the form.
 * Landed by limit-agmsg-install-prompt-triggers.
 *
 * Writes the top-level `agmsg:` block in agents.yaml via
 * `POST /api/config/agmsg`. Reads/writes `useStore`'s `agmsg` field
 * directly (rather than taking it as a prop) so it works unmodified from
 * both consumers — notably, the onboarding page (`/onboarding`) never
 * opens a WebSocket connection (see App.tsx: it returns early before
 * `connectWs()`), so the store's `agmsg` field never receives the usual
 * `agents-updated` WS broadcast there. This component updates the store
 * directly from a successful save response instead of waiting on that
 * broadcast, so it stays correct with or without a live WS connection.
 */
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { setAgmsgConfig } from "../api";

export function AgmsgConfigModal(props: { onClose: () => void }) {
  const { onClose } = props;
  const storeAgmsg = useStore((s) => s.agmsg);
  const pushToast = useStore((s) => s.pushToast);

  const [enabled, setEnabled] = useState<boolean>(storeAgmsg !== null);
  const [team, setTeam] = useState<string>(storeAgmsg?.team ?? "");
  const [storage, setStorage] = useState<string>(storeAgmsg?.storage ?? "");
  const [busy, setBusy] = useState(false);

  // Sync from store when a WS broadcast lands (Settings context only —
  // harmless no-op in the onboarding context, which never gets one).
  useEffect(() => {
    setEnabled(storeAgmsg !== null);
    setTeam(storeAgmsg?.team ?? "");
    setStorage(storeAgmsg?.storage ?? "");
  }, [storeAgmsg]);

  const dirty =
    enabled !== (storeAgmsg !== null) ||
    (enabled && team !== (storeAgmsg?.team ?? "")) ||
    (enabled && (storage || "") !== (storeAgmsg?.storage ?? ""));

  const canSave = dirty && !busy && (!enabled || team.trim().length > 0);

  const onSave = async () => {
    setBusy(true);
    try {
      if (enabled) {
        const trimmedTeam = team.trim();
        const trimmedStorage = storage.trim();
        await setAgmsgConfig({
          enabled: true,
          team: trimmedTeam,
          ...(trimmedStorage ? { storage: trimmedStorage } : {}),
        });
        useStore.setState({
          agmsg: { team: trimmedTeam, ...(trimmedStorage ? { storage: trimmedStorage } : {}) },
        });
        pushToast("info", "agmsg block saved");
      } else {
        await setAgmsgConfig({ enabled: false });
        useStore.setState({ agmsg: null });
        pushToast("info", "agmsg block removed");
      }
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="prereq-modal-backdrop">
      <div className="prereq-modal agmsg-config-modal">
        <h3>Agmsg (multi-agent messaging)</h3>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <strong>Enable</strong>
            <p className="muted">
              When on, the embedded Terminal panel wraps its startup in{" "}
              <code>tmux new-session</code> and the dispatcher routes{" "}
              <code>mode: live-shell</code> workers through{" "}
              <code>/agmsg spawn</code> instead of <code>-p</code> subprocess /
              Task tool.
            </p>
          </span>
        </label>

        <div className="settings-field">
          <label>
            <span>
              <strong>Team name</strong>
              <p className="muted">Required when enabled. Names the agmsg team room.</p>
            </span>
            <input
              type="text"
              value={team}
              placeholder="openspec-ui"
              disabled={busy || !enabled}
              onChange={(e) => setTeam(e.target.value)}
            />
          </label>
        </div>

        <div className="settings-field">
          <label>
            <span>
              <strong>Storage path</strong>
              <p className="muted">
                Optional. Path to the SQLite messages DB. When empty, agmsg's
                default (<code>~/.agents/skills/agmsg/db/messages.db</code>)
                is used.
              </p>
            </span>
            <input
              type="text"
              value={storage}
              placeholder=".worktrees/.agmsg.sqlite"
              disabled={busy || !enabled}
              onChange={(e) => setStorage(e.target.value)}
            />
          </label>
        </div>

        <div className="prereq-modal-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" disabled={!canSave} onClick={() => void onSave()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
