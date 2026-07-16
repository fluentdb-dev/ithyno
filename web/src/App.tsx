// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { useStore } from "./store";
import { checkAuth, onAuthExpiredHandler } from "./api";
import { clearSessionToken, getSessionToken } from "./runtime";
import { Overview } from "./pages/Overview";
import { ChangeDetail } from "./pages/ChangeDetail";
import { Specs } from "./pages/Specs";
import { Docs } from "./pages/Docs";
import { Tags, TagDetailPage } from "./pages/Tags";
import { Archive } from "./pages/Archive";
import { Agents } from "./pages/Agents";
import { Settings } from "./pages/Settings";
import { Terminal } from "./components/Terminal";
import { GitIdentityChip } from "./components/GitIdentityChip";
import { isVsCodeShell } from "./runtime/shell";
import { isElectronMac, isElectronShell, setTitleBarColor } from "./runtime/electron";

export function App() {
  const load = useStore((s) => s.load);
  const connectWs = useStore((s) => s.connectWs);
  const connected = useStore((s) => s.connected);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const state = useStore((s) => s.state);
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);
  const storeTerminalAvailable = useStore((s) => s.terminalAvailable);
  const terminalVisible = useStore((s) => s.terminalVisible);
  // In VS Code the extension host owns a real terminal, so we skip the
  // embedded xterm pane entirely. Command injection still works — see
  // `isVsCodeShell()` branch in `api.ts#injectPty`.
  const embeddedTerminalAvailable = !isVsCodeShell() && storeTerminalAvailable;

  // Bootstrap a "session expired" banner state. Two paths trigger it:
  //   1. No token at all on load (sessionStorage empty AND no ?token=) → banner.
  //   2. Any mutating API call returns 401/403 → banner.
  const [authExpired, setAuthExpired] = useState<boolean>(() => getSessionToken() == null);

  useEffect(() => {
    onAuthExpiredHandler(() => {
      clearSessionToken();
      setAuthExpired(true);
    });
  }, []);

  useEffect(() => {
    if (!isElectronShell()) return;
    if (isElectronMac()) document.body.classList.add("is-electron-mac");
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue("--bg").trim() || "#0f1115";
    const text = styles.getPropertyValue("--text").trim() || "#e6e9ef";
    setTitleBarColor(bg, text);
  }, []);

  // Detect a stale token at first mount (e.g. after a server restart) by
  // hitting the lightweight check endpoint. If the token is missing or no
  // longer recognized, surface the banner immediately instead of waiting for
  // a mutating action.
  useEffect(() => {
    if (authExpired) return;
    void checkAuth().then((ok) => {
      if (!ok) {
        clearSessionToken();
        setAuthExpired(true);
      }
    });
  }, [authExpired]);

  useEffect(() => {
    if (authExpired) return;
    void load();
    connectWs();
  }, [load, connectWs, authExpired]);

  const showTerminal = embeddedTerminalAvailable && terminalVisible;

  if (authExpired) {
    return (
      <div className="app">
        <div className="auth-expired">
          <h2>Session expired</h2>
          <p>
            Open the launch URL printed by the ithyno server to reload with
            a fresh token. The URL looks like{" "}
            <code>http://localhost:&lt;port&gt;/?token=…</code>.
          </p>
          <p className="muted">
            If you restarted the server, the previous token is no longer valid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app${showTerminal ? " with-terminal" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">◑</span> ithyno
        </div>
        <nav>
          <NavLink to="/" end>
            Overview
          </NavLink>
          <NavLink to="/specs">Specs</NavLink>
          <NavLink to="/archive">Archive</NavLink>
          <NavLink to="/tags">Tags</NavLink>
          <NavLink to="/agents">Agents</NavLink>
          <NavLink to="/docs">Docs</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="topbar-right">
          {!isVsCodeShell() && <GitIdentityChip />}
          <div className={`conn ${connected ? "on" : "off"}`} title={connected ? "Live" : "Reconnecting…"}>
            <span className="dot" /> {connected ? "Live" : "Offline"}
          </div>
        </div>
      </header>

      <main className="content">
        {loading && <p className="empty">Loading…</p>}
        {error && <p className="parse-error">Failed to load: {error}</p>}
        {!loading && state && !state.exists && (
          <div className="empty-state">
            <h2>No OpenSpec project found</h2>
            <p>
              Start the dashboard from a directory containing an <code>openspec/</code> folder, or pass{" "}
              <code>--dir &lt;path&gt;</code>.
            </p>
          </div>
        )}
        {!loading && state?.exists && (
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/change/:id" element={<ChangeDetail />} />
            <Route path="/specs" element={<Specs />} />
            <Route path="/docs/*" element={<Docs />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/tags/:ns/*" element={<TagDetailPage />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        )}
      </main>

      {embeddedTerminalAvailable && (
        <aside className={`global-terminal${terminalVisible ? "" : " hidden"}`}>
          <div className="terminal-head">
            <span>Terminal</span>
            <span className="muted">cwd: project root</span>
          </div>
          <Terminal />
        </aside>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
