import { toString as mdToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { parseMarkdown, toLines } from "./markdown.js";
import type { DeltaKind, Requirement, Scenario, SpecDomain } from "../model.js";

type HeadingInfo = { depth: number; text: string; line: number };

const DELTA_RE = /^(ADDED|MODIFIED|REMOVED)\s+Requirements\b/i;

/**
 * Parse a spec.md (current spec or change delta) into purpose + requirements +
 * scenarios. Body text for each section is sliced from the source between
 * consecutive headings so it survives arbitrary inline formatting.
 */
export function parseSpec(domain: string, filePath: string, content: string): SpecDomain {
  try {
    const tree = parseMarkdown(content);
    const lines = toLines(content);

    const headings: HeadingInfo[] = [];
    visit(tree, (node: any) => {
      if (node.type === "heading" && node.position) {
        headings.push({
          depth: node.depth,
          text: mdToString(node).trim(),
          line: node.position.start.line - 1,
        });
      }
    });
    headings.sort((a, b) => a.line - b.line);

    const bodyAfter = (index: number): string => {
      const start = headings[index].line + 1;
      const end = index + 1 < headings.length ? headings[index + 1].line : lines.length;
      return lines.slice(start, end).join("\n").trim();
    };

    let purpose: string | undefined;
    const requirements: Requirement[] = [];
    let currentDelta: DeltaKind = null;
    let current: Requirement | null = null;

    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];

      if (h.depth === 2) {
        const delta = DELTA_RE.exec(h.text);
        if (delta) {
          currentDelta = delta[1].toUpperCase() as DeltaKind;
        } else if (/^purpose$/i.test(h.text)) {
          purpose = bodyAfter(i);
        }
        current = null;
        continue;
      }

      if (h.depth === 3 && /^requirement:/i.test(h.text)) {
        current = {
          name: h.text.replace(/^requirement:\s*/i, "").trim(),
          text: bodyAfter(i),
          scenarios: [],
          delta: currentDelta,
        };
        requirements.push(current);
        continue;
      }

      if (h.depth === 4 && /^scenario:/i.test(h.text) && current) {
        const steps: Scenario["steps"] = bodyAfter(i)
          .split("\n")
          .map((l) => l.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean);
        current.scenarios.push({
          name: h.text.replace(/^scenario:\s*/i, "").trim(),
          steps,
        });
      }
    }

    const hasDelta = requirements.some((r) => r.delta);
    return {
      domain,
      filePath,
      purpose,
      requirements,
      delta: hasDelta ? "MODIFIED" : null,
    };
  } catch (err) {
    return {
      domain,
      filePath,
      requirements: [],
      parseError: err instanceof Error ? err.message : String(err),
      raw: content,
    };
  }
}
