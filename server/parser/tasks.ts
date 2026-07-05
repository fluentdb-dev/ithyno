// SPDX-License-Identifier: GPL-3.0-or-later
import { toString as mdToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { parseMarkdown, toLines } from "./markdown.js";
import { sha1 } from "../util/hash.js";
import type { Task, TaskList, TaskSection } from "../model.js";

const ID_RE = /^(\d+(?:\.\d+)*)\s+(.*)$/s;

/**
 * Parse a tasks.md file into sections of checkbox tasks.
 * Section grouping follows the document order: each task is assigned to the
 * nearest preceding depth-2 heading. Tasks before any heading land in a
 * synthetic "Tasks" section.
 */
export function parseTasks(filePath: string, content: string): TaskList {
  const baseHash = sha1(content);
  try {
    const tree = parseMarkdown(content);
    const lines = toLines(content);

    const headings: { line: number; title: string }[] = [];
    const rawTasks: Task[] = [];

    visit(tree, (node: any) => {
      if (node.type === "heading" && node.depth === 2 && node.position) {
        headings.push({
          line: node.position.start.line - 1,
          title: mdToString(node).trim(),
        });
      }
      if (node.type === "listItem" && node.checked != null && node.position) {
        const line = node.position.start.line - 1;
        const firstChild = node.children?.[0];
        const label =
          firstChild && firstChild.type === "paragraph"
            ? mdToString(firstChild).trim()
            : mdToString({ ...node, children: node.children ?? [] }).trim();
        const m = ID_RE.exec(label);
        rawTasks.push({
          id: m ? m[1] : "",
          text: m ? m[2].trim() : label,
          checked: Boolean(node.checked),
          line,
          raw: lines[line] ?? "",
          filePath,
        });
      }
    });

    headings.sort((a, b) => a.line - b.line);
    rawTasks.sort((a, b) => a.line - b.line);

    const sections: TaskSection[] = [];
    const sectionByTitle = new Map<string, TaskSection>();

    const sectionFor = (taskLine: number): TaskSection => {
      let title = "Tasks";
      for (const h of headings) {
        if (h.line <= taskLine) title = h.title;
        else break;
      }
      let section = sectionByTitle.get(title);
      if (!section) {
        section = { title, tasks: [] };
        sectionByTitle.set(title, section);
        sections.push(section);
      }
      return section;
    };

    for (const task of rawTasks) {
      sectionFor(task.line).tasks.push(task);
    }

    return { filePath, baseHash, sections };
  } catch (err) {
    return {
      filePath,
      baseHash,
      sections: [],
      parseError: err instanceof Error ? err.message : String(err),
      raw: content,
    };
  }
}

export function countProgress(taskList: TaskList | null): { done: number; total: number } {
  if (!taskList) return { done: 0, total: 0 };
  let done = 0;
  let total = 0;
  for (const section of taskList.sections) {
    for (const task of section.tasks) {
      total++;
      if (task.checked) done++;
    }
  }
  return { done, total };
}
