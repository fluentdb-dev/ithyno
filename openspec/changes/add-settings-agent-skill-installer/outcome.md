# Outcome — add-settings-agent-skill-installer

## ✅ Worked

- **Per-Agent Skill Status Inspection**: `GET /api/agent-skills` reports structured state for both `openspec` and `ithyno` components. Each component state contains status (`missing | partial | installed | update-available | unsupported`), target paths, and missing/outdated diagnostics.
- **Detailed Target Location Preview**: The frontend dialog retrieves the target locations directly from the inspection API, confirming precisely which project-local paths will be written before the user starts the installation.
- **SSE-based Skill Installer**: Streams progress log, component-result, and a done payload.
- **Concurrency Locking**: A memory lock per `(projectRoot, cli)` ensures that redundant installation requests fail quickly with HTTP 409 without corrupted writes.
- **Error and Cache Isolation**: If the background fetch fails, the store clears the previous cached status, immediately rendering the designated `unknown` state and refresh button.

## ⚠️ Surprises

- **Adapter Output Location Discrepancies**: The initial proposal mapped simple paths (like `.claude/CLAUDE.md`). However, OpenSpec actually writes its command files under directory subtrees like `.claude/commands/opsx/` and `.agent/workflows/`. Updating `CLI_ADAPTERS` to target these real files was necessary to detect the actual installation correctly.

## 🔁 Differently

- **Strict Specification Alignment**: We redesigned the API payload schema early on to group inspected paths and diagnostics under `ComponentInspection`. This strictly matches the specification, enabling the target path previews to be dynamic and informative on the client side.

## 🌱 Follow-ups

- When supporting new Agent CLI tools in the future, their corresponding paths should be added to the `CLI_ADAPTERS` mapping inside `server/agent-skills.ts`.
