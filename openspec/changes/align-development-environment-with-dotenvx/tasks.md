## 1. Lock the dotenvx contract

- [x] 1.1 Add temporary-project integration fixtures that use the bundled dotenvx to encrypt a plaintext `.env` and `.env.development`, generate `.env.keys`, and resolve the original values.
- [x] 1.2 Add failing regression tests proving the current parser-only resolver returns ciphertext, first encryption is incorrectly blocked without a pre-existing key, and suffixed `DOTENV_PRIVATE_KEY_*` credentials are not modelled safely.
- [x] 1.3 Document and pin the bundled dotenvx APIs and CLI arguments used for config resolution, `-f`, `-fk`, native capability probing, and deterministic `--no-native` tests.

## 2. Replace the environment resolver

- [x] 2.1 Implement one dotenvx adapter that resolves the ordered base/selected profiles into an isolated object using the project-root `.env.keys` path and normalized secret-safe errors.
- [x] 2.2 Separate syntax/source metadata from resolved runtime values so ciphertext is never returned as an application value after decryption failure.
- [x] 2.3 Replace the fixed key allowlist with profile-aware `DOTENV_PRIVATE_KEY` family handling plus explicitly supported legacy credentials.
- [x] 2.4 Add diagnostics for missing, wrong, unreadable, symlinked, tracked, and orphaned key-file state without exposing private values.

## 3. Restore standard encryption behavior

- [x] 3.1 Change first-time encryption to invoke bundled dotenvx with explicit project-root `-f` and `-fk` paths without requiring a preconfigured private key.
- [x] 3.2 Validate `.env.keys` as a project-root regular non-symlink file, apply restrictive permissions where supported, and append an exact `.env.keys` Git-ignore rule after user confirmation without rewriting unrelated rules.
- [x] 3.3 Refuse unsafe or Git-tracked key files and preserve pre-operation files/state when dotenvx encryption fails.
- [x] 3.4 Add standard lifecycle tests for existing keys, new profile-specific keys, repeated encryption, missing keys, and wrong keys.

## 4. Isolate credentials from child processes

- [ ] 4.1 Feed dotenvx-resolved application values into the shared Manager PTY and AgentRunner environment composition paths.
- [ ] 4.2 Remove every case-insensitive `DOTENV_PRIVATE_KEY` family member and supported legacy key credential from final child environments without removing normal application variables.
- [ ] 4.3 Add Manager, attached worker, detached worker, adopted worker, worktree, and Windows-casing regression tests proving decrypted values arrive while credentials do not.

## 5. Redesign Environment key and profile UI

- [ ] 5.1 Replace generic key-entry-first UI with selected-profile encryption state, key-source status, `.env.keys` guidance, and exact first-encryption/Git-ignore confirmation.
- [ ] 5.2 Probe bundled dotenvx Native support and expose explicit Native move/copy actions only when the active host can support them; keep `.env.keys` fully usable otherwise.
- [ ] 5.3 Add an authenticated profile-delete API and exact-path confirmation that accepts only discovered project-root regular env files, clears selection/transient state after success, and never removes keys implicitly.
- [ ] 5.4 Add UI and API tests for first encryption, ready/missing/wrong key states, native-unavailable fallback, profile deletion, and orphaned-key guidance.

## 6. Retire incompatible secure-key work

- [ ] 6.1 Remove the abandoned single-generic-key assumptions from active documentation and code, retaining only pieces that use named dotenvx private-key semantics.
- [ ] 6.2 Retire the superseded `secure-extension-dotenvx-keys` and `secure-electron-dotenvx-keys` active change directories after confirming every retained requirement is represented here.
- [ ] 6.3 Record in `outcome.md` which host-specific storage work was replaced by dotenvx Native and which, if any, remains a future enhancement.

## 7. Documentation, packaging, and verification

- [ ] 7.1 Update user documentation for encrypted `.env*`, ignored `.env.keys`, environment-specific private keys, dotenvx Native, CI secret variables, and profile deletion.
- [ ] 7.2 Add package-staging smoke tests that run the standard key-file lifecycle against bundled dotenvx in Electron and VS Code hosts without a global dotenvx installation.
- [ ] 7.3 Run focused environment/UI/PTY/AgentRunner tests, the full test suite, typecheck, web/Electron/VS Code builds, package guards, and strict OpenSpec validation.
