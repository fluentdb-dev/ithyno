// SPDX-License-Identifier: GPL-3.0-or-later
import { parseProposalContent } from "@ithyno/shared";
import type { ProposalDoc } from "../model.js";

/** Parse proposal.md into Intent / Scope / Approach sections (best-effort). */
export function parseProposal(filePath: string, content: string): ProposalDoc {
  const parsed = parseProposalContent(filePath, content);
  return {
    filePath: parsed.filePath,
    raw: parsed.raw,
    tags: parsed.tags,
    execution: parsed.execution,
    intent: parsed.intent,
    scope: parsed.scope,
    approach: parsed.approach,
  };
}
