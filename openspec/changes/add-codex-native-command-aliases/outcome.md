## Outcome

Codex-facing names are normalized to `openspec-*` and `ithy-opsx-*` while
Claude and other CLIs retain their slash-command forms. New Project safely
normalizes upstream OpenSpec prompts, Claude command definitions generate
Codex prompts, and only actual Claude skills are mirrored as Codex skills.

Manager UI actions and worker roles resolve against the receiving CLI. Codex
single-prompt workers launch through `codex exec`; Claude workers retain `-p`.
The initialization-only Codex home is not passed to runtime, preserving the
CLI's existing authentication.

The Codex code-worker mapping uses the exact OpenSpec Skill name
`openspec-apply-change`, rather than the nonexistent shorthand
`openspec-apply`. The worker prompt also carries an explicit scope contract
forbidding archive, spec sync, and commit so implementation cannot consume a
later Manager-owned stage.

The executable prompt-discovery harness was added. Its attempted live run was
blocked by unavailable authentication when an isolated runtime home was used,
which also established that runtime homes must not be redirected. Codex stays
visibly `(unverified)` until the exact invocation harness passes with the
supported authenticated CLI.

Verification completed with typecheck, the full 746-test suite, production
build, and strict OpenSpec validation.
