import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "../store";
import { sendAgentInput } from "../api";

/**
 * Interactive xterm view for an agent job.
 *
 * Data source: the store's `jobOutputs[jobId]` slice, which accumulates every
 * `agent-job-output` WebSocket event since the app started.
 *
 * We attach directly to `useStore.subscribe` (imperative zustand API) rather
 * than reading `outputs` via a `useStore(selector)` hook + `useEffect([outputs])`.
 * The subscribe pattern is simpler to reason about with React 19 StrictMode's
 * double-mount semantics: setup runs, cleanup runs, setup runs again — each
 * time we re-seed from the current store snapshot and start a fresh subscription
 * scoped to *this* mount. No stale refs from a torn-down mount can survive to
 * confuse the second one.
 *
 * Interactive input: user keystrokes captured via `term.onData` are forwarded
 * to the agent's PTY through `POST /api/agents/jobs/:id/input` with
 * `appendNewline: false` — xterm produces terminal-correct bytes (\r for
 * Enter, \x1b[A for Up, etc.), so the server does not need to append anything.
 */
export function AgentOutputView({ jobId }: { jobId: string }) {
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
      scrollback: 10_000,
      convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    const fitNow = () => {
      try {
        fit.fit();
      } catch {
        /* container may not be measurable yet */
      }
    };
    fitNow();
    requestAnimationFrame(fitNow);

    let lastWrittenLen = 0;

    // Write any store chunks we haven't written yet, then advance the pointer.
    // Called once for seed and again whenever the store slice changes.
    const writeUnwritten = () => {
      const slice = useStore.getState().jobOutputs[jobId];
      if (!slice) return;
      if (slice.length <= lastWrittenLen) return;
      for (let i = lastWrittenLen; i < slice.length; i++) {
        term.write(slice[i].chunk);
      }
      lastWrittenLen = slice.length;
    };

    // Seed from current snapshot before subscribing so we don't miss anything
    // in the tiny window between construction and the first subscription tick.
    writeUnwritten();

    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.jobOutputs[jobId] !== prev.jobOutputs[jobId]) writeUnwritten();
    });

    const inputDisposable = term.onData((data) => {
      void sendAgentInput(jobId, data, false).catch((err) => {
        console.error("[agent-terminal] input send failed:", err);
      });
    });

    const ro = new ResizeObserver(() => fitNow());
    ro.observe(host);
    window.addEventListener("resize", fitNow);

    return () => {
      window.removeEventListener("resize", fitNow);
      ro.disconnect();
      unsubscribe();
      inputDisposable.dispose();
      term.dispose();
    };
  }, [jobId]);

  return <div ref={hostRef} className="agent-terminal-container" />;
}
