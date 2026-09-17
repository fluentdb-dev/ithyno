## Context

The current environment manager discovers and edits project-root `.env*`
profiles, but its resolver uses dotenvx's syntax parser rather than dotenvx's
configuration/decryption path. The abandoned secure-key implementation then
added one generic host-stored key and passed it as `DOTENVX_KEY`, while modern
dotenvx encryption uses `.env.keys` entries such as `DOTENV_PRIVATE_KEY` and
`DOTENV_PRIVATE_KEY_DEVELOPMENT`.

The correction crosses the server adapter, PTY and AgentRunner spawn paths,
the Environment UI, and optional Electron/VS Code storage. It must preserve the
existing guarantees that secret values are not logged or broadcast and that
only resolved application values—not decryption credentials—reach agents.

## Goals / Non-Goals

**Goals:**

- Match dotenvx's standard encrypt, resolve, key-file, profile, and native-store
  semantics.
- Make a local ignored `.env.keys` file the uncomplicated default development
  path.
- Support encrypted profiles in Manager PTYs and workers without propagating
  private-key material to them.
- Present key source and remediation clearly without exposing plaintext.
- Keep optional native/host secure storage additive and profile-aware.
- Add safe env-profile deletion while leaving private-key removal explicit.

**Non-Goals:**

- Defining an ithyno-specific key format or encryption algorithm.
- Replacing dotenvx Armor, 1Password, Bitwarden, or deployment secret stores.
- Automatically deleting private keys when an env profile is deleted.
- Sending private keys to Manager or worker agent processes.

## Decisions

### D1: Use dotenvx configuration resolution, not syntax parsing, for runtime values

The adapter will call the bundled dotenvx library's configuration resolver with
an isolated output object, the ordered profile paths, and the project-root
`.env.keys` path. Dotenvx remains responsible for decryption, profile-specific
private-key lookup, native-store lookup, precedence, and decryption errors.

Syntax parsing may still be used for narrow source-location or editing work,
but parsed encrypted strings MUST NOT be treated as runtime values.

#### Pinned dotenvx 2.23.0 contract (implementation-facing)

The production implementation is intentionally locked to the bundled
`@dotenvx/dotenvx` package version and uses the same API/CLI surfaces that the
worktree's contract tests exercise. The adapter imports the library as
`config as resolveDotenvxConfig` from `@dotenvx/dotenvx` and resolves the
selected profile set with:

```ts
const resolved = resolveDotenvxConfig({
  path: safeOrderedFiles,
  envKeysFile: keyFilePath,
  processEnv: { ...sanitizedParentEnv, ...credentialEnv },
  noNative: inheritedEnv.DOTENVX_NO_NATIVE === "1" || inheritedEnv.DOTENVX_NO_NATIVE === "true",
  quiet: true,
  strict: false,
  ignore: [],
});
```

The runtime contract is `resolved.parsed` for decrypted application values and
`resolved.error.code` for secret-safe failure classification. We only treat
`MISSING_PRIVATE_KEY` and `DECRYPTION_FAILED` as blocking resolution errors; we
never return ciphertext, decrypted key material, or raw key-file values as
application data.

The encryption path uses the bundled CLI entrypoint at
`join(dirname(require.resolve("@dotenvx/dotenvx/package.json")), "src", "cli", "dotenvx.js")`
and invokes it with repeated explicit files:

```bash
node <dotenvx-cli> encrypt -f <profilePath> -fk <projectRoot/.env.keys> [--no-native]
```

The repeated `-f` / `-fk` pattern is required because first-time encryption and
re-encryption both target the concrete profile plus the canonical key file; the
worktree tests deliberately keep the default `.env.keys` path and call the same
flags for every path, including profile-specific keys.

Capability probing and test determinism follow the same rule: when
`DOTENVX_NO_NATIVE` is set to `"1"` or `"true"`, the code adds `--no-native`
to the bundled CLI invocation; the tests assert that this deterministically
bypasses native resolution instead of depending on the host environment. The
standard, non-`--no-native` path remains supported in production when the host
has compatible Native support, but all temporary-project contract tests force the
non-native path to keep the behavior version-stable across hosts.

Alternative: wrap every Manager and worker command in `dotenvx run`. Rejected
because ithyno already composes dashboard, selected-profile, agent, and
authoritative session variables at shared spawn boundaries. Resolving into an
isolated object preserves that architecture while still delegating cryptography
to dotenvx.

