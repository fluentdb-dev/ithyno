## 1. dotenvx adapter and profile model

- [ ] 1.1 Add and pin the dotenvx runtime dependency used by packaged CLI, Electron, and VSIX builds.
- [ ] 1.2 Add `server/environment/` types and path guards for supported project-root `.env*` profiles, revisions, diagnostics, and selected-profile state.
- [ ] 1.3 Implement the dotenvx adapter for masked parsing, ordered profile resolution, encryption/key-state inspection, and normalized errors.
- [ ] 1.4 Add unit tests for profile discovery, precedence, invalid syntax, escaping symlinks, and reserved `ITHYNO_*` filtering.

## 2. Safe persistence and diagnostics

- [ ] 2.1 Implement project-local selection persistence in `.ithyno/environment.json` without storing environment values.
- [ ] 2.2 Implement revision-checked env mutations with key validation, compatible-line preservation, restrictive temporary-file permissions, and atomic rename.
- [ ] 2.3 Implement secret-safe diagnostics for unreadable files, unsupported syntax, reserved keys, encryption/key state, and risky Git tracking.
- [ ] 2.4 Add tests proving stale writes and path traversal are rejected and plaintext values do not appear in diagnostics or ordinary errors.

## 3. Local authenticated API

- [ ] 3.1 Add authenticated local endpoints for profile discovery, masked variable metadata, selected-profile read/write, and diagnostics.
- [ ] 3.2 Add explicit single-value reveal, mutation, and dotenvx encryption endpoints with request logging redaction.
- [ ] 3.3 Add API validation and regression tests proving list/WebSocket/error payloads never expose plaintext values.

## 4. Development Environment UI

- [ ] 4.1 Add the top-level Environment navigation item and route, separate from Settings and agent configuration.
- [ ] 4.2 Implement profile selection and creation, masked variable table, source/encryption/status display, reload, and empty state.
- [ ] 4.3 Implement explicit reveal/copy/edit/delete actions and a save review showing the exact target file and pending operations.
- [ ] 4.4 Implement diagnostics and restart-required messaging while preserving unsaved drafts across focus and same-session route changes.
- [ ] 4.5 Add component tests for masking, explicit reveal, stale-save recovery, draft persistence, and reserved-key validation.

## 5. Process environment integration

- [ ] 5.1 Add one shared environment composer with documented precedence and authoritative `ITHYNO_*` protection.
- [ ] 5.2 Apply the selected profile to newly spawned Manager PTYs and expose restart-required state for a running Manager.
- [ ] 5.3 Apply the same selected profile to AgentRunner workers, resolving env files from the dashboard project root in worktree mode.
- [ ] 5.4 Add Manager and AgentRunner tests for selected profile injection, no-selection compatibility, worktree behavior, profile changes between jobs, and reserved-key precedence.

## 6. Packaging and documentation

- [ ] 6.1 Include the pinned dotenvx runtime in npm, Electron, and VSIX staging and add bundle-content guards.
- [ ] 6.2 Document the Development Environment screen, `.env*` source-of-truth model, restart behavior, Git warnings, and `ITHYNO_*` reservation.
- [ ] 6.3 Add `outcome.md` with Worked, Surprises, Differently, and Follow-ups sections for archive-time completion.

## 7. Verification

- [ ] 7.1 Run focused environment/API/UI/PTY/AgentRunner tests and the full test suite on supported host platforms.
- [ ] 7.2 Run `npm run typecheck`, `npm run build`, and strict OpenSpec validation.
- [ ] 7.3 Build Electron and VSIX packages and verify dotenvx resolution plus secret-safe behavior from the packaged artifacts.
