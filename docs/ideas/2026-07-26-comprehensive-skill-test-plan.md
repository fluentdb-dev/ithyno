---
status: open
tags: [testing, ci, electron, vscode-extension, windows, ithy-opsx, init, scaffold]
source: conversation
related: [distribute-ithy-opsx-via-init-templates, unify-ithyno-slash-command-surface, refactor-import-to-task-tool-subagent]
promoted_to: null
---

# Comprehensive skill testing across Electron / VSCode extension / Windows

Post `distribute-ithy-opsx-via-init-templates` (archived 2026-07-25),
`/ithy-opsx:*` ships **only** via Init template scaffolding — no
user-global install, no HTTP install endpoints, no Doctor row. The dev
repo's `.claude/…` is the source of truth mirrored to
`templates/.claude/…`, byte-identity-guarded in Vitest. This shifts the
testing surface: it's no longer "did the installer copy files" but "does
every consumer (npm CLI / Electron / VSCode extension) drive Init end-
to-end such that the scaffolded target has a working
`/ithy-opsx:*` surface?" This idea captures a test plan across three
axes.

## Testing axes

- **Surface** — how the skill invocation is triggered:
  - `ithyno` npm-installed CLI + `runInit()` scaffold
  - Electron `.app` / `.exe` / `.AppImage` New-Project onboarding
  - VSCode extension "openspec-ui: New Project" command
- **Channel** — the packaging artifact:
  - npm publish tarball
  - Electron packaged bundle (Mac / Win / Linux)
  - VSCode VSIX
- **Platform**:
  - macOS (dev primary)
  - Windows (`HOME` → `USERPROFILE`, path separator, node-pty prebuilt arch)
  - Linux (AppImage, partial)

## Phased plan

### Phase A — Per-PR CI (automated, every commit)

| Item | Command | Purpose |
|---|---|---|
| Drift guard | `npx vitest run server/init.test.ts` | dev-copy ↔ templates/ byte-identity |
| Typecheck | `npx tsc --noEmit` | Type integrity |
| Test suite | `npm test` | Overall health |
| Web build | `npm run build` | Vite bundle |
| **npm-pack assertion (new)** | `npm pack --dry-run \| grep -E '\.claude/'` → only `templates/.claude/…`, no bare `.claude/` | Prevent double-shipping |
| **Init smoke (new)** | Scripted `runInit()` on tmpdir → assert 11 commands + 6 skills present | Scaffold reachability |

### Phase B — Release-build matrix (per release, augment `release-build.mjs`)

| Item | Mechanism |
|---|---|
| Electron 3-OS build | Existing `npm run electron:package:{mac,win,linux}` |
| **Bundled-Init smoke (new)** | Inside packaged `.app`: run `Resources/app/bin/ithyno init <tmp>` → `find` 17 scaffolded files |
| **Electron Doctor sanity (new)** | Start packaged `.app` → `GET /api/doctor` → assert response body has no `ithyOpsx` field |
| VSIX build | Existing `npm run --workspace vscode-extension package` |
| **VSIX Init smoke (new)** | Extension-host activate → invoke `openspec-ui.newProject` on tmp dir → assert scaffold |

### Phase C — Manual smoke (per release, on each OS)

- **Electron startup → New-Project flow** → Init completes → empty Kanban
  renders → Manager PTY opens → typing `/ithy-opsx:apply <id>` resolves
  (Claude Code doesn't report "Unknown command").
- **VSCode extension activate → New Project → Terminal tab** → same
  slash-command resolution.
- **npm global install** on a fresh machine → `ithyno init .` in an
  arbitrary git repo → `.claude/commands/ithy-opsx/*.md` present.
- **Windows-specific**: assert `%USERPROFILE%\.claude\` is untouched
  after server startup (grep server log for absent `[install-skills]`
  line — should never appear).

### Phase D — Runtime skill dispatch e2e (on a scaffolded target)

One end-to-end scenario per skill, run in a scaffolded tmp target
rather than on the dev repo, so we exercise the resolution path a real
user hits:

| Skill | Trigger | Success signal |
|---|---|---|
| `/ithy-opsx:apply` | Manager dispatches code role | Committed `agent/<id>` branch |
| `/ithy-opsx:review` | dispatch review stage | `review.md` written at explicit path |
| `/ithy-opsx:verify` | dispatch verify stage | `review.md` with `pass` \| `needs-rework` |
| `/ithy-opsx:merge` | Kanban Merge button | Merge commit + optional cleanup |
| `/ithy-opsx:archive` | Kanban Archive button | Archive commit + spec updated |
| `/ithy-opsx:dispatch-multi` | Multi-select + dispatch | Each change's phase advances |
| `/ithy-opsx:import` | Import wizard | `GENERATED.md` marker file |
| `/ithy-opsx:escalate` / `:answer` | needs-human flow | Phase transitions correctly |
| `/ithy-opsx:revert` | Manual slash command | `revert-<scope>` change scaffold |

The existing `verify-dispatch-e2e-N` harness (rounds 1–6) is close to
this but runs on the dev repo. Adapting it to run in a scaffolded tmp
target is the missing piece.

## Current gaps

- **No Windows CI runner.** GitHub Actions matrix currently macOS-only.
  Propose `add-windows-ci-matrix` to add `windows-latest` for Phases A/B.
- **`scripts/verify-bundle.mjs` unwritten.** Already flagged as
  Follow-up #5 in `unify-ithyno-slash-command-surface/outcome.md`. This
  script would formalize the Phase B "bundled-init smoke" + "no bare
  `.claude/` in artifacts" checks.
- **Init smoke test layer is thin.** `runInit()` has unit tests, but
  "the scaffolded target has all 11 commands + 6 skills at the expected
  paths" is only asserted transitively via the drift guard. A dedicated
  Phase-A smoke would catch a future regression that touches `bin/init.js`
  or `walkTemplates`.
- **VSIX activation integration test missing.** VSCode extension host
  can be mocked; a real "activate + call `openspec-ui.newProject` +
  assert scaffold" test would catch the Init glue breaking without a
  manual VSIX install.
- **Skill dispatch e2e on scaffolded target.** All `verify-dispatch-e2eN`
  rounds ran on the dev repo. Running the same flow on a scaffolded tmp
  target proves the "ithyno-tied" charter (`/ithy-opsx:*` resolves only
  where scaffolded) end-to-end.

## Recommended implementation order

1. **Phase A additions** — `add-init-scaffold-smoke-test` (Vitest that
   runs `runInit()` on tmp and asserts every ithy-opsx surface file
   lands; plus the npm-pack grep assertion). Small, unblocks the rest.
2. **`scripts/verify-bundle.mjs`** — `add-bundle-verification-script`
   proposal, hooked into `release:build`. Formalizes Phase B.
3. **Windows CI matrix** — `add-windows-ci-matrix` proposal.
   Path-separator + `USERPROFILE` regressions become impossible to ship.
4. **Skill e2e harness on scaffolded target** — `add-skill-e2e-harness`
   proposal. Adapts the `verify-dispatch-e2e-N` shape to run in a tmp
   scaffolded target and exercise every `/ithy-opsx:*` skill.

## Why this belongs as an idea rather than a change today

The distribution refactor (`distribute-ithy-opsx-via-init-templates`)
just landed. Before spinning up 4 separate change proposals, we want to
observe the shape of real regressions over a few dispatch cycles — the
plan above may need reordering or scope-tightening. Save as an idea,
promote items to individual changes as we hit the actual pain.
