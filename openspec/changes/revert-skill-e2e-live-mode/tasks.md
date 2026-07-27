# Tasks

## 1. PENDING annotation on landed spec (CLAUDE.md hard rule)

- [x] 1.1 Add `PENDING MODIFIED` blockquote directly under `### Requirement: Ithyno Init scaffolds /ithy-opsx:* into the target project` in `openspec/specs/dashboard/spec.md`, pointing at this change.

## 2. REVERTED annotation on target's archived proposal (Case α)

- [x] 2.1 Add `PARTIALLY REVERTED` blockquote at the top of `openspec/changes/archive/2026-07-26-add-skill-e2e-harness/proposal.md`, immediately after the closing frontmatter delimiter. Cite this change and note that the structural coverage is preserved; only the live-mode aspects are reverted.

## 3. Harness code — strip live mode

- [x] 3.1 Rewrite `scripts/skill-e2e/flows.mjs` — remove all `dispatchClaude` invocations, all live/dry branches, all Manager-side commit blocks, all worktree setup for apply, all HTTP probes. Each flow: fixture setup + server boot + `assertResolvesAndPass` for the skills it covers. Target ~200 LoC (from 821).
- [x] 3.2 Delete `scripts/skill-e2e/claude.mjs` — no longer imported.
- [x] 3.3 Simplify `scripts/skill-e2e.mjs` — remove `--dry-run` flag (structural is the only mode), remove `preflightClaude` call, remove live-mode preflight branch. Keep `--only`, `--keep-tmp`, `--server-port`, `--help`.
- [x] 3.4 Preserve `scripts/skill-e2e/fixture.mjs` `openspec init` step — structural mode still needs `openspec/config.yaml` so the server's `resolveOpenspecDir` returns non-null. Keep the initial commit setup.

## 4. Manual verification doc (new)

- [x] 4.1 Write `docs/skill-e2e-manual-verification.md` covering:
  - Path A: Electron .app (build → onboarding → Manager PTY → per-skill checklist).
  - Path B: VSCode extension (VSIX install → command palette → webview + Terminal panel).
  - Per-skill (11): prep, type, expect, fail modes.
  - Reporting template for release cut ticket.
  - Time budget and frequency guidance.
- [x] 4.2 The doc explicitly names why live automation is not attempted (`claude -p` non-determinism + interactive commit-approval traps in `/ithy-opsx:apply` and `:archive`).

## 5. Verify

- [x] 5.1 `E2E=1 npm run e2e:skills` → 11/11 structural PASS, exit 0, <30 s.
- [x] 5.2 `npm test` → same baseline as before (no regression).
- [x] 5.3 `npm run typecheck` → clean.
- [x] 5.4 `npm run openspec -- validate revert-skill-e2e-live-mode --strict` → VALID.
- [x] 5.5 Manual: read through `docs/skill-e2e-manual-verification.md` and spot-check that per-skill steps reference real UI elements (Terminal tab, Kanban card, Change Detail tab) that exist in the current dashboard.
- [x] 5.6 Write `openspec/changes/revert-skill-e2e-live-mode/outcome.md`.
