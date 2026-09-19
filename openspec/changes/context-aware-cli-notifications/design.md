## Context

Hooks execute in a CLI process and cannot reliably infer whether the dashboard
was launched by Electron or a VS Code webview. The host that enables the hook
does know its runtime and can persist that context in the hook command.

## Goals / Non-Goals

**Goals:**
- Use one portable script with explicit context supplied at installation.
- Avoid opening Finder or an unrelated application.
- Provide safe no-op click behavior when no host is known.
- Preserve project-specific grouping.

**Non-Goals:**
- No attempt to detect arbitrary desktop applications from a child CLI.
- No requirement for clickable notifications on Linux providers that do not
  expose actions.

## Decisions

- Define a small context contract (`electron`, `vscode`, or `cli`) plus an
  optional platform-specific app identifier.
- Store context in the generated hook command/environment rather than in a
  global file, so multiple projects and hosts can coexist.
- Use `alerter` on macOS, BurntToast/NotifyIcon on Windows, and `notify-send`
  on Linux; unsupported click actions are no-ops.
- Keep grouping as `ithyno:<cli>:<project-id>` and retain provider-specific
  timeout values.

## Risks / Trade-offs

- [Host app bundle IDs vary] → allow an explicit override and validate before
  writing the hook.
- [Existing hooks use the old command form] → status/removal match both legacy
  and context-aware entries.
