## 1. Root LICENSE (GPL-3.0-or-later)

- [x] 1.1 Create `/LICENSE` with the canonical GPL-3.0 text (verbatim from `gnu.org/licenses/gpl-3.0.txt`)
- [x] 1.2 Prepend / append a short "Subtree license exceptions" note pointing at `templates/LICENSE` (MIT) and `.claude/skills/openspec-flow/LICENSE` (MIT). Keep it brief; the license bodies themselves live in their own files.

## 2. Subtree MIT LICENSE files

- [x] 2.1 Create `/templates/LICENSE` with the standard MIT text (`Copyright (c) <year> <owner>`; leave placeholders concrete — use the current year and the project's primary maintainer name / email)
- [x] 2.2 Create `/.claude/skills/openspec-flow/LICENSE` — same MIT text, same owner line
- [x] 2.3 Confirm that `templates/.claude/skills/openspec-flow/SKILL.md` is understood as MIT via the `templates/LICENSE` above (no third LICENSE file needed since it's under `templates/`)

## 3. SPDX headers on injected files

- [x] 3.1 `templates/CLAUDE.md`: prepend `<!-- SPDX-License-Identifier: MIT -->` as the very first line
- [x] 3.2 `templates/agents.yaml.example`: prepend `# SPDX-License-Identifier: MIT` as the very first line
- [x] 3.3 `templates/.claude/skills/openspec-flow/SKILL.md`: declare via `license: MIT` field inside the frontmatter (SPDX comment before `---` collides with Claude Code's skill loader; frontmatter field is the equivalent statement)
- [x] 3.4 `.claude/skills/openspec-flow/SKILL.md`: same — `license: MIT` inside the frontmatter (canonical source; templates mirror this)

## 4. package.json license fields

- [x] 4.1 `/package.json`: set `"license": "GPL-3.0-or-later"`
- [x] 4.2 `/electron/package.json`: set `"license": "GPL-3.0-or-later"`
- [x] 4.3 `/vscode-extension/host/package.json`: set `"license": "GPL-3.0-or-later"`
- [x] 4.4 Verify no other `package.json` files under `templates/**` need a field — `templates/` doesn't ship as an npm package

## 5. README license section

- [x] 5.1 If `/README.md` does not exist, create a minimal one with project name, one-line description, and a License section
- [x] 5.2 If `/README.md` exists, add / update a `## License` section stating: "The application code is licensed under GPL-3.0-or-later (see `LICENSE`). Files under `templates/` and `.claude/skills/openspec-flow/` are licensed under the MIT License (see the LICENSE files in those directories) so that projects initialized by `ithyno init` can adopt them without inheriting copyleft obligations."

## 6. Verification of runtime dep compatibility

- [x] 6.1 Re-run the license audit script (or `npx license-checker --summary` if installed transiently) against the current lockfile; confirm every runtime dep is one of: MIT / ISC / BSD-2-Clause / BSD-3-Clause / Apache-2.0 / BlueOak-1.0.0 / Python-2.0 / Artistic-2.0 / WTFPL / CC0 / 0BSD / MPL-2.0
- [x] 6.2 Record any surprises in `outcome.md` — expected there are none, given the pre-propose audit found all clean

## 7. Spec delta

- [x] 7.1 `openspec/changes/add-project-license/specs/build-system/spec.md`: ADDED requirement declaring the license split (GPL app + MIT subtrees), the SPDX header convention, and the package.json fields

## 8. Verification

- [x] 8.1 `LICENSE`, `templates/LICENSE`, `.claude/skills/openspec-flow/LICENSE` all present and non-empty
- [x] 8.2 `git ls-files templates | xargs head -1` shows SPDX header lines on the templated files (spot check)
- [x] 8.3 `node -e "console.log(require('./package.json').license)"` prints `GPL-3.0-or-later`; same for the two workspace package.jsons
- [x] 8.4 README's License section reads coherently: someone unfamiliar with the split can figure out what to do with a file they lifted from `templates/`
- [x] 8.5 `npm test && npm run typecheck && npm run build` still pass (no code touched, but sanity check after package.json edits)
- [x] 8.6 Claude Code's `Skill` tool listing still shows `openspec-flow` skill with its description intact (verifies the `license: MIT` frontmatter field doesn't break skill discovery)
