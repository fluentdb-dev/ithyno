## 1. OpenSpec Copilot inspection

- [ ] 1.1 Add the native `.github/skills` OpenSpec layout to the Copilot adapter while preserving the prompt-only compatibility layout.
- [ ] 1.2 Add inspection tests for native-only, prompt-only, partial, and missing Copilot OpenSpec states.

## 2. ithyno Copilot rendering

- [ ] 2.1 Extend the Copilot renderer to emit a native `SKILL.md` and the existing command prompt from each supported universal source.
- [ ] 2.2 Update renderer and installation tests to assert both files, translated placeholders, generated provenance, and idempotent reinstallation.

## 3. Live skill probe

- [ ] 3.1 Change the Copilot smoke preflight to require the native test-probe skill path and update its unit coverage.

## 4. Verification

- [ ] 4.1 Run focused agent-skill, renderer, and skill-smoke tests.
- [ ] 4.2 Run typecheck, build, and strict OpenSpec validation for this change.
