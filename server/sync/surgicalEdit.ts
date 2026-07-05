// SPDX-License-Identifier: GPL-3.0-or-later
import { sha1 } from "../util/hash.js";

// Strict checkbox marker matcher. Captures everything around the single state
// character so only that one character is ever rewritten — task text, leading
// indentation (spaces OR tabs), list marker (- or *), continuation lines, and
// trailing comments are left byte-for-byte untouched.
export const CHECKBOX_RE = /^([ \t]*[-*][ \t]*\[)[ xX](\][ \t]+)/;

export function isCheckboxLine(line: string): boolean {
  return CHECKBOX_RE.test(line);
}

/** Set a checkbox line's state, preserving all surrounding bytes. */
export function setCheckbox(line: string, checked: boolean): string {
  return line.replace(CHECKBOX_RE, `$1${checked ? "x" : " "}$2`);
}

export type ToggleRequest = {
  line: number; // 0-based line the UI observed
  expectedText: string; // exact original text of that line
  baseHash: string; // hash of the file the UI last observed
  desiredChecked: boolean; // the state to write
};

export type ToggleResult =
  | {
      status: "ok";
      newContent: string;
      newHash: string;
      editedLine: number;
      newLineText: string;
    }
  | { status: "conflict"; reason: string }
  | { status: "invalid"; reason: string };

/**
 * Apply a checkbox toggle to file content using a 2-stage optimistic strategy
 * (see docs/architecture.md §6.2):
 *   1. hash match  -> edit the given line directly (fast path)
 *   2. hash miss   -> fall back to expectedText to absorb line drift:
 *        a. given line still equals expectedText -> edit it
 *        b. exactly one line in the file equals expectedText -> edit that line
 *        c. zero or multiple matches -> real conflict (409)
 */
export function applyToggle(content: string, req: ToggleRequest): ToggleResult {
  const lines = content.split("\n");
  const currentHash = sha1(content);

  let idx: number;
  if (currentHash === req.baseHash) {
    idx = req.line;
  } else if (lines[req.line] === req.expectedText) {
    idx = req.line;
  } else {
    const matches: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === req.expectedText) matches.push(i);
    }
    if (matches.length === 1) {
      idx = matches[0];
    } else {
      return {
        status: "conflict",
        reason:
          matches.length === 0
            ? "The target task line was modified externally."
            : "The target task line is ambiguous after an external edit.",
      };
    }
  }

  const original = lines[idx];
  if (original == null || !isCheckboxLine(original)) {
    return { status: "conflict", reason: "Target line is no longer a checkbox task." };
  }

  const newLineText = setCheckbox(original, req.desiredChecked);
  if (newLineText === original) {
    // Already in the desired state — treat as a no-op success.
    return {
      status: "ok",
      newContent: content,
      newHash: currentHash,
      editedLine: idx,
      newLineText,
    };
  }

  lines[idx] = newLineText;
  const newContent = lines.join("\n");
  return {
    status: "ok",
    newContent,
    newHash: sha1(newContent),
    editedLine: idx,
    newLineText,
  };
}
