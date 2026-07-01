import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getSessionToken } from "../runtime";

/**
 * Browser terminal pane. Streams bytes over a dedicated /pty WebSocket to a
 * real PTY on the local server (xterm.js renders, the server spawns the shell).
 */
export function Terminal() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#0f1115",
        foreground: "#e6e9ef",
        cursor: "#6ea8fe",
      },
      scrollback: 5000,
      convertEol: true,
    });
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
      fitNow();
      term.focus();
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data);
      term.write(data as any);
    };
    ws.onclose = () => {
      term.writeln("\r\n[disconnected]");
    };
    ws.onerror = () => {
      term.writeln("\r\n[connection error]");
    };

    const inputDisposable = term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "input", data }));
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
    };
  }, []);

  return <div ref={hostRef} className="terminal-host" />;
}
