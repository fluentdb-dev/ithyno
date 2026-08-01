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
import { TerminalHiddenAnchor, TerminalSizeToggle } from "./components/TerminalSizeToggle";
import { GitIdentityChip } from "./components/GitIdentityChip";
import { AboutButton } from "./components/AboutButton";
import { AboutModal } from "./components/AboutModal";
import { NoProjectDecisionPanel } from "./components/NoProjectDecisionPanel";
import { ImportProjectFlow } from "./components/ImportProjectFlow";
import { ImportedProjectNotification } from "./components/ImportedProjectNotification";
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
  const importedProjectNotifications = useStore((s) => s.importedProjectNotifications);
  const dismissImportNotification = useStore((s) => s.dismissImportNotification);

  // import-project-spec-generation: import flow state
  const [importFlowActive, setImportFlowActive] = useState(false);
  const [importFlowRoot, setImportFlowRoot] = useState<string | undefined>();
  const [importBannerVisible, setImportBannerVisible] = useState(false);
  const storeTerminalAvailable = useStore((s) => s.terminalAvailable);
  const terminalVisible = useStore((s) => s.terminalVisible);
  const terminalSize = useStore((s) => s.terminalSize);
  const terminalRestartCounter = useStore((s) => s.terminalRestartCounter);
  const restartTerminal = useStore((s) => s.restartTerminal);
  const browseMode = useStore((s) => s.browseMode);
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
    document.body.classList.add("is-electron");
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

  // Automated wake-up / focus session recovery:
  // When system wakes up from sleep or gains focus (visibilitychange → visible, or focus),
  // automatically attempt checkAuth(), connectWs(), and load() to restore state seamlessly.
  useEffect(() => {
    const handleAutoRecover = () => {
      void checkAuth().then((ok) => {
        if (ok) {
          setAuthExpired(false);
          connectWs();
          void load();
        } else if (isElectronShell()) {
          // In Electron shell, if auth fails on wake-up, attempt an automatic window reload
          // so the main process can refresh/re-bootstrap the local server token
          window.location.reload();
        }
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleAutoRecover();
      }
    };

    window.addEventListener("focus", handleAutoRecover);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleAutoRecover);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [connectWs, load]);

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

  // import-project-spec-generation: listen for Electron IPC "import project"
  // messages sent by the File → Import Existing Project… menu item.
  useEffect(() => {
    const w = window as any;
    if (!w.ithyno?.onImportProject) return;
    const unsub = w.ithyno.onImportProject((projectRoot: string) => {
      setImportFlowRoot(projectRoot || undefined);
      setImportFlowActive(true);
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  // Electron IPC: menu "About ithyno" sends `ithyno:open-about` to the renderer.
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => {
    const w = window as any;
    if (!w.ithyno?.onOpenAbout) return;
    const unsub = w.ithyno.onOpenAbout(() => setAboutOpen(true));
    return () => { if (typeof unsub === "function") unsub(); };
  }, []);

  // import-project-spec-generation: listen for VS Code postMessage
  // `{ type: "ithyno:import-project", projectRoot }` relayed from
  // the extension's `ithyno.importProject` command.
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (!ev.data || typeof ev.data !== "object") return;
      if (ev.data.type !== "ithyno:import-project") return;
      const root = typeof ev.data.projectRoot === "string" ? ev.data.projectRoot : undefined;
      setImportFlowRoot(root);
      setImportFlowActive(true);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // terminalSize "hidden" replaces the old terminalVisible=false path;
  // terminalVisible is kept for backward compat (ChangeDetail still reads it).
  // In browse mode the terminal is always suppressed (defensive guard for
  // unify-open-project-3-branch, also covered by guard-terminal-autolaunch).
  // hasAgentsYaml gate (guard-terminal-autolaunch-on-agents-yaml round 2):
  // when agents.yaml is absent, .with-terminal must NOT apply — otherwise
  // .content still reserves padding-right for a nonexistent aside.
  const showTerminal =
    Boolean(state?.hasAgentsYaml) &&
    embeddedTerminalAvailable &&
    terminalVisible &&
    terminalSize !== "hidden" &&
    !browseMode;

  // Derive the layout class for the app root. "default" = no extra class.
  // "hidden" doesn't reach this ternary — showTerminal is false when hidden
  // (see line above), so the ternary short-circuits to "". The <aside> below
  // still mounts on Hidden (visually hidden via `.terminal-hidden` CSS) so
  // the PTY session persists.
  const terminalLayoutClass =
    !showTerminal
      ? ""
      : terminalSize === "fullscreen"
        ? " terminal-fullscreen"
        : terminalSize === "half"
          ? " terminal-half"
          : "";

  const handleReloadSession = () => {
    if (isVsCodeShell()) {
      window.postMessage({ type: "ithyno:reload-session" }, "*");
    }
    window.location.reload();
  };

  if (authExpired) {
    return (
      <div className="app">
        <div className="auth-expired">
          <h2>Session expired</h2>
          <p>
            The session token is no longer valid (e.g. after PC sleep or server restart).
          </p>
          <div className="auth-expired-actions">
            <button
              type="button"
              className="action-btn primary auth-expired-btn"
              onClick={handleReloadSession}
            >
              Reload Dashboard
            </button>
          </div>
          <p className="muted">
            Or open the launch URL printed by the ithyno server (<code>http://localhost:&lt;port&gt;/?token=…</code>).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app${showTerminal ? " with-terminal" : ""}${terminalLayoutClass}`}>
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
        {/* import-project-spec-generation: LLM-generated draft banner */}
        {importBannerVisible && (
          <div className="import-generated-banner">
            <span>
              Specs are LLM-generated drafts — review before relying on them.
            </span>
            <button
              className="import-banner-dismiss"
              aria-label="Dismiss"
              onClick={() => setImportBannerVisible(false)}
            >
              Dismiss
            </button>
          </div>
        )}

        {loading && <p className="empty">Loading…</p>}
        {error && <div className="parse-error">⚠ Failed to load: {error}</div>}
        {!loading && state && !state.exists && !importFlowActive && !browseMode && (
          <NoProjectDecisionPanel
            projectRoot={state.root || ""}
            hasClaudeMd={state.hasClaudeMd ?? false}
          />
        )}
        {importFlowActive && (
          <ImportProjectFlow
            projectRoot={importFlowRoot}
            onComplete={() => {
              setImportFlowActive(false);
              setImportBannerVisible(true);
              void load();
            }}
            onCancel={() => {
              setImportFlowActive(false);
              setImportFlowRoot(undefined);
            }}
          />
        )}
        {!loading && (state?.exists || browseMode) && (
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

      {/* Terminal view is fully gated on agents.yaml presence
          (guard-terminal-autolaunch-on-agents-yaml round 2). Absent
          agents.yaml → no aside, no hidden-state anchor, no PTY. */}
      {state?.hasAgentsYaml && embeddedTerminalAvailable && terminalSize === "hidden" && (
        /* Hidden state: a compact terminal-glyph button flush at the top-right
           corner is the sole re-show entry point. The <aside> BELOW stays
           mounted (just visually hidden via CSS) so the PTY WebSocket and
           the terminal session both persist — clicking restore surfaces the
           same shell with intact scrollback. */
        <div className="terminal-hidden-anchor">
          <TerminalHiddenAnchor />
        </div>
      )}

      {/* Mount the aside on ALL non-hidden states AND on hidden (with the
          terminal-hidden CSS class = display:none). React keeps <Terminal />
          mounted throughout, so the /pty WebSocket + PTY session persist
          across every transition — including Hidden. */}
      {state?.hasAgentsYaml && embeddedTerminalAvailable && terminalVisible && (
        <aside
          className={`global-terminal${terminalSize === "hidden" ? " terminal-hidden" : ""}`}
        >
          <div className="terminal-head">
            {/* Toggle is LEFT of the "Terminal" label per spec (task 3.1) */}
            <TerminalSizeToggle />
            <span>Terminal</span>
            <span className="muted">cwd: project root</span>
          </div>
          <Terminal key={terminalRestartCounter} />
        </aside>
      )}

      {/* Pattern-A import completion notifications (enable-import-both-patterns).
          Stacked top-right; each card dismisses independently. */}
      {importedProjectNotifications.length > 0 && (
        <div className="import-notifications-region">
          {importedProjectNotifications.map((n) => (
            <ImportedProjectNotification
              key={n.id}
              notification={n}
              onDismiss={dismissImportNotification}
            />
          ))}
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
            {t.message}
          </div>
        ))}
      </div>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
