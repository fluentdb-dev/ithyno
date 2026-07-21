// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from "react";
import { useStore, type TerminalSize } from "../store";

/**
 * Four-option terminal size toggle rendered in the terminal panel header,
 * immediately to the left of the "Terminal" label. Exposes:
 *   Fullscreen — terminal fills the content area (page content collapses)
 *   Half       — 50/50 split between page content and terminal
 *   Default    — pre-toggle baseline size
 *   Hidden     — unmount terminal panel; only this toggle remains visible
 *
 * State lives in the global store (add-terminal-size-toggle); NOT persisted —
 * resets to "default" on every page reload.
 */
export function TerminalSizeToggle() {
  const terminalSize = useStore((s) => s.terminalSize);
  const setTerminalSize = useStore((s) => s.setTerminalSize);

  const options: { value: TerminalSize; label: string; title: string; icon: ReactNode }[] = [
    {
      value: "fullscreen",
      label: "全画面",
      title: "Fullscreen — terminal fills the content area",
      icon: <FullscreenIcon />,
    },
    {
      value: "half",
      label: "半分",
      title: "Half — split 50/50 with page content",
      icon: <HalfIcon />,
    },
    {
      value: "default",
      label: "今のサイズ",
      title: "Default — restore baseline terminal size",
      icon: <DefaultIcon />,
    },
    {
      value: "hidden",
      label: "非表示",
      title: "Hidden — unmount terminal panel",
      icon: <HiddenIcon />,
    },
  ];

  return (
    <div className="terminal-size-toggle" role="group" aria-label="Terminal size">
      {options.map((opt) => {
        const active = terminalSize === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`terminal-size-btn${active ? " active" : ""}`}
            aria-pressed={active}
            data-state={active ? "active" : "inactive"}
            title={opt.title}
            onClick={() => setTerminalSize(opt.value)}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}

// SVG icon components — 14×14, matching theme-toggle icon pattern.

function FullscreenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function HalfIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}

function DefaultIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="3" y2="21" />
      <line x1="21" y1="3" x2="14" y2="10" />
    </svg>
  );
}

function HiddenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
