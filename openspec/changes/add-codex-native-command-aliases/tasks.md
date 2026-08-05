## 1. Define and generate the Codex command surface

- [x] 1.1 Add a pure namespace-to-Codex-command resolver with mappings for
  `opsx` → `openspec` and `ithy-opsx` → `ithy-opsx`.
- [x] 1.2 Update the Codex skill renderer to emit `ithy-opsx-<command>.md` and
  add golden tests for its names and frontmatter.
- [x] 1.3 Run upstream OpenSpec initialization with a project-local Codex home
  and rename generated `opsx-*.md` prompts to `openspec-*.md` safely.

## 2. Configure Codex Manager startup

- [x] 2.1 Keep the initialization-only `CODEX_HOME` out of Codex Manager and
  worker runtime environments so existing authentication remains available.
- [x] 2.2 Add initialization tests proving global Codex prompt paths are not
  touched and project prompts are idempotent.

## 3. Use the native command from ithyno UI

- [x] 3.1 Add a pure Manager-command injection resolver.
- [x] 3.2 Update Kanban and ChangeDetail Start flows to use it.
- [x] 3.3 Add Codex and non-Codex injection regression tests.

## 4. Deliver Codex-native worker commands

- [x] 4.1 Add a target-agent CLI + role command resolver for Manager, code,
  review, and verify delivery.
- [x] 4.2 Use the resolver in direct subprocess and agmsg worker prompt
  construction; preserve non-Codex behavior.
- [x] 4.3 Convert Claude commands to project-local Codex prompts and mirror
  Claude skills to Codex skills without promoting commands into skills.
- [x] 4.4 Add role-by-role Codex and non-Codex dispatch regression tests.

## 5. Verify live compatibility

- [x] 5.1 Add an executable Codex prompt-discovery smoke harness using the
  installed supported CLI version and the exact user-facing invocation.
- [x] 5.2 Keep Codex marked `(unverified)` unless the smoke harness passes.
- [x] 5.3 Run `npm run typecheck && npm test && npm run build`.
- [x] 5.4 Run `npm run openspec -- validate add-codex-native-command-aliases --strict`.
- [x] 5.5 Write `outcome.md` before archive.
