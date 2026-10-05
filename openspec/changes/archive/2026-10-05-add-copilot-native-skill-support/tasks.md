## 1. OpenSpec Copilot inspection

- [x] 1.1 Add the native `.github/skills` OpenSpec layout to the Copilot adapter while preserving the prompt-only compatibility layout.
- [x] 1.2 Add inspection tests for native-only, prompt-only, partial, and missing Copilot OpenSpec states.

## 2. ithyno Copilot rendering

- [x] 2.1 Extend the Copilot renderer to emit a native `SKILL.md` and the existing command prompt from each supported universal source.
- [x] 2.2 Update renderer and installation tests to assert both files, translated placeholders, generated provenance, and idempotent reinstallation.

## 3. Live skill probe

- [x] 3.1 Change the Copilot smoke preflight to require the native test-probe skill path and update its unit coverage.

## 4. Verification

- [x] 4.1 Run focused agent-skill, renderer, and skill-smoke tests.
- [x] 4.2 Run typecheck, build, and strict OpenSpec validation for this change.

## 5. Copilot notification control

- [x] 5.1 Expose the existing Copilot notification Hook toggle on the installed Copilot Prerequisites row without coupling it to Skill installation.
- [x] 5.2 Add focused tests for Copilot notification-control availability and rerun typecheck, build, and strict OpenSpec validation.
