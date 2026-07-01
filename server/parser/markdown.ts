import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

// Shared remark processor (GFM enables task-list checkbox parsing).
const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdown(content: string): any {
  return processor.parse(content);
}

// Split into lines while remembering nothing about EOL — callers that need to
// rewrite a single line must preserve the original bytes themselves.
export function toLines(content: string): string[] {
  return content.split("\n");
}
