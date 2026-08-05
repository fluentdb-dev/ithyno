## 1. Define the portable instruction contract

- [x] 1.1 Add `templates/AGENTS.md`, mirroring the workflow-relevant rules of
  `templates/CLAUDE.md` with CLI-neutral OpenSpec commands.
- [x] 1.2 Document the template's relationship to Codex and other
  AGENTS.md-compatible CLIs without duplicating Claude-only slash-command
  details.

## 2. Preserve scaffold semantics

- [x] 2.1 Confirm `walkTemplates` copies the new file through `runInit`; make
  the smallest implementation adjustment only if the current walker excludes
  it.
- [x] 2.2 Add `runInit` tests for create, skip, and `force` overwrite of
  `AGENTS.md`.
- [x] 2.3 Add a new-project-chain regression test proving Codex initialization
  retains the repository `AGENTS.md` contract after the OpenSpec subprocess.

## 3. Offer Codex in New Project

- [x] 3.1 Add Codex to InitDialog's unverified Manager candidates, retaining
  the verified/unverified distinction.
- [x] 3.2 Update InitDialog candidate tests: detected Codex is offered and
  rendered as unverified; unrelated non-candidate CLIs remain hidden.
- [x] 3.3 Add an integration-level assertion that selecting Codex reaches the
  existing `agents.yaml` and New Project chain plumbing unchanged.

## 4. Make Codex support claims accurate

- [x] 4.1 Add tests that distinguish repository guidance from global Codex
  prompt installation; assert init does not write `CODEX_HOME`.
- [x] 4.2 Audit `server/skill-renderer/renderers/codex.ts` comments and tests;
  remove or qualify any unverified claim that `.codex/prompts/` is discovered
  by Codex.
- [x] 4.3 Record the separately required executable Codex prompt-discovery
  smoke test as a follow-up instead of adding a global side effect.

## 5. Verify and document outcome

- [x] 5.1 Run `npm run openspec -- validate align-codex-init-instructions --strict`.
- [x] 5.2 Run `npm run typecheck && npm test && npm run build`.
- [x] 5.3 Write `outcome.md` before archive, including the verified Codex
  surface and any deferred command-surface work.
