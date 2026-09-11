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
export const TERMINAL_SESSION_LOST_TIMEOUT_MS = 15_000;

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
): { status: "attached" | "reattached" | "missing" | "terminated"; sessionKey?: string } | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.type !== "session-status") {
      return null;
    }
    const status = parsed.status;
    if (status === "attached" || status === "reattached" || status === "missing" || status === "terminated") {
      return { status, sessionKey: typeof parsed.sessionKey === "string" ? parsed.sessionKey : undefined };
    }
  } catch {
    /* ignore */
  }
  return null;
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
  const projectRoot = useStore((s) => s.state?.root ?? "");
  const terminalRestartCounter = useStore((s) => s.terminalRestartCounter);
  const [connected, setConnected] = useState(true);
  const [sessionState, setSessionState] = useState<TerminalSessionState>("connected");

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
    let disconnectedAtMs: number | null = null;
    let closedByRestart = false;
    let currentSessionState: TerminalSessionState = "connected";
    let shouldAutoReconnect = true;
    const sessionKey = `${projectRoot || "workspace"}:${terminalRestartCounter}`;

    const fitNow = () => {
      try {
        fit.fit();
        if (ws && ws.readyState === ws.OPEN) {
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

    const buildUrl = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const token = getSessionToken();
      const params = new URLSearchParams();
      if (token) params.set("token", token);
      if (projectRoot) params.set("project", projectRoot);
      params.set("session", sessionKey);
      params.set("sessionId", sessionKey);
      params.set("sessionKey", sessionKey);
      return `${proto}://${location.host}/pty?${params.toString()}`;
    };

    const inputDisposable = term.onData((data) => {
      if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "input", data }));
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
      ws = new WebSocket(buildUrl());
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        disconnectedAtMs = null;
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        setConnected(true);
        setTerminalSession("connected");
        fitNow();
        term.focus();
      };
      ws.onmessage = (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data);
        if (typeof raw === "string") {
          const status = parseTerminalSessionStatusMessage(raw);
          if (status) {
            if (status.status === "missing") {
              shouldAutoReconnect = false;
              disconnectedAtMs = Date.now();
              setConnected(false);
              setTerminalSession("lost");
              term.writeln("\r\n[session lost — reload terminal]");
              return;
            }
            if (status.status === "reattached" || status.status === "attached") {
              disconnectedAtMs = null;
              if (reconnectTimer !== null) {
                window.clearTimeout(reconnectTimer);
                reconnectTimer = null;
              }
              shouldAutoReconnect = true;
              setConnected(true);
              setTerminalSession("connected");
              return;
            }
            if (status.status === "terminated") {
              disconnectedAtMs = Date.now();
              shouldAutoReconnect = false;
              setConnected(false);
              setTerminalSession("lost");
              return;
            }
          }
        }
        term.write(raw as any);
      };
      ws.onclose = () => {
        if (closedByRestart) return;
        if (!shouldAutoReconnect) return;
        if (disconnectedAtMs === null) disconnectedAtMs = Date.now();
        const nextState = resolveTerminalSessionState(
          currentSessionState,
          disconnectedAtMs,
          Date.now(),
        );
        setConnected(false);
        setTerminalSession(nextState);
        if (nextState === "lost") {
          term.writeln("\r\n[session lost — reload terminal]");
          return;
        }
        term.writeln("\r\n[reconnecting…]");
        if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => {
          if (closedByRestart || !shouldAutoReconnect) return;
          connect();
        }, 1000);
      };
      ws.onerror = () => {
        if (closedByRestart) return;
        if (!shouldAutoReconnect) return;
        if (disconnectedAtMs === null) disconnectedAtMs = Date.now();
        setConnected(false);
        setTerminalSession(resolveTerminalSessionState(currentSessionState, disconnectedAtMs, Date.now()));
      };
    };

    connect();

    return () => {
      closedByRestart = true;
      shouldAutoReconnect = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws && ws.readyState === ws.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "terminate", reason: "reload", sessionKey }));
        } catch {
          /* ignore */
        }
      }
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot, terminalRestartCounter]);

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
  const hasLostSession = sessionState === "lost";

  return (
    <div ref={hostRef} className="terminal-host">
      {hasLostSession && (
        <div className="terminal-session-lost-overlay" role="alert">
          <div className="terminal-session-lost-card">
            <div className="terminal-session-lost-title">Terminal session ended</div>
            <div className="terminal-session-lost-message">Terminal session ended — reload to reconnect.</div>
            <button
              type="button"
              className="terminal-session-lost-button"
              onClick={() => useStore.getState().restartTerminal()}
            >
              Reload terminal
            </button>
          </div>
        </div>
      )}
      <button
        className={`terminal-reconnect${connected ? "" : " terminal-reconnect-warn"}`}
        title={isMac ? "Restart terminal (⇧⌘K)" : "Restart terminal (Ctrl+Shift+K)"}
        aria-label="Restart terminal"
        onClick={() => useStore.getState().restartTerminal()}
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
