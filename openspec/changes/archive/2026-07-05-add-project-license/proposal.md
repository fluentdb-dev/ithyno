---
tags: [feature/legal, area/repo, area/build]
---

## Why

The project has no LICENSE file and no `license` field in
`package.json`, which under the default "all rights reserved" rule
prevents anyone from redistributing or contributing safely. Two
distinct concerns need distinct answers:

- **The app itself** (`server/`, `web/`, `electron/`, `bin/`) —
  release under **GPL-3.0-or-later** so modifications stay open.
- **Files that get copied verbatim into user projects** via
  `ithyno init` (`templates/**`, and the source-of-truth mirror
  `.claude/skills/openspec-flow/**`) — release under **MIT** so
  user projects don't inherit copyleft obligations from a boiler-
  plate skill file. Without this split, a user's private repo
  might arguably become a GPL-derivative work by adopting the
  workflow files ithyno ships.

A dependency license audit against the current lockfile shows
every runtime dep is GPL-3.0-compatible (MIT / ISC / BSD /
Apache-2.0 / BlueOak / Python / Artistic / WTFPL / CC0 / 0BSD).
CC-BY packages present (`caniuse-lite`, `spdx-exceptions`) are
build-time only and not linked into the shipped artifact. No
AGPL, SSPL, BUSL, or proprietary deps to work around.

## What Changes

- **Root `/LICENSE`** — full GPL-3.0-or-later text, with a
  "Subtree license exceptions" note pointing at the MIT-licensed
  subtrees below.
- **`templates/LICENSE`** — full MIT text. Covers everything
  under `templates/`.
- **`.claude/skills/openspec-flow/LICENSE`** — same MIT text.
  This directory is the canonical source that gets mirrored into
  `templates/.claude/skills/openspec-flow/` and injected into
  user projects.
- **SPDX headers** in the templated files (`templates/CLAUDE.md`,
  `templates/agents.yaml.example`,
  `templates/.claude/skills/openspec-flow/SKILL.md`,
  `.claude/skills/openspec-flow/SKILL.md`) — one-line
  `<!-- SPDX-License-Identifier: MIT -->` (or `#` for YAML)
  at the top so the license attaches to any file lifted
  individually.
- **`package.json`** at repo root — set `"license":
  "GPL-3.0-or-later"`.
- **`electron/package.json`** — set `"license":
  "GPL-3.0-or-later"` (ships the same app code).
- **`vscode-extension/host/package.json`** — set `"license":
  "GPL-3.0-or-later"` (ships app code + templates it copies at
  install time; keep the app-code license here, individual copied
  files carry their own SPDX headers).
- **`README` (or a new README if none exists)** — a "License"
  section that states the split: app = GPL-3.0-or-later, injected
  templates + `openspec-flow` skill = MIT. Point at the LICENSE
  files.

## Capabilities

### Modified Capabilities

- `build-system`: the repo declares its license posture — the app
  is GPL-3.0-or-later; the subtrees that ship into user projects
  are MIT, so downstream adoption doesn't trigger copyleft on the
  user's own code.

## Impact

- `/LICENSE` (new) — GPL-3.0-or-later + subtree note
- `/templates/LICENSE` (new) — MIT
- `/.claude/skills/openspec-flow/LICENSE` (new) — MIT
- `/package.json`, `/electron/package.json`,
  `/vscode-extension/host/package.json` — add `license` field
- `/templates/CLAUDE.md`, `/templates/agents.yaml.example`,
  `/templates/.claude/skills/openspec-flow/SKILL.md`,
  `/.claude/skills/openspec-flow/SKILL.md` — SPDX header line
- `/README.md` (new or updated) — License section

## Out of scope

- **Licensing the other `.claude/skills/ithy-opsx-*` and
  `.claude/skills/openspec-*` skills separately.** They're used
  during development in this repo, not injected into user
  projects, so the root GPL-3.0-or-later covers them.
- **CLA (Contributor License Agreement) setup.** GPL-3.0 alone
  is enough for contribution; DCO / CLA is a governance choice
  best made when a real contributor arrives.
- **Trademark policy.** The name "ithyno" isn't a registered mark
  and this change doesn't create one.
- **Content-license for `docs/**`** (CC-BY-4.0 etc.). Everything
  in `docs/` today is design notes / ideas authored in-repo; they
  fall under the root GPL-3.0-or-later. A separate proposal can
  split docs later if needed.
- **Auto-checking dependency license compatibility on CI.** A
  `license-checker` script is a good follow-up but not part of
  the license declaration itself.
