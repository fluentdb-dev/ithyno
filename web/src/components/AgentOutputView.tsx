// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useMemo, useRef } from "react";
import { useStore } from "../store";

/**
 * Plain scrolling output view for an agent job.
 *
 * Data source: the store's `jobOutputs[jobId]` slice, populated from
 * `agent-job-output` WebSocket events. Since the revert of the PTY /
 * xterm / stdin-relay chain, agent stdout is *plain lines* — Claude
 * Code (etc.) runs with `-p "<initial input>"` and never enters TUI
 * mode, so cursor motion / in-place redraws don't happen. That means
 * a simple `<pre>` with append-only content renders correctly; SGR
 * color codes are converted to `<span style="color: …">` inline.
 *
 * Auto-scroll pins the tail unless the user has scrolled up (we detect
 * "user is at the bottom" with a small tolerance and only re-pin if so).
 */
export function AgentOutputView({ jobId }: { jobId: string }) {
  const scrollRef = useRef<HTMLPreElement>(null);
  const isAtBottomRef = useRef(true);
  const chunks = useStore((s) => s.jobOutputs[jobId]);

  const rendered = useMemo(() => renderAnsi(chunks ?? []), [chunks]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [rendered]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const slack = 8;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= slack;
  };

  return (
    <pre
      ref={scrollRef}
      onScroll={onScroll}
      className="agent-output-pre"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

/**
 * Convert a stream of ring-buffer chunks into HTML. Handles:
 *   - SGR color codes (foreground 30-37 / 90-97, bright 90+, reset 0/39)
 *   - Bold (1) as `<b>`; reset via 22 or 0
 *   - Strips all other escape sequences (cursor motion, erase-in-line,
 *     mode toggles). `-p` mode shouldn't emit them, but stay defensive.
 *
 * HTML-escapes `<`, `>`, `&` in the plain text so pasted markup / diffs
 * don't inject nodes.
 */
function renderAnsi(chunks: { stream: string; chunk: string }[]): string {
  const ESC = /\x1b\[([0-9;]*)([A-Za-z])/g;
  const stderrClassOpen = '<span class="agent-stderr">';
  let html = "";
  let openSpans = 0;
  let bold = false;
  const closeAll = () => {
    let s = "";
    if (bold) {
      s += "</b>";
      bold = false;
    }
    while (openSpans > 0) {
      s += "</span>";
      openSpans--;
    }
    return s;
  };
  for (const { stream, chunk } of chunks) {
    const wrapStderr = stream === "stderr";
    if (wrapStderr) html += stderrClassOpen;
    let last = 0;
    ESC.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ESC.exec(chunk)) !== null) {
      html += escapeHtml(chunk.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[2] !== "m") continue; // ignore non-SGR (cursor moves etc.)
      const codes = m[1].length === 0 ? [0] : m[1].split(";").map((s) => parseInt(s, 10) || 0);
      for (const c of codes) {
        if (c === 0) {
          html += closeAll();
        } else if (c === 1) {
          if (!bold) {
            html += "<b>";
            bold = true;
          }
        } else if (c === 22) {
          if (bold) {
            html += "</b>";
            bold = false;
          }
        } else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) {
          const color = SGR_COLORS[c];
          if (color) {
            html += `<span style="color:${color}">`;
            openSpans++;
          }
        } else if (c === 39) {
          if (openSpans > 0) {
            html += "</span>";
            openSpans--;
          }
        }
      }
    }
    html += escapeHtml(chunk.slice(last));
    if (wrapStderr) html += "</span>";
  }
  html += closeAll();
  return html;
}

const SGR_COLORS: Record<number, string> = {
  30: "#4a4a4a",
  31: "#e06c75",
  32: "#98c379",
  33: "#e5c07b",
  34: "#61afef",
  35: "#c678dd",
  36: "#56b6c2",
  37: "#e6e9ef",
  90: "#5c6370",
  91: "#f28b82",
  92: "#b3e28b",
  93: "#f0d68a",
  94: "#82c1ff",
  95: "#d491e0",
  96: "#7dd3d0",
  97: "#ffffff",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
