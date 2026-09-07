// SPDX-License-Identifier: GPL-3.0-or-later
import { toString as mdToString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
const processor = unified().use(remarkParse).use(remarkGfm);
export const SUPPORTED_HUB_EVENT_VERSION = 1;
function parseExecution(value) {
    if (typeof value !== "string")
        return undefined;
    const canon = value.trim().toLowerCase();
    return canon === "worktree" || canon === "terminal" ? canon : undefined;
}
export function parseProposalContent(filePath, content) {
    const fm = matter(content);
    const body = fm.content;
    const tags = Array.isArray(fm.data?.tags)
        ? fm.data.tags.filter((t) => typeof t === "string")
        : [];
    const execution = parseExecution(fm.data?.execution);
    const proposal = { filePath, raw: content, tags, execution };
    try {
        const tree = processor.parse(body);
        const lines = body.split("\n");
        const headings = [];
        visit(tree, (node) => {
            if (node.type === "heading" && node.depth === 2 && node.position) {
                headings.push({ text: mdToString(node).trim(), line: node.position.start.line - 1 });
            }
        });
        headings.sort((a, b) => a.line - b.line);
        const bodyAfter = (index) => {
            const start = headings[index].line + 1;
            const end = index + 1 < headings.length ? headings[index + 1].line : lines.length;
            return lines.slice(start, end).join("\n").trim();
        };
        headings.forEach((heading, index) => {
            if (/^intent$/i.test(heading.text) || /why/i.test(heading.text))
                proposal.intent ??= bodyAfter(index);
            else if (/^scope$/i.test(heading.text))
                proposal.scope ??= bodyAfter(index);
            else if (/^approach$/i.test(heading.text))
                proposal.approach ??= bodyAfter(index);
        });
    }
    catch {
        // preserve the minimal fallback above
    }
    return proposal;
}
const DELTA_RE = /^(ADDED|MODIFIED|REMOVED)\s+Requirements\b/i;
export function parseSpecContent(domain, filePath, content) {
    try {
        const tree = processor.parse(content);
        const lines = content.split("\n");
        const headings = [];
        visit(tree, (node) => {
            if (node.type === "heading" && node.position) {
                headings.push({ depth: node.depth, text: mdToString(node).trim(), line: node.position.start.line - 1 });
            }
        });
        headings.sort((a, b) => a.line - b.line);
        const bodyAfter = (index) => {
            const start = headings[index].line + 1;
            const end = index + 1 < headings.length ? headings[index + 1].line : lines.length;
            return lines.slice(start, end).join("\n").trim();
        };
        let purpose;
        const requirements = [];
        let currentDelta = null;
        let current = null;
        for (let index = 0; index < headings.length; index++) {
            const heading = headings[index];
            if (heading.depth === 2) {
                const delta = DELTA_RE.exec(heading.text);
                if (delta) {
                    currentDelta = delta[1].toUpperCase();
                }
                else if (/^purpose$/i.test(heading.text)) {
                    purpose = bodyAfter(index);
                }
                current = null;
                continue;
            }
            if (heading.depth === 3 && /^requirement:/i.test(heading.text)) {
                current = {
                    name: heading.text.replace(/^requirement:\s*/i, "").trim(),
                    text: bodyAfter(index),
                    scenarios: [],
                    delta: currentDelta,
                };
                requirements.push(current);
                continue;
            }
            if (heading.depth === 4 && /^scenario:/i.test(heading.text) && current) {
                const steps = bodyAfter(index)
                    .split("\n")
                    .map((line) => line.replace(/^[-*]\s*/, "").trim())
                    .filter(Boolean);
                current.scenarios.push({ name: heading.text.replace(/^scenario:\s*/i, "").trim(), steps });
            }
        }
        const hasDelta = requirements.some((requirement) => requirement.delta);
        return {
            domain,
            filePath,
            purpose,
            requirements,
            delta: hasDelta ? "MODIFIED" : null,
        };
    }
    catch (error) {
        return {
            domain,
            filePath,
            requirements: [],
            parseError: error instanceof Error ? error.message : String(error),
            raw: content,
            delta: null,
        };
    }
}
export function buildHubEventEnvelope(payload) {
    return {
        version: SUPPORTED_HUB_EVENT_VERSION,
        type: payload.type,
        projectId: payload.projectId,
        title: payload.title,
        body: payload.body,
        targetUrl: payload.targetUrl,
        occurredAt: payload.occurredAt ?? new Date().toISOString(),
    };
}
export function isSupportedHubEventVersion(version) {
    return version === SUPPORTED_HUB_EVENT_VERSION;
}
