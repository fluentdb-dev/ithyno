// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getSessionToken } from "../runtime";
import { useAppliedTheme, type AppliedTheme } from "../hooks/useAppliedTheme";
import { useStore } from "../store";
import { writeClipboardText } from "../clipboardBridge";

export type TerminalSessionState = "connected" | "reconnecting" | "lost";
export type TerminalSessionStatus = "attached" | "reattached" | "missing" | "terminated" | null;
export const TERMINAL_SESSION_LOST_TIMEOUT_MS = 15_000;

/**
 * Start (or retain) the deadline for obtaining a PTY attachment handshake.
 * A WebSocket transport can open successfully even when the server later
 * rejects PTY attachment, so transport-open must never reset this timestamp.
 */
export function beginTerminalAttachmentWindow(
  currentStartedAtMs: number | null,
  nowMs: number,
): number {
  return currentStartedAtMs ?? nowMs;
}

/** WorkspaceState.root points at the OpenSpec directory, while the PTY
 * protocol identifies the containing project root. Keep this conversion in
 * one place so POSIX and Windows paths produce the same identity as the
 * server-side cwd. */
export function resolveTerminalProjectRoot(workspaceRoot: string): string {
  return workspaceRoot.replace(/[\\/]openspec[\\/]?$/, "");
}

export function resolveTerminalSessionState(
  currentState: TerminalSessionState,
  disconnectStartedAtMs: number | null,
  nowMs: number,
  maxReattachWaitMs = TERMINAL_SESSION_LOST_TIMEOUT_MS,
): TerminalSessionState {
  if (disconnectStartedAtMs === null) {
    return currentState === "lost" ? "lost" : "connected";
  }
  if (nowMs - disconnectStartedAtMs >= maxReattachWaitMs) {
    return "lost";
  }
  return currentState === "lost" ? "lost" : "reconnecting";
}

