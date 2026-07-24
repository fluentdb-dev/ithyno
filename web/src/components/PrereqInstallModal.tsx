// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * PrereqInstallModal — shared install-progress modal for tmux and agmsg.
 *
 * Consumers: Settings > Prerequisites (add-doctor-and-installer) and
 * InitDialog (expand-init-to-scaffold-agents + inline install UX).
 *
 * Streams `POST /api/doctor/install?tool=<t>` as SSE and shows the output
 * live. Calls `onClose(didInstall)` when the user dismisses.
 */
import { useEffect, useRef, useState } from "react";
import { installPrereq } from "../api";

export function PrereqInstallModal(props: {
  tool: "tmux" | "agmsg";
  onClose: (didInstall: boolean) => void;
}) {
  const { tool, onClose } = props;
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [ok, setOk] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInstallRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const run = async () => {
      try {
        const res = await installPrereq(tool);
        if (!res.ok && res.status !== 200) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          setLines([`Error ${res.status}: ${body.error ?? "install failed"}`]);
          setDone(true);
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          setLines(["No response body — cannot stream progress."]);
          setDone(true);
          return;
        }
        activeReader = reader;
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done: rdDone, value } = await reader.read();
          if (cancelled) break;
          if (value) buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const eventLine = part.split("\n").find((l) => l.startsWith("event: "));
            const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            const eventName = eventLine?.slice(7) ?? "progress";
            const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
            if (eventName === "progress") {
              setLines((prev) => [...prev, String(data.line ?? "")]);
            } else if (eventName === "done") {
              const isOk = data.ok === true;
              setOk(isOk);
              if (isOk) didInstallRef.current = true;
              setDone(true);
            }
          }
          if (rdDone) break;
        }
      } catch (err) {
        if (!cancelled) {
          setLines((prev) => [
            ...prev,
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          ]);
          setDone(true);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      activeReader?.cancel().catch(() => {});
    };
  }, [tool]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="prereq-modal-backdrop">
      <div className="prereq-modal">
        <h3>Installing {tool}…</h3>
        <div className="prereq-modal-output" ref={scrollRef}>
          {lines.map((l, i) => (
            <div key={i} className="prereq-output-line">{l}</div>
          ))}
          {!done && <div className="prereq-output-line prereq-spinner">…</div>}
        </div>
        {done && (
          <p className={ok ? "prereq-ok" : "prereq-missing"}>
            {ok ? `${tool} installed successfully.` : `Install failed.`}
          </p>
        )}
        <div className="prereq-modal-actions">
          <button
            type="button"
            disabled={!done}
            onClick={() => onClose(didInstallRef.current)}
          >
            {done ? "Close" : "Installing…"}
          </button>
        </div>
      </div>
    </div>
  );
}
