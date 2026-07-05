# Outcome — add-project-license

## ✅ Worked

- Split license posture (GPL-3.0-or-later for the app,
  MIT for `templates/` and `.claude/skills/openspec-flow/`)
  landed as designed. Root LICENSE carries the canonical
  GPL body plus a short "subtree exceptions" prefix that
  points at the two MIT LICENSE files.
- SPDX comment headers on `templates/CLAUDE.md` and
  `templates/agents.yaml.example` (`<!--` and `#` variants
  respectively) so any file lifted individually still
  carries its license.
- `license: MIT` in the frontmatter of both SKILL.md files
  as the equivalent of SPDX comments.
- Dep audit against the current lockfile: all runtime deps
  are permissive-compatible (MIT / ISC / BSD / Apache-2.0
  / BlueOak / Python / Artistic / WTFPL / CC0 / 0BSD). The
  CC-BY packages (`caniuse-lite`, `spdx-exceptions`) are
  build-time only. No AGPL / SSPL / BUSL to work around.
- `npm test`, `npm run typecheck`, `npm run build`,
  `openspec validate add-project-license` all clean.

## ⚠️ Surprises

- **SPDX comment before SKILL.md's frontmatter breaks the
  Claude Code skill loader.** The system-reminder pass at
  skill discovery treated the `<!-- SPDX-License-Identifier:
  MIT -->` line as the skill's description, so the
  `openspec-flow` skill's real description was replaced by
  the license string. Fix: put `license: MIT` inside the
  frontmatter block. Spec + tasks + this outcome all note
  the deviation from the proposal's original "SPDX
  everywhere" approach.
- **`vscode-extension/host/package.json` is git-ignored** —
  it's a build artifact synthesized by
  `vscode-extension/scripts/prepack.mjs`. Editing the
  file in place would be blown away on the next prepack.
  Real fix landed by adding a `license: rootPkg.license`
  line into the synthesized package.json in prepack.mjs;
  the top-level `vscode-extension/package.json` (the VSIX
  manifest) got its own `"license": "GPL-3.0-or-later"`
  entry too so the marketplace listing carries the
  license.
- Copyright owner line initially read `fluentdb-dev
  <fluentdb@hamnbeans.com>` (from the CLAUDE.md
  context header). User corrected to `fluentdb-dev
  <fluentdb@hamnbeans.com>` — 3 LICENSE files updated.
  Neither the CLAUDE.md context email nor the git
  config email was the right public-facing choice; a
  third address (`support@`) turned out to be what the
  project ships with.

## 🔁 Differently

- Nothing on the license split itself — the design held.
- If starting over: check `vscode-extension/host/*` git
  ignore status BEFORE editing anything under it. Same
  discipline for any other synthesized package.json in
  a future workspace.
- Prompt for the copyright owner UPFRONT rather than
  filling in a default and asking to confirm at commit
  time; would have saved the three-file update round.

## 🌱 Follow-ups

- **CI license-checker step.** A GitHub Action running
  `npx license-checker --failOn 'AGPL-3.0;SSPL-1.0;BUSL-1.1'`
  (or similar) would catch a dep that slips in with an
  incompatible license before it lands. Add when GitHub
  Actions setup is proposed.
- **Contributor DCO / CLA.** GPL-3.0 alone is enough for
  contribution, but for a public repo receiving PRs a DCO
  sign-off line in `CONTRIBUTING.md` is cheap and helpful.
- **Docs content license.** Everything in `docs/`
  (including `docs/ideas/`) currently falls under root
  GPL. If public documentation gets serious traction, a
  CC-BY-4.0 subtree exception for `docs/` would let
  people quote / adapt writing without the GPL
  attribution requirements. Not urgent.
- **Trademark clarity.** "ithyno" isn't a registered
  mark. If the project grows, a short trademark policy
  page would help downstream forks distinguish
  themselves from the upstream distribution.
