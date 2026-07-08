// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

/**
 * Parser for `openspec/changes/<changeId>/review.md` — the artifact a
 * review-role agent writes to report its verdict. The frontmatter is
 * the authoritative source; the body markdown is preserved verbatim as
 * a free-form narrative but is not schema-validated.
 *
 * The parser is fail-closed: any schema violation returns `null`. The
 * runner treats a `null` result as "no verdict" and leaves
 * `job.verdict` undefined.
 */

export type ReviewVerdict = "pass" | "needs-rework";
export type ReviewSeverity = "high" | "medium" | "low";

export type ReviewFinding = {
  file?: string;
  line?: number;
  severity: ReviewSeverity;
  message: string;
};

export type ReviewArtifact = {
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
  summary?: string;
  /** Frontmatter-stripped markdown body. Empty string when the file
   *  has no body content. Retained for UI display; not schema-checked. */
  body: string;
};

const VERDICTS: readonly ReviewVerdict[] = ["pass", "needs-rework"];
const SEVERITIES: readonly ReviewSeverity[] = ["high", "medium", "low"];

function isVerdict(v: unknown): v is ReviewVerdict {
  return typeof v === "string" && (VERDICTS as readonly string[]).includes(v);
}

function isSeverity(v: unknown): v is ReviewSeverity {
  return typeof v === "string" && (SEVERITIES as readonly string[]).includes(v);
}

function validateFinding(raw: unknown): ReviewFinding | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isSeverity(o.severity)) return null;
  if (typeof o.message !== "string" || o.message.trim().length === 0) return null;
  const out: ReviewFinding = {
    severity: o.severity,
    message: o.message,
  };
  if (o.file !== undefined) {
    if (typeof o.file !== "string") return null;
    out.file = o.file;
  }
  if (o.line !== undefined) {
    if (typeof o.line !== "number" || !Number.isInteger(o.line) || o.line < 1) {
      return null;
    }
    out.line = o.line;
  }
  return out;
}

/**
 * Parse a raw `review.md` file (frontmatter + body) into a ReviewArtifact.
 * Returns `null` on any schema violation.
 */
export function parseReviewContent(raw: string): ReviewArtifact | null {
  let fm;
  try {
    fm = matter(raw);
  } catch {
    return null;
  }
  const data = fm.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const rec = data as Record<string, unknown>;
  if (!isVerdict(rec.verdict)) return null;

  const findings: ReviewFinding[] = [];
  if (rec.findings !== undefined) {
    if (!Array.isArray(rec.findings)) return null;
    for (const entry of rec.findings) {
      const f = validateFinding(entry);
      if (f === null) return null;
      findings.push(f);
    }
  }

  const out: ReviewArtifact = {
    verdict: rec.verdict,
    findings,
    body: fm.content ?? "",
  };
  if (rec.summary !== undefined) {
    if (typeof rec.summary !== "string") return null;
    out.summary = rec.summary;
  }
  return out;
}

function reviewPath(projectRoot: string, changeId: string): string {
  return join(projectRoot, "openspec", "changes", changeId, "review.md");
}

/**
 * Read and parse the review artifact for a change. Returns null when the
 * file is absent, unreadable, or fails schema validation. Never throws.
 */
export async function parseReview(
  projectRoot: string,
  changeId: string,
): Promise<ReviewArtifact | null> {
  const path = reviewPath(projectRoot, changeId);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return parseReviewContent(raw);
  } catch {
    return null;
  }
}
