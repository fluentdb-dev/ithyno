// SPDX-License-Identifier: GPL-3.0-or-later
import type { ReactNode } from "react";
import { useStore, type TerminalSize } from "../store";

/**
 * Single-icon terminal size cycler rendered in the terminal panel header,
 * immediately to the left of the "Terminal" label. Clicking the button
 * advances through the states in a fixed cycle:
 *
 *   default → half → fullscreen → hidden → (anchor restores → default)
 *
 * The rendered icon reflects the CURRENT state, and the tooltip names the
 * NEXT state so users know what one click does.
 *
 * State lives in the global store (add-terminal-size-toggle); NOT persisted —
 * resets to "default" on every page reload.
 */
export function TerminalSizeToggle() {
  const terminalSize = useStore((s) => s.terminalSize);
  const setTerminalSize = useStore((s) => s.setTerminalSize);

  const meta: Record<TerminalSize, { label: string; icon: ReactNode }> = {
    default: { label: "今のサイズ", icon: <DefaultIcon /> },
    half: { label: "半分", icon: <HalfIcon /> },
    fullscreen: { label: "全画面", icon: <FullscreenIcon /> },
    hidden: { label: "非表示", icon: <HiddenIcon /> },
  };

  const nextOf: Record<TerminalSize, TerminalSize> = {
    default: "half",
    half: "fullscreen",
    fullscreen: "hidden",
    hidden: "default",
  };

  const current = meta[terminalSize];
  const nextValue = nextOf[terminalSize];
  const next = meta[nextValue];

  return (
    <button
      type="button"
      className="terminal-size-toggle"
      title={`Terminal size: ${current.label} — click to switch to ${next.label}`}
      aria-label={`Terminal size: ${current.label}. Click to switch to ${next.label}.`}
      onClick={() => setTerminalSize(nextValue)}
    >
      {current.icon}
    </button>
  );
}

/**
 * Standalone terminal-recognizable restore button rendered when
 * `terminalSize === "hidden"`. Terminal chevron glyph makes it obvious
 * which pane this restores. Clicking flips terminalSize back to "default".
 */
export function TerminalHiddenAnchor() {
  const setTerminalSize = useStore((s) => s.setTerminalSize);
  return (
    <button
      type="button"
      className="terminal-restore-btn"
      title="Show terminal"
      aria-label="Show terminal"
      onClick={() => setTerminalSize("default")}
    >
      <TerminalGlyph />
    </button>
  );
}

function TerminalGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
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
