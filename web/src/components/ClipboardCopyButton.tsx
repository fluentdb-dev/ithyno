// SPDX-License-Identifier: GPL-3.0-or-later
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";

type ClipboardWriter = Pick<Clipboard, "writeText">;

export async function writeClipboardText(
  text: string,
  clipboard: ClipboardWriter = navigator.clipboard,
): Promise<void> {
  await clipboard.writeText(text);
}

export function useClipboardCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);
  const pushToast = useStore((s) => s.pushToast);

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      await writeClipboardText(text);
      setCopied(true);
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => {
        setCopied(false);
        resetRef.current = null;
      }, 1200);
    } catch {
      pushToast("error", "Copy failed — clipboard permission not granted");
    }
  }, [pushToast, text]);

  useEffect(() => () => {
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
  }, []);

  return { copied, copy };
}

export function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="4.5"
        y="4.5"
        width="8"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M6.5 4.5V3.5A1 1 0 0 1 7.5 2.5h3a1 1 0 0 1 1 1v1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClipboardCopyButton({
  text,
  label,
  title,
  className = "",
}: {
  text: string;
  label: string;
  title?: string;
  className?: string;
}) {
  const { copied, copy } = useClipboardCopy(text);
  return (
    <button
      type="button"
      className={`clipboard-copy-button ${className}`.trim()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void copy();
      }}
      aria-label={label}
      title={title ?? label}
      disabled={!text}
    >
      <CopyIcon copied={copied} />
    </button>
  );
}
