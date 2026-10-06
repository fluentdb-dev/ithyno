# Agent CLI command builder

This UI uses the installed CLI's runtime help and model discovery signal as the authoritative source for supported fields. It never hard-codes a model catalog for a CLI; when a native discovery path is unavailable, the dialog keeps the model field editable and shows explicit manual fallback guidance instead.

See the source research note at [docs/ideas/2026-10-06-agent-cli-command-builder-research.md](../ideas/2026-10-06-agent-cli-command-builder-research.md) for the original discovery notes and version-dependent caveats.

## Supported field behavior

The builder only renders fields that the selected CLI reports in its installed `--help` output. Each adapter advertises a small allow-list of known flags and the UI omits any flag the current version does not mention.

- Claude Code: `--model`, `--effort`, `--permission-mode`, `--dangerously-skip-permissions`
- Codex: `--model`, `--profile`, `--sandbox`, `--ask-for-approval`, `--approve-for-me`, `--dangerously-bypass-approvals-and-sandbox`
- Antigravity (`agy`): `--model`, `--effort`, `--mode`, `--sandbox`, `--dangerously-skip-permissions`
- GitHub Copilot CLI: `--model`, `--reasoning-effort`, `--context`, `--auto-tier`, `--mode`, `--allow-all`, `--yolo`

Dangerous controls remain visible but are labeled as dangerous before save, and they are off by default unless the user enables them intentionally.

## Model discovery and fallback

The model field is always editable. Native discovery is preferred when the CLI exposes a verified non-interactive method, but the saved config remains valid even when discovery fails or times out.

- `agy`: preferred model source is `agy models`
- Codex: preferred model source is the app-server `model/list` call after the JSON-RPC initialize handshake
- Claude Code and Copilot: no verified non-interactive model catalog is available in this environment; the UI keeps manual model entry enabled and shows the CLI-specific guidance to inspect models interactively

When a native probe fails, times out, or returns malformed output, ithyno keeps the rest of the structured fields visible and does not mark the adapter as unsupported. The model field stays editable, and the user can type a model name or reuse a previous value.

## Version dependence and compatibility

The server probes each CLI with a bounded non-shell process and caches the result by executable path + probe fingerprint. That keeps the dashboard responsive while respecting CLI version differences.

Examples:

- a CLI may add or remove flags between versions, so `--help` is the real source of truth for what the builder should render
- Codex model metadata can include structured `supportedReasoningEfforts` entries, which the parser preserves rather than dropping them
- prompts, runtime flags, and dispatcher-generated values such as `-p`, `--resume`, `--continue`, and Codex `exec` remain outside the saved `args[]` payload and are handled by the runtime instead

## Advanced args fallback

Unsupported or custom argv remains available through the collapsible Advanced args editor. The field preserves every unknown argument and its original ordering so the user can keep project-specific or future flags without losing data.

The exact argv preview shown beneath the builder reflects the persisted command + `args[]` values that will be written to `agents.yaml`. This is the escape hatch that keeps the UI forward-compatible when a CLI adds new flags or when the user deliberately writes a custom option that ithyno does not yet model.
