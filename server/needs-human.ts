// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Read / write / parse for `openspec/changes/<id>/needs-human.md`.
 *
 * The artifact is a human-readable markdown file with a stable shape:
 *
 *   # <question>
 *
 *   ## Context           (optional; omitted when no context was supplied)
 *   <context body>
 *
 *   ## Answer            (only after the escalation is answered)
 *   <answer body>
 *
 *   ---
 *   answered: false      (footer; flipped to `answered: true` on resolution)
 *
 * The footer is authoritative: the server treats a file whose footer reads
 * `answered: true` as a completed escalation and restores the change's
 * prior phase (see server/index.ts's watcher hook). Missing footer is
 * tolerated (warned + treated as unanswered) so a hand-edited file never
 * crashes the parse path.
 */

export type NeedsHumanDoc = {
  question: string;
  context: string | null;
  answer: string | null;
  answered: boolean;
};

function needsHumanPath(projectRoot: string, changeId: string): string {
  return join(projectRoot, "openspec", "changes", changeId, "needs-human.md");
}

function normalizeMultiline(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

/** Render the artifact from parts. Trailing newline for POSIX-friendliness. */
function renderNeedsHuman(doc: NeedsHumanDoc): string {
  const parts: string[] = [];
  parts.push(`# ${doc.question.trim()}`);
  parts.push("");
  if (doc.context && doc.context.trim()) {
    parts.push("## Context");
    parts.push("");
    parts.push(doc.context.trim());
    parts.push("");
  }
  if (doc.answered && doc.answer && doc.answer.trim()) {
    parts.push("## Answer");
    parts.push("");
    parts.push(doc.answer.trim());
    parts.push("");
  }
  parts.push("---");
  parts.push(`answered: ${doc.answered ? "true" : "false"}`);
  parts.push("");
  return parts.join("\n");
}

/**
 * Write a fresh escalation artifact. Overwrites any existing file at the
 * path (re-escalation after a resolved answer is a fresh document — git
 * history preserves the prior one).
 */
export async function writeNeedsHuman(
  projectRoot: string,
  changeId: string,
  question: string,
  context?: string,
): Promise<void> {
  const doc: NeedsHumanDoc = {
    question,
    context: context ?? null,
    answer: null,
    answered: false,
  };
  await writeFile(needsHumanPath(projectRoot, changeId), renderNeedsHuman(doc), "utf8");
}

/**
 * Append an answer and flip the footer. Requires the file to exist and to
 * be parseable — otherwise throws (the caller is expected to guard with
 * `phase === "needs-human"` before invoking).
 */
export async function appendAnswer(
  projectRoot: string,
  changeId: string,
  answer: string,
): Promise<void> {
  const existing = await parseNeedsHuman(projectRoot, changeId);
  if (!existing) throw new Error(`needs-human.md missing for change ${changeId}`);
  const next: NeedsHumanDoc = {
    question: existing.question,
    context: existing.context,
    answer,
    answered: true,
  };
  await writeFile(needsHumanPath(projectRoot, changeId), renderNeedsHuman(next), "utf8");
}

/**
 * Parse a needs-human.md. Returns null if the file is absent. A file
 * with a missing / malformed footer is treated as unanswered (with a
 * warning) — hand-edited files should still render, not crash the parse.
 */
export async function parseNeedsHuman(
  projectRoot: string,
  changeId: string,
): Promise<NeedsHumanDoc | null> {
  const path = needsHumanPath(projectRoot, changeId);
  if (!existsSync(path)) return null;
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw == null) return null;
  return parseNeedsHumanContent(raw, changeId);
}

/** Pure-function parse split out for testing. */
export function parseNeedsHumanContent(raw: string, changeId: string): NeedsHumanDoc {
  const text = normalizeMultiline(raw);
  const lines = text.split("\n");

  // Question: the first non-empty H1 line.
  let question = "";
  let cursor = 0;
  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (line.startsWith("# ")) {
      question = line.slice(2).trim();
      cursor++;
      break;
    }
    if (line.trim() !== "") {
      // First non-empty line was not an H1 — tolerate by using the whole
      // line as the question and continuing.
      question = line.trim();
      cursor++;
      break;
    }
  }

  // Split remaining body into ## sections. We only care about "## Context"
  // and "## Answer"; any others are ignored.
  let context: string | null = null;
  let answer: string | null = null;
  let currentSection: "context" | "answer" | null = null;
  let currentLines: string[] = [];
  const commit = () => {
    const body = currentLines.join("\n").trim();
    if (!body) return;
    if (currentSection === "context") context = body;
    else if (currentSection === "answer") answer = body;
  };
  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (line === "---") {
      commit();
      currentSection = null;
      currentLines = [];
      cursor++;
      break;
    }
    if (line.startsWith("## ")) {
      commit();
      const heading = line.slice(3).trim().toLowerCase();
      if (heading === "context") currentSection = "context";
      else if (heading === "answer") currentSection = "answer";
      else currentSection = null;
      currentLines = [];
      continue;
    }
    if (currentSection) currentLines.push(line);
  }

  // Footer: search remaining lines for `answered: <bool>`. Tolerate absence.
  let answered = false;
  let sawFooter = false;
  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor].trim();
    const m = /^answered:\s*(true|false)\s*$/i.exec(line);
    if (m) {
      answered = m[1].toLowerCase() === "true";
      sawFooter = true;
      break;
    }
  }
  if (!sawFooter) {
    console.warn(
      `[needs-human] ${changeId}: footer missing — treating as unanswered`,
    );
  }

  return { question, context, answer, answered };
}
