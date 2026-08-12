## Outcome

Added the Claude-authoritative `ithy-opsx-test-probe`, template drift coverage,
Codex skill mirroring, a Claude-derived universal source rendered for all seven
supported CLIs, and an opt-in live harness selected through an `agents.yaml`
probe role. The deterministic core distinguishes configuration, initialization,
skill-path, subprocess, timeout, and artifact failures, and accepts only a
nonce-matched JSON artifact as success.

The live harness uses an isolated temporary project. OpenSpec is run only as a
prerequisite setup step and is not a success signal. ithyno skills remain
project-local; nothing is installed into the user's global ithyno/Codex skill
surface.

Live results:

- Codex probe: passed and wrote a schema-valid, nonce-matched artifact.
- Claude probe: invoked through the same fixture but could not run because the
  environment's OAuth access token was revoked; the harness correctly reported
  a subprocess-layer failure with diagnostics.

Verification includes 12 deterministic harness tests, all-seven-renderer
materialization coverage, initialization/package-shape tests, typecheck, the
full 746-test suite, production build, strict OpenSpec validation, and a
successful live Codex nonce-artifact probe.
