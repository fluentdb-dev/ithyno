// SPDX-License-Identifier: GPL-3.0-or-later
import { toString as mdToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import matter from "gray-matter";
import { parseMarkdown, toLines } from "./markdown.js";
import type { ProposalDoc } from "../model.js";

/** Case-insensitive parse of the optional execution field. */
function parseExecution(value: unknown): "worktree" | "terminal" | undefined {
  if (typeof value !== "string") return undefined;
  const canon = value.trim().toLowerCase();
  return canon === "worktree" || canon === "terminal" ? canon : undefined;
}

/** Parse proposal.md into Intent / Scope / Approach sections (best-effort). */
export function parseProposal(filePath: string, content: string): ProposalDoc {
  // Strip frontmatter so the heading scan below sees only the body. The raw
  // string is preserved on the ProposalDoc for the "no parsed sections" fallback.
  const fm = matter(content);
  const body = fm.content;
  const tags =
    Array.isArray(fm.data?.tags)
      ? (fm.data.tags as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
  const execution = parseExecution(fm.data?.execution);
  const doc: ProposalDoc = { filePath, raw: content, tags, execution };
  try {
    const tree = parseMarkdown(body);
    const lines = toLines(body);
    const headings: { text: string; line: number }[] = [];
    visit(tree, (node: any) => {
      if (node.type === "heading" && node.depth === 2 && node.position) {
        headings.push({ text: mdToString(node).trim(), line: node.position.start.line - 1 });
      }
    });
    headings.sort((a, b) => a.line - b.line);

    const bodyAfter = (i: number) => {
      const start = headings[i].line + 1;
      const end = i + 1 < headings.length ? headings[i + 1].line : lines.length;
      return lines.slice(start, end).join("\n").trim();
    };

    headings.forEach((h, i) => {
      if (/^intent$/i.test(h.text) || /why/i.test(h.text)) doc.intent ??= bodyAfter(i);
      else if (/^scope$/i.test(h.text)) doc.scope ??= bodyAfter(i);
      else if (/^approach$/i.test(h.text)) doc.approach ??= bodyAfter(i);
    });
  } catch {
    // fall back to raw only
  }
  return doc;
}
