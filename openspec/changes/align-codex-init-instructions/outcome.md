## Outcome

New Project initialization now gives Codex and other AGENTS.md-compatible
CLIs the repository workflow contract without replacing user-authored files.
Codex is offered as an unverified Manager, and the Codex initialization chain
restores `AGENTS.md` after the upstream OpenSpec subprocess.

Codex generation is isolated from the user's global prompt directory. Runtime
does not inherit that initialization-only `CODEX_HOME`, because the live CLI
also reads authentication from its normal home.

Verification completed with typecheck, the full 746-test suite, production
build, and strict OpenSpec validation.