### D2: Make `.env.keys` the standard local key source

First-time encryption will invoke the bundled dotenvx CLI with explicit `-f`
and project-root `-fk` paths. It will not require an existing key. Dotenvx may
create or update `.env.keys`; ithyno will verify that the file stays inside the
project root, is a regular non-symlink file, has restrictive permissions where
supported, and is ignored by Git.

If `.env.keys` is tracked, symlinked, outside the project, or cannot be ignored
safely, encryption fails before claiming success. Diagnostics expose file and
key identifiers only, never key values.

### D3: Model profile-specific private-key identifiers

Key state is a set of dotenvx private-key identifiers associated with profiles,
not one generic value. The adapter recognizes the standard
`DOTENV_PRIVATE_KEY` family, including suffixed keys, through dotenvx output or
the `.env.keys` document. It will not maintain a fixed allowlist that omits
future `DOTENV_PRIVATE_KEY_*` identifiers.

Legacy dotenvx variables can be reported separately when the bundled version
supports them, but they do not replace the standard private-key model.

### D4: Keep native and host storage optional

The default UI reports `.env.keys` as the local source and offers explicit
actions rather than opening a generic password field first. Where supported,
dotenvx Native commands are the preferred OS-store integration because they
preserve dotenvx's own key naming and lookup behavior.

VS Code SecretStorage may remain as a host-specific adapter for environments
where the native store is unavailable, but it must store named private-key
entries (or an equivalent versioned key map), never an untyped single key. A
bounded dotenvx operation may receive only the entries required for that
operation. Electron MUST prefer the official native path over a parallel
safeStorage format unless a documented platform limitation requires a fallback.

### D5: Resolve secrets before child launch, then sanitize credentials

The server resolves selected profile values in its bounded operation scope.
Manager PTYs and AgentRunner workers receive the resolved application variables.
All `DOTENV_PRIVATE_KEY` family members, `.env.keys` contents, legacy key
variables, and host-storage payloads are removed from the final child
environment. Sanitization uses prefix-aware matching and Windows
case-insensitive semantics.

### D6: Separate profile deletion from key deletion

The profile-delete endpoint accepts only a discovered project-root regular
`.env*` file, rejects symlinks and missing or escaping paths, names the exact
file in confirmation, and clears the saved selection only after successful
removal. It does not modify `.env.keys` or native/host storage. A remaining key
may be reported as orphaned and removed only through a separate explicit key
operation.

### D7: Supersede the abandoned single-key changes

The `secure-extension-dotenvx-keys` and `secure-electron-dotenvx-keys` proposals
are not implementation inputs after this change is accepted. Reusable IPC,
storage, and test code may be ported only after it satisfies this design. Their
obsolete active change directories and unmerged implementation branches will be
retired separately from the implementation commit so the history remains clear.

## Risks / Trade-offs

- **Dotenvx API behavior changes between versions** → Pin the bundled version,
  keep all calls behind one adapter, and add real encrypted-file contract tests.
- **Native storage availability differs by host and remote environment** → Keep
  `.env.keys` fully supported and present native storage only after a capability
  probe succeeds.
- **Resolved plaintext exists briefly in the ithyno server** → Use isolated
  objects, never mutate `process.env`, redact errors, avoid events/logs, and
  release operation references promptly.
- **Automatically editing `.gitignore` surprises users** → Show the exact
  append-only `.env.keys` action in the encryption confirmation and never
  overwrite unrelated ignore rules.
- **Deleting a profile leaves an orphaned key** → Report it without revealing
  the value and require a separate destructive confirmation to remove it.

## Migration Plan

1. Add real dotenvx fixtures proving first encryption, `.env.keys` creation,
   decryption, profile-specific keys, missing-key failure, and native-disabled
   deterministic behavior.
2. Replace parser-based runtime resolution and the fixed key-variable model.
3. Update encryption and Git-safety handling.
4. Update Manager/worker composition and credential sanitization.
5. Add profile deletion and redesign the key-source UI.
6. Add optional native/host integrations only after the standard path passes.
7. Retire the abandoned secure-key proposals and run package-level smoke tests.

Rollback consists of reverting this change as a unit; existing plaintext
profile editing remains independent of the optional secure-storage adapters.

## Open Questions

- Whether VS Code SecretStorage should ship in the first implementation or
  follow as a separate enhancement after standard and Native paths are stable.
- Whether orphaned key cleanup belongs in this change or should remain a
  diagnostic-only follow-up.