export function parseTerminalSessionStatusMessage(
  raw: unknown,
): { status: "attached" | "reattached" | "missing" | "terminated"; sessionId?: string } | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.type !== "session-status") {
      return null;
    }
    const status = parsed.status;
    if (status === "attached" || status === "reattached" || status === "missing" || status === "terminated") {
      return { status, sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : undefined };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type TerminalReplayProtocolMessage = "replay-start" | "replay-end";

export function parseTerminalReplayProtocolMessage(raw: unknown): TerminalReplayProtocolMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const type = parsed.type;
    if (type === "replay-start" || type === "replay-end") {
      return type;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export interface TerminalReplayInputGate {
  begin(): void;
  finish(enqueueBarrier: (done: () => void) => void): void;
  shouldForward(_data: string): boolean;
  reset(): void;
}

export function createTerminalReplayInputGate(): TerminalReplayInputGate {
  let suppressed = false;
  let generation = 0;

  return {
    begin() {
      suppressed = true;
      generation++;
    },
    finish(enqueueBarrier: (done: () => void) => void) {
      const capturedGeneration = generation;
      enqueueBarrier(() => {
        if (generation === capturedGeneration) {
          suppressed = false;
        }
      });
    },
    shouldForward(_data: string): boolean {
      return !suppressed;
    },
    reset() {
      suppressed = false;
      generation++;
    },
  };
}

export interface TerminalReplayController {
  markAttached(): void;
  onReplayStart(resetTerminal: () => void): void;
}

export function createTerminalReplayController(): TerminalReplayController {
  let attached = false;

  return {
    markAttached() {
      attached = true;
    },
    onReplayStart(resetTerminal: () => void) {
      if (attached) {
        resetTerminal();
      }
    },
  };
}

export type TerminalOverlayPresentation = {
  showOverlay: boolean;
  title: string;
  message: string;
  showTryReconnect: boolean;
  showDestructiveRestart: boolean;
  destructiveRestartLabel: string;
};

/**
 * Pure presentation resolver: determines overlay visibility and button availability
 * based on session state and server status.
 *
 * Non-blocking automatic reconnection (sessionState === "reconnecting", no status yet)
 * returns showOverlay: false. Overlay only appears after timeout expires or server
 * returns authoritative status.
 */
export function resolveTerminalOverlayPresentation(
  sessionState: TerminalSessionState,
  sessionStatus: TerminalSessionStatus,
): TerminalOverlayPresentation {
  // Do not render overlay during automatic reconnection. The connection effect
  // will either succeed (moving back to connected) or timeout (moving to lost).
  if (sessionState === "reconnecting") {
    return {
      showOverlay: false,
      title: "",
      message: "",
      showTryReconnect: false,
      showDestructiveRestart: false,
      destructiveRestartLabel: "Restart terminal",
    };
  }

  // Overlay only appears after lost state
  if (sessionState !== "lost") {
    return {
      showOverlay: false,
      title: "",
      message: "",
      showTryReconnect: false,
      showDestructiveRestart: false,
      destructiveRestartLabel: "Restart terminal",
    };
  }

  // sessionState === "lost" from here on
  const isAuthoritative = sessionStatus === "missing" || sessionStatus === "terminated";

  if (isAuthoritative) {
    // Server explicitly reported missing or terminated — offer only fresh start
    const title = sessionStatus === "missing"
      ? "Terminal session not found"
      : "Terminal session terminated";
    const message = sessionStatus === "missing"
      ? "The terminal session was not found on the server."
      : "The terminal session was terminated.";

    return {
      showOverlay: true,
      title,
      message,
      showTryReconnect: false,
      showDestructiveRestart: true,
      destructiveRestartLabel: "Start new terminal",
    };
  }

  // Timed out without authoritative status — offer retry only
  return {
    showOverlay: true,
    title: "Terminal reconnection timed out",
    message: "Unable to reconnect to your terminal. Try again or start a new session.",
    showTryReconnect: true,
    showDestructiveRestart: false,
    destructiveRestartLabel: "Restart terminal",
  };
}

export type StableTerminalSession = {
  key: string;
  intent: "create" | "reattach";
  established: boolean;
};

function terminalSessionStorageKey(projectRoot: string): string {
  return `ithyno-terminal-session-key:${projectRoot || "workspace"}`;
}

type StableTerminalSessionStorage = Pick<Storage, "getItem" | "setItem">;

function getStableTerminalSessionStorage(): StableTerminalSessionStorage | null {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return window.sessionStorage;
  }
  return null;
}

export function readStableTerminalSession(
  projectRoot: string,
  storage: StableTerminalSessionStorage | null = getStableTerminalSessionStorage(),
): StableTerminalSession {
  const storageKey = terminalSessionStorageKey(projectRoot);
  const fallbackKey = `${projectRoot || "workspace"}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  if (!storage) {
    return { key: fallbackKey, intent: "create", established: false };
  }
  const raw = storage.getItem(storageKey);
  if (!raw) {
    const fresh = fallbackKey;
    const next: StableTerminalSession = { key: fresh, intent: "create", established: false };
    storage.setItem(storageKey, JSON.stringify(next));
    return next;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.key === "string") {
      const established = parsed.established === true;
      const intent: StableTerminalSession["intent"] = parsed.intent === "create" && !established ? "create" : "reattach";
      const session: StableTerminalSession = {
        key: parsed.key,
        intent,
        established,
      };
      if (!parsed.established) {
        storage.setItem(storageKey, JSON.stringify(session));
      }
      return session;
    }
  } catch {
    /* ignore malformed storage and create a fresh session */
  }
  const fresh = fallbackKey;
  const next: StableTerminalSession = { key: fresh, intent: "create", established: false };
  storage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export function rotateStableTerminalSession(
  projectRoot: string,
  storage: StableTerminalSessionStorage | null = getStableTerminalSessionStorage(),
): string {
  const storageKey = terminalSessionStorageKey(projectRoot);
  const fresh = `${projectRoot || "workspace"}:reload:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  if (!storage) return fresh;
  const next: StableTerminalSession = { key: fresh, intent: "create", established: false };
  storage.setItem(storageKey, JSON.stringify(next));
  return fresh;
}

export function markStableTerminalSessionEstablished(
  projectRoot: string,
  sessionKey: string,
  storage: StableTerminalSessionStorage | null = getStableTerminalSessionStorage(),
): void {
  const storageKey = terminalSessionStorageKey(projectRoot);
  if (!storage) return;
  const cached = readStableTerminalSession(projectRoot, storage);
  if (cached.key !== sessionKey) return;
  const next: StableTerminalSession = { key: sessionKey, intent: "reattach", established: true };
  storage.setItem(storageKey, JSON.stringify(next));
}

/**
 * Browser terminal pane. Streams bytes over a dedicated /pty WebSocket to a
 * real PTY on the local server (xterm.js renders, the server spawns the shell).
 *
 * The palette is derived from the current CSS variables via
 * `getComputedStyle(document.documentElement)`, so both palettes stay in
 * sync with `web/src/styles.css` without a duplicate xterm-specific palette
 * to maintain. On theme flip we assign `term.options.theme = …` in place
 * (no dispose) so scrollback is preserved. Landed by add-light-dark-mode.
 */
export function Terminal() {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const appliedTheme = useAppliedTheme();
  const workspaceRoot = useStore((s) => s.state?.root ?? "");
  const projectRoot = resolveTerminalProjectRoot(workspaceRoot);
  const terminalRestartCounter = useStore((s) => s.terminalRestartCounter);
  const restartTerminal = useStore((s) => s.restartTerminal);
  const [connected, setConnected] = useState(true);
  const [sessionState, setSessionState] = useState<TerminalSessionState>("connected");
  const [sessionStatus, setSessionStatus] = useState<TerminalSessionStatus>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingReloadRef = useRef<{ currentKey: string; nextKey: string } | null>(null);
  const pendingReloadTimerRef = useRef<number | null>(null);

  const clearPendingReloadTimer = () => {
    if (pendingReloadTimerRef.current !== null) {
      window.clearTimeout(pendingReloadTimerRef.current);
      pendingReloadTimerRef.current = null;
    }
  };

  const handleTryReconnect = () => {
    // Clear stale authoritative status when user manually retries
    setSessionStatus(null);
    // Trigger reconnect by incrementing counter, which re-runs the connection effect
    // while preserving the same session key and intent=reattach
    setReconnectAttempt((prev) => prev + 1);
  };

  const handleReload = () => {
    if (pendingReloadRef.current) {
      return;
    }

    const session = readStableTerminalSession(projectRoot);
    const currentKey = session.key;
    const nextKey = rotateStableTerminalSession(projectRoot);
    const ws = wsRef.current;
    pendingReloadRef.current = { currentKey, nextKey };
    clearPendingReloadTimer();
    pendingReloadTimerRef.current = window.setTimeout(() => {
      const pending = pendingReloadRef.current;
      if (!pending) return;
      pendingReloadRef.current = null;
      clearPendingReloadTimer();
      restartTerminal();
    }, 10_000);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "restart", reason: "reload", sessionKey: currentKey, intent: "create" }));
      setConnected(false);
      setSessionState("reconnecting");
      return;
    }
    restartTerminal();
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: buildXtermTheme(appliedTheme),
      scrollback: 5000,
      convertEol: true,
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let handshakeTimer: number | null = null;
    let disconnectedAtMs: number | null = null;
    let closedByRestart = false;
    let currentSessionState: TerminalSessionState = "connected";
    let shouldAutoReconnect = true;
    const replayController = createTerminalReplayController();
    const gate = createTerminalReplayInputGate();
    const sessionStateInfo = readStableTerminalSession(projectRoot);
    const sessionKey = sessionStateInfo.key;
    wsRef.current = null;

    const fitNow = () => {
      try {
        fit.fit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      } catch {
        /* ignore */
      }
    };

    const setTerminalSession = (nextState: TerminalSessionState) => {
      currentSessionState = nextState;
      setSessionState(nextState);
    };

    const clearHandshakeTimer = () => {
      if (handshakeTimer !== null) {
        window.clearTimeout(handshakeTimer);
        handshakeTimer = null;
      }
    };

    const markSessionLost = () => {
      shouldAutoReconnect = false;
      setConnected(false);
      setTerminalSession("lost");
      term.writeln("\r\n[session lost — reload terminal]");
    };

    const buildUrl = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const token = getSessionToken();
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      if (projectRoot) params.set("project", projectRoot);
      params.set("intent", sessionStateInfo.intent);
      params.set("session", sessionKey);
      params.set("sessionId", sessionKey);
      params.set("sessionKey", sessionKey);
      return `${proto}://${location.host}/pty?${params.toString()}`;
    };

    const inputDisposable = term.onData((data) => {
      if (!gate.shouldForward(data)) return;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });

    // Ctrl+Shift+C/V copy-paste. Plain Ctrl+C/Ctrl+V are left completely
    // untouched — they're legitimate terminal control characters (ETX /
    // interrupt, and "literal next" in readline) and xterm.js already
    // forwards them to the pty correctly. macOS's Cmd+C/Cmd+V sets
    // metaKey rather than ctrlKey, so it never went through xterm's key
    // handling to begin with and the browser's native copy/paste
    // already worked there — Windows/Linux have no such Cmd-equivalent,
    // hence the separate shortcut (shown as a hint in the terminal UI).
    const keyHandler = (ev: KeyboardEvent) => {
      if (ev.type !== "keydown" || !ev.ctrlKey || !ev.shiftKey || ev.altKey) return true;
      if (ev.key === "C" || ev.code === "KeyC") {
        if (!term.hasSelection()) return true;
        void writeClipboardText(term.getSelection()).catch(() => {});
        return false;
      }
      if (ev.key === "V" || ev.code === "KeyV") {
        ev.preventDefault();
        void navigator.clipboard
          .readText()
          .then((text) => {
            if (text) {
              term.paste(text);
            }
          })
          .catch(() => {});
        return false;
      }
      return true;
    };
    term.attachCustomKeyEventHandler(keyHandler);

    const ro = new ResizeObserver(() => fitNow());
    ro.observe(host);
    window.addEventListener("resize", fitNow);

    const connect = () => {
      if (closedByRestart) return;
      clearHandshakeTimer();
      disconnectedAtMs = beginTerminalAttachmentWindow(disconnectedAtMs, Date.now());
      const socket = new WebSocket(buildUrl());
      ws = socket;
      wsRef.current = socket;
      socket.binaryType = "arraybuffer";

      const remainingHandshakeMs = Math.max(
        0,
        TERMINAL_SESSION_LOST_TIMEOUT_MS - (Date.now() - disconnectedAtMs),
      );
      handshakeTimer = window.setTimeout(() => {
        if (closedByRestart || ws !== socket) return;
        handshakeTimer = null;
        markSessionLost();
        try { socket.close(); } catch { /* ignore */ }
      }, remainingHandshakeMs);

      socket.onopen = () => {
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        fitNow();
        term.focus();
      };
      socket.onmessage = (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data);
        if (typeof raw === "string") {
          // Check for replay protocol messages
          const replayMsg = parseTerminalReplayProtocolMessage(raw);
          if (replayMsg === "replay-start") {
            gate.begin();
            // On reconnect (after attached), reset xterm to empty terminal state before
            // replay content so old screen and '[reconnecting…]' marker are not duplicated.
            // On initial attach, replay is written to empty xterm without reset.
            replayController.onReplayStart(() => term.reset());
            return;
          }
          if (replayMsg === "replay-end") {
            gate.finish((done) => {
              term.write("", done);
            });
            return;
          }

          const status = parseTerminalSessionStatusMessage(raw);
          if (status) {
            clearHandshakeTimer();
            setSessionStatus(status.status);
            if (status.status === "missing") {
              shouldAutoReconnect = false;
              if (pendingReloadRef.current && pendingReloadRef.current.currentKey === status.sessionId) {
                pendingReloadRef.current = null;
                clearPendingReloadTimer();
                restartTerminal();
                return;
              }
              setConnected(false);
              setTerminalSession("lost");
              return;
            }
            if (status.status === "reattached" || status.status === "attached") {
              replayController.markAttached();
              disconnectedAtMs = null;
              if (reconnectTimer !== null) {
                window.clearTimeout(reconnectTimer);
                reconnectTimer = null;
              }
              shouldAutoReconnect = true;
              if (status.sessionId) {
                markStableTerminalSessionEstablished(projectRoot, status.sessionId);
              }
              clearPendingReloadTimer();
              if (pendingReloadRef.current) {
                const pending = pendingReloadRef.current;
                if (pending.currentKey === status.sessionId) {
                  pendingReloadRef.current = null;
                  restartTerminal();
                  return;
                }
              }
              setConnected(true);
              setTerminalSession("connected");
              return;
            }
            if (status.status === "terminated") {
              disconnectedAtMs = Date.now();
              shouldAutoReconnect = false;
              if (pendingReloadRef.current && pendingReloadRef.current.currentKey === status.sessionId) {
                pendingReloadRef.current = null;
                clearPendingReloadTimer();
                restartTerminal();
                return;
              }
              setConnected(false);
              setTerminalSession("lost");
              return;
            }
          }
        }
        term.write(raw as any);
      };
      socket.onclose = () => {
        clearHandshakeTimer();
        if (closedByRestart) return;
        if (!shouldAutoReconnect) return;
        disconnectedAtMs = beginTerminalAttachmentWindow(disconnectedAtMs, Date.now());
        const nextState = resolveTerminalSessionState(
          currentSessionState,
          disconnectedAtMs,
          Date.now(),
        );
        setConnected(false);
        setTerminalSession(nextState);
        if (nextState === "lost") {
          markSessionLost();
          return;
        }
        term.writeln("\r\n[reconnecting…]");
        if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => {
          if (closedByRestart || !shouldAutoReconnect) return;
          connect();
        }, 1000);
      };
      socket.onerror = () => {
        if (closedByRestart) return;
        if (!shouldAutoReconnect) return;
        disconnectedAtMs = beginTerminalAttachmentWindow(disconnectedAtMs, Date.now());
        setConnected(false);
        const nextState = resolveTerminalSessionState(currentSessionState, disconnectedAtMs, Date.now());
        setTerminalSession(nextState);
        if (nextState === "lost") {
          clearHandshakeTimer();
          markSessionLost();
          try { socket.close(); } catch { /* ignore */ }
        }
      };
    };

    connect();

    return () => {
      closedByRestart = true;
      shouldAutoReconnect = false;
      clearPendingReloadTimer();
      pendingReloadRef.current = null;
      gate.reset();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      clearHandshakeTimer();
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
      }
      wsRef.current = null;
      window.removeEventListener("resize", fitNow);
      ro.disconnect();
      inputDisposable.dispose();
      term.dispose();
      termRef.current = null;
    };
    // Intentionally mount-only: the WS + xterm lifetime is one-per-mount.
    // Theme changes flow through the separate effect below via
    // `term.options.theme = …`, which is the officially-supported live
    // re-color path (no dispose, scrollback preserved).
    // Manual reconnect attempts trigger via reconnectAttempt counter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot, terminalRestartCounter, reconnectAttempt]);

  // Live re-color on theme flip. Reads the CSS variables AFTER
  // useAppliedTheme has updated `<html data-theme=…>`, so the values it
  // reads already belong to the new palette.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = buildXtermTheme(appliedTheme);
  }, [appliedTheme]);

  // macOS's Cmd+C/Cmd+V already copy/paste natively (Cmd sets metaKey,
  // never touching xterm's key handling), so the Ctrl+Shift+C/V hint
  // below is only useful — and only shown — on Windows/Linux.
  const isMac = /Mac/i.test(navigator.platform);
  const presentation = resolveTerminalOverlayPresentation(sessionState, sessionStatus);

  return (
    <div ref={hostRef} className="terminal-host">
      {presentation.showOverlay && (
        <div className="terminal-session-lost-overlay" role="alert">
          <div className="terminal-session-lost-card">
            <div className="terminal-session-lost-title">{presentation.title}</div>
            <div className="terminal-session-lost-message">{presentation.message}</div>
            <div className="terminal-session-lost-buttons">
              {presentation.showTryReconnect && (
                <button
                  type="button"
                  className="terminal-session-lost-button"
                  onClick={handleTryReconnect}
                >
                  Try reconnect
                </button>
              )}
              {presentation.showDestructiveRestart && (
                <button
                  type="button"
                  className="terminal-session-lost-button"
                  onClick={handleReload}
                >
                  {presentation.destructiveRestartLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <button
        className={`terminal-reconnect${connected ? "" : " terminal-reconnect-warn"}`}
        title={isMac ? "Restart terminal (⇧⌘K)" : "Restart terminal (Ctrl+Shift+K)"}
        aria-label="Restart terminal"
        onClick={handleReload}
      >
        &#x21BB;
      </button>
      {!isMac && (
        <div className="terminal-copypaste-hint">
          Copy: Ctrl+Shift+C · Paste: Ctrl+Shift+V
        </div>
      )}
    </div>
  );
}

/**
 * Build an xterm `ITheme` from the current CSS variable values. Called at
 * mount and on every theme flip; the second arg is unused at runtime but
 * keeps the dependency explicit so callers remember the values come from
 * `document.documentElement`'s computed style, which is palette-dependent.
 */
function buildXtermTheme(_applied: AppliedTheme): ITheme {
  if (typeof document === "undefined") {
    return { background: "#0f1115", foreground: "#e6e9ef", cursor: "#6ea8fe" };
  }
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--terminal-bg", "#0f1115"),
    foreground: read("--fg-primary", "#e6e9ef"),
    cursor: read("--accent", "#6ea8fe"),
    cursorAccent: read("--bg-page", "#0f1115"),
    selectionBackground: read("--border-strong", "#3a4050"),
  };
}
