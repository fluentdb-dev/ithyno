## 1. Catalog architecture and maintainer workflow

- [x] 1.1 Replace runtime inspection with a checked-in JSON capability catalog for Claude Code, Codex, Agy/Antigravity, and GitHub Copilot CLI.
- [x] 1.2 Add a maintainer-only generator script and npm script that guard all allow-listed CLI probes behind an explicit environment flag.
- [x] 1.3 Ensure the generated catalog is stored in a server-side path that stays included in npm, Electron, and VSIX packaging.
- [x] 1.4 Record the catalog schema so aliases, observed source version, supported fields, category metadata, dangerous flags, model guidance, and discoverable models are reviewable in git.

## 2. Runtime API/UI contract and safety

- [x] 2.1 Change `/api/cli/capabilities` into a pure catalog lookup that does not resolve executable paths, time out on runtime inspections, or execute user-environment CLIs.
- [x] 2.2 Keep the model field editable so account and gateway availability can differ from the snapshot in the bundle.
- [x] 2.3 Preserve the manual Advanced args fallback for unknown commands while keeping the command + `args[]` round-trip behavior intact.
- [x] 2.4 Keep category grouping, dangerous controls, and unknown argv round trips deterministic and compatible with the current persistence contract.

## 3. Parser and serializer safety

- [x] 3.1 Preserve per-adapter parsing of recognized builder fields from existing `args[]` while retaining unknown argv elements and their relative order.
- [x] 3.2 Implement conflict detection and deterministic merging of edited structured values with preserved Advanced args.
- [x] 3.3 Ensure prompt/non-interactive transport, change IDs, and artifact-contract values remain excluded from persisted builder args.
- [x] 3.4 Add round-trip tests for quoted/space-containing values, repeated flags, `--flag=value`, unknown options, option values, empty args, and Windows paths.

## 4. Testing, docs, and bundle verification

- [x] 4.1 Replace endpoint tests based on fake executables with deterministic catalog lookup tests and no-subprocess assertions.
- [x] 4.2 Add catalog schema, consistency, and drift tests covering server and web category ordering plus dangerous flags.
- [x] 4.3 Update user documentation to explain that maintainers regenerate the catalog and end users are never scanned or probed.
- [x] 4.4 Run focused tests, full tests, typecheck, build, strict OpenSpec validation, and bundle verification relevant to the shipping package.
