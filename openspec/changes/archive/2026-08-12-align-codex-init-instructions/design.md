## Context

`CLAUDE.md` is a Claude Code-specific discovery surface. Codex instead reads
the repository's `AGENTS.md`, so copying only `templates/CLAUDE.md` produces
uneven workflow guidance even when the Manager picker correctly chooses
`codex`.

The copied template stage precedes `openspec init --tools codex` in
`runNewProjectChain`. That order is useful: the project contract exists before
the downstream tool runs, and the existing copy policy already protects a
user-owned instruction file.

## Goals

- Give fresh Codex-managed projects the same proposal-first OpenSpec discipline
  as Claude-managed projects.
- Keep instructions repository-local and versioned with the initialized
  project.
- Preserve idempotence and never overwrite user instructions without `--force`.
- Avoid asserting a Codex prompt discovery path without an executable check.

## Non-Goals

- Installing or modifying prompts in the user's global `CODEX_HOME`.
- Rewriting every ithy-opsx skill for Codex in this change.
- Replacing an existing user-authored `AGENTS.md` through the normal init path.

## Decisions

### D1 — AGENTS.md is the Codex instruction surface

Add `templates/AGENTS.md` as a CLI-neutral fixture. It will carry the same
workflow semantics as the relevant portions of `templates/CLAUDE.md`: propose
before spec-level implementation, validate, implement against tasks, verify,
record an outcome, and archive. It will refer to CLI-neutral `npx openspec`
commands rather than Claude slash commands.

This file is appropriate for all scaffolds, not only Codex: it is a standard
repository instruction surface and remains harmless for Claude users, who
continue to receive `CLAUDE.md`.

### D2 — Reuse the template walker and its overwrite policy

`runInit` already walks all CLI-neutral templates and applies create / skip /
overwrite according to `force`. No special Codex write path is added. The
resulting behavior is deterministic for both the CLI and HTTP/SSE entry paths.

### D3 — Do not use global prompt writes as an init side effect

The installed OpenSpec Codex adapter identifies `CODEX_HOME/prompts` as its
command location. Writing there from a project initializer would unexpectedly
mutate user-level configuration and is not reversible by re-running init.
This change deliberately limits itself to repository guidance. A later Codex
command-surface change must first prove a supported local discovery path, then
adjust the renderer contract and tests.

### D4 — Expose Codex as an unverified New Project Manager

`InitDialog` already separates Manager choices into verified and unverified
sets. Codex is detected by doctor, accepted by the API, written to
`agents.yaml`, and starts through the safe plain-command fallback, but is
currently omitted only by the UI candidate filter. Add it to
`MANAGER_UNVERIFIED`, not `MANAGER_VERIFIED`, so New Project users can choose
it while seeing the same caution applied to other incomplete Manager
integrations. It becomes verified only after a Codex startup/resume strategy
and a tested dispatch command surface exist.

## Risks / Trade-offs

- Two instruction templates can drift. Tests will assert the required workflow
  headings/rules in both templates; a future extraction into a shared source is
  possible if mechanical duplication becomes costly.
- Codex does not gain guaranteed slash-command parity in this change. The
  result is intentionally honest: it fixes the missing instruction contract
  without treating unverified `.codex/prompts` output as working.
- A target may already contain `AGENTS.md`. Skipping it by default follows the
  existing no-clobber contract, but means the user must opt into `--force` or
  merge the guidance manually.
- Enabling an unverified Manager makes the option usable but does not promise
  an unattended dispatch loop; the picker label and tests make that boundary
  explicit.

## Verification

1. Unit-test fresh, existing, and forced `AGENTS.md` behavior through
   `runInit`.
2. Test the template content for the proposal-first lifecycle and neutral
   command references.
3. Run `npm run typecheck`, `npm test`, `npm run build`, and strict OpenSpec
   validation.
