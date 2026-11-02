// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { extractReleaseNotes } from "./extract-release-notes.mjs";

describe("extractReleaseNotes", () => {
  it("extracts only the requested version and accepts a v-prefixed tag", () => {
    const changelog = `# Changelog

## [1.2.0-alpha.1] - 2026-11-02

### Added

- New feature.

## [1.1.0] - 2026-10-01

- Old feature.
`;

    const notes = extractReleaseNotes(changelog, "v1.2.0-alpha.1");
    expect(notes).toContain("New feature.");
    expect(notes).not.toContain("Old feature.");
    expect(notes).toContain("## Downloads");
  });

  it("rejects a missing or empty version section", () => {
    expect(() => extractReleaseNotes("# Changelog\n", "1.0.0")).toThrow(
      "CHANGELOG section not found for 1.0.0",
    );
    expect(() => extractReleaseNotes("## [1.0.0]\n", "1.0.0")).toThrow(
      "CHANGELOG section for 1.0.0 is empty",
    );
  });
});
