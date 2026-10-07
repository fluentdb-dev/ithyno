## Why

Agent configuration currently exposes `args` as a whitespace-separated text field, forcing users to know each CLI's model, reasoning, approval, and sandbox flags and making quoting errors easy. The runtime also must not execute or inspect user-agent CLIs in the local environment. ithyno therefore ships a reviewed capability catalog generated from allow-listed installed CLIs and uses that static catalog at runtime instead of probing the user's machine.

## What Changes

- Add a checked-in generated CLI capability catalog for Claude Code, Codex, Antigravity CLI (`agy`), and GitHub Copilot CLI. The catalog records aliases, observed source version, supported fields, categories, kinds, choices, danger metadata, model guidance, and any models discoverable on the development machine.
- Add a maintainer-only generator script and npm script that may run allow-listed CLI probes only when a maintainer explicitly opts in. The script writes deterministic JSON under the server package so it is included in npm, Electron, and VSIX builds.
- Replace runtime CLI inspection with a pure catalog lookup. The `/api/cli/capabilities` contract stays available for the UI but becomes a static lookup only; it no longer resolves executable paths, caches by runtime probe fingerprint, or times out on live processes.
- Preserve the existing command + `args[]` persistence contract, keep model fields editable, continue to allow unknown commands to fall back to Advanced args, and retain parser/serializer safety and unknown argv round trips.
- Add catalog schema, drift, and consistency tests so the generated JSON stays aligned with the server and web category/danger metadata without invoking any subprocesses at runtime.
- Document that maintainers regenerate the catalog and that end users are not scanned or inspected by the application.

## Capabilities

### New Capabilities

- `agent-cli-command-builder-catalog`: a stable bundled CLI capability catalog used by the runtime command builder instead of live runtime probing.

### Modified Capabilities

- `agent-cli-command-builder`: runtime behavior changes from live discovery to catalog-driven lookup while preserving the existing `command` + `args[]` model and manual fallback experience.

## Impact

- Agent configuration UI and its tests.
- Local server endpoints and CLI adapter modules used by the bundled catalog lookup path.
- `agents.yaml` argument parsing and round-trip behavior; the persisted schema remains compatible because generated values continue to use `command` plus `args[]`.
- Developer-maintained tooling and documentation for regenerating the CLI catalog and explaining why user environments are not scanned.
