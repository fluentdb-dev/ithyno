// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getSessionToken } from "../runtime";
import { useAppliedTheme, type AppliedTheme } from "../hooks/useAppliedTheme";
import { useStore } from "../store";
import { writeClipboardText } from "../clipboardBridge";

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
  const [connected, setConnected] = useState(true);

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

    const fitNow = () => {
      try {
        fit.fit();
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      } catch {
        /* ignore */
      }
    };

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const token = getSessionToken();
    const ws = new WebSocket(
      `${proto}://${location.host}/pty${token ? `?token=${encodeURIComponent(token)}` : ""}`,
    );
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnected(true);
      fitNow();
      term.focus();
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data);
      term.write(data as any);
    };
    ws.onclose = () => {
      setConnected(false);
      term.writeln("\r\n[disconnected]");
    };
    ws.onerror = () => {
      setConnected(false);
      term.writeln("\r\n[connection error]");
    };

    const inputDisposable = term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });

    // Ctrl+Shift+C/V copy-paste. Plain Ctrl+C/Ctrl+V are left completely
    // untouched — they're legitimate terminal control characters (ETX /
    // interrupt, and "literal next" in readline) and xterm.js already
    // forwards them to the pty correctly. macOS's Cmd+C/Cmd+V sets
    // metaKey rather than ctrlKey, so it never went through xterm's key
    // handling to begin with and the browser's native copy/paste
    // already worked there — Windows/Linux have no such Cmd-equivalent,
    // hence the separate shortcut (shown as a hint in the terminal UI).
    term.attachCustomKeyEventHandler((ev) => {
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
    });

    const ro = new ResizeObserver(() => fitNow());
    ro.observe(host);
    window.addEventListener("resize", fitNow);

    return () => {
      window.removeEventListener("resize", fitNow);
      ro.disconnect();
      inputDisposable.dispose();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      term.dispose();
      termRef.current = null;
    };
    // Intentionally mount-only: the WS + xterm lifetime is one-per-mount.
    // Theme changes flow through the separate effect below via
    // `term.options.theme = …`, which is the officially-supported live
    // re-color path (no dispose, scrollback preserved).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div ref={hostRef} className="terminal-host">
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
