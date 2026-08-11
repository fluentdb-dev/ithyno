// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useState } from "react";
import type { CommandStyle } from "../store";
import { CopyIcon, useClipboardCopy } from "./ClipboardCopyButton";

/**
 * Confirm-and-send modal for /opsx:* (Claude mode) and `npx openspec` (CLI mode)
 * commands. The modal always shows the exact line that will be injected into
 * the terminal, so nothing runs without the user seeing it.
 *
 * When `mode` / `onModeChange` are provided, a segmented control at the top
 * lets the user switch styles per-modal. The consumer's `build` callback is
 * called with the active mode, so input labels and the produced command line
 * adapt to it.
 */
export type CommandModalProps = {
  title: string;
  build: (input: string, mode: CommandStyle) => string;

  mode?: CommandStyle;
  onModeChange?: (mode: CommandStyle) => void;

  initialInput?: string;
  inputLabel?: string | ((mode: CommandStyle) => string);
  inputPlaceholder?: string | ((mode: CommandStyle) => string);
  validateInput?: (input: string, mode: CommandStyle) => boolean;

  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (commandLine: string) => Promise<void> | void;
  /** Optional content rendered between the input/mode selector and the preview (e.g. warnings). */
  children?: React.ReactNode;
};

const KEBAB_RE = /^[a-z][a-z0-9-]*$/;

function resolveStr(
  v: string | ((m: CommandStyle) => string) | undefined,
  m: CommandStyle,
): string | undefined {
  if (typeof v === "function") return v(m);
  return v;
}

export function CommandModal({
  title,
  build,
  mode,
  onModeChange,
  initialInput = "",
  inputLabel,
  inputPlaceholder,
  validateInput,
  submitLabel = "Send",
  onCancel,
  onSubmit,
  children,
}: CommandModalProps) {
  const [input, setInput] = useState(initialInput);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeMode: CommandStyle = mode ?? "claude";
  const preview = build(input, activeMode);
  const { copied, copy: doCopy } = useClipboardCopy(preview);
  const inputValid = validateInput ? validateInput(input, activeMode) : true;
  const canSend = preview.trim().length > 0 && inputValid && !busy;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        const sel = window.getSelection()?.toString() ?? "";
        if (sel.length === 0) {
          e.preventDefault();
          void doCopy();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCancel, preview]);

  const handleSubmit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await onSubmit(preview);
    } finally {
      setBusy(false);
    }
  };

  const resolvedLabel = resolveStr(inputLabel, activeMode);
  const resolvedPlaceholder = resolveStr(inputPlaceholder, activeMode);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        {mode !== undefined && onModeChange && (
          <div className="modal-mode" role="tablist" aria-label="Command style">
            <button
              role="tab"
              aria-selected={activeMode === "claude"}
              className={activeMode === "claude" ? "active" : ""}
              onClick={() => onModeChange("claude")}
            >
              Claude <span className="muted">/opsx:*</span>
            </button>
            <button
              role="tab"
              aria-selected={activeMode === "cli"}
              className={activeMode === "cli" ? "active" : ""}
              onClick={() => onModeChange("cli")}
            >
              CLI <span className="muted">npx openspec</span>
            </button>
          </div>
        )}

        {resolvedLabel && (
          <label className="modal-field">
            <span>{resolvedLabel}</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={resolvedPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSend) handleSubmit();
              }}
            />
            {!inputValid && input.length > 0 && (
              <small className="form-field-error">Invalid input for this mode</small>
            )}
          </label>
        )}

        {children}

        <div className="modal-preview">
          <span className="muted">Will type into the terminal:</span>
          <button
            type="button"
            className="clipboard-copy-button modal-preview-copy"
            onClick={() => void doCopy()}
            aria-label="Copy command"
            title="Copy command"
            disabled={!preview}
          >
            <CopyIcon copied={copied} />
          </button>
          <pre>{preview || " "}</pre>
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={handleSubmit} disabled={!canSend}>
            {busy ? "Sending…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const kebabCaseValid = (s: string): boolean => KEBAB_RE.test(s);
