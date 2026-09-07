// SPDX-License-Identifier: GPL-3.0-or-later
import { parseSpecContent } from "@ithyno/shared";
import type { DeltaKind, Requirement, SpecDomain } from "../model.js";

/**
 * Parse a spec.md (current spec or change delta) into purpose + requirements +
 * scenarios. Body text for each section is sliced from the source between
 * consecutive headings so it survives arbitrary inline formatting.
 */
export function parseSpec(domain: string, filePath: string, content: string): SpecDomain {
  const parsed = parseSpecContent(domain, filePath, content);
  const requirements: Requirement[] = parsed.requirements.map((requirement) => ({
    name: requirement.name,
    text: requirement.text,
    scenarios: requirement.scenarios.map((scenario) => ({
      name: scenario.name,
      steps: scenario.steps,
    })),
    delta: requirement.delta as DeltaKind,
  }));
  return {
    domain: parsed.domain,
    filePath: parsed.filePath,
    purpose: parsed.purpose,
    requirements,
    delta: parsed.delta as DeltaKind,
    parseError: parsed.parseError,
    raw: parsed.raw,
  };
}
