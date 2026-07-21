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
import { OnboardingProject } from "./pages/OnboardingProject";
import { Terminal } from "./components/Terminal";
import { GitIdentityChip } from "./components/GitIdentityChip";
import { AboutButton } from "./components/AboutButton";
import { useAppliedTheme } from "./hooks/useAppliedTheme";
import { isVsCodeShell } from "./runtime/shell";
import { isElectronMac, isElectronShell, setTitleBarColor } from "./runtime/electron";

export function App() {
  // /onboarding renders a full-page onboarding UI without the App shell
  // (topbar, terminal, project state gate). It works even when no
  // OpenSpec project is loaded — that's the point.
  if (window.location.pathname.startsWith("/onboarding")) {
    return <OnboardingProject />;
  }

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
  const terminalRestartCounter = useStore((s) => s.terminalRestartCounter);
  const restartTerminal = useStore((s) => s.restartTerminal);
  // In VS Code the extension host owns a real terminal, so we skip the
  // embedded xterm pane entirely. Command injection still works — see
  // `isVsCodeShell()` branch in `api.ts#injectPty`.
  const embeddedTerminalAvailable = !isVsCodeShell() && storeTerminalAvailable;

  // Resolve + apply the current palette (`useAppliedTheme` writes
  // `document.documentElement.dataset.theme` as a side effect and
  // subscribes to `matchMedia("(prefers-color-scheme: dark)")` when the
  // preference is `"system"`). The returned value drives palette-dependent
  // effects below (e.g. Electron traffic-light title bar tint).
  const appliedTheme = useAppliedTheme();

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
    // Re-read on every appliedTheme change so the Electron traffic-light
    // tint tracks light↔dark flips (CSS vars have already been updated by
    // useAppliedTheme by the time this effect runs).
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue("--bg").trim() || "#0f1115";
    const text = styles.getPropertyValue("--text").trim() || "#e6e9ef";
    setTitleBarColor(bg, text);
  }, [appliedTheme]);

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

  // Cmd/Ctrl+Shift+K — restart terminal, but only when focus is inside
  // `.terminal-host` or on the `.terminal-reconnect` button.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.key === "K" || e.key === "k") || !e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
      const active = document.activeElement;
      const termHost = document.querySelector(".terminal-host");
      const isInsideTerminal = termHost != null && termHost.contains(active);
      const isReconnectBtn = active != null && (active as Element).classList?.contains("terminal-reconnect");
      if (!isInsideTerminal && !isReconnectBtn) return;
      e.preventDefault();
      restartTerminal();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [restartTerminal]);

  // Electron IPC: menu "Reload Terminal" sends `ithyno:terminal-restart`
  // to the renderer. Subscribe when running under Electron.
  useEffect(() => {
    const w = window as any;
    if (!w.ithyno?.onTerminalRestart) return;
    const unsub = w.ithyno.onTerminalRestart(() => restartTerminal());
    return () => { if (typeof unsub === "function") unsub(); };
  }, [restartTerminal]);

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
          <AboutButton />
          <div className={`conn ${connected ? "on" : "off"}`} title={connected ? "Live" : "Reconnecting…"}>
            <span className="dot" /> {connected ? "Live" : "Offline"}
          </div>
        </div>
      </header>

      <main className="content">
        {loading && <p className="empty">Loading…</p>}
        {error && <div className="parse-error">⚠ Failed to load: {error}</div>}
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
          <Terminal key={terminalRestartCounter} />
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
