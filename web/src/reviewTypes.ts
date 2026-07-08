// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Client mirror of `server/agents/review-parser.ts`'s exported types.
 * Hand-synced with the server side — the shape is small and stable, so
 * keeping it as a mirror avoids introducing a build-time codegen step.
 * If the server's types change, update this file in the same PR.
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
  body: string;
};
