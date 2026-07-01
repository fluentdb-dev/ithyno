## Context

`add-ui-orchestration` introduced dashboard buttons that inject text into the
active embedded terminal. The injected text is currently hard-coded to the
`/opsx:*` slash-command form, which Claude Code interprets via the skills
installed by `openspec init`. If the terminal is just a shell prompt without
Claude running, those slash commands do nothing. The fix is to let the user
choose what shape of command the buttons send, and to surface the active
choice so confusion does not creep back in.

## Goals / Non-Goals

**Goals:**
- A clear, persisted choice between Claude slash commands and the raw OpenSpec
  CLI for every UI-initiated workflow action.
- Visible mode indication on the action buttons (not just inside the modal).
- Preview the exact line that will be injected, in both modes.
- Disable actions that have no CLI equivalent rather than silently sending
  something that will not work.

**Non-Goals:**
- Auto-detecting which process runs in the terminal. (Unreliable from outside
  the PTY; we ask the user instead.)
- Implementing `apply` ourselves for the CLI mode. (Apply means "have the LLM
  read tasks and write code." Without an LLM, this is not a single command.)
- Server-side changes to the inject endpoint. The mode lives in the UI.

## Decisions

- **Two modes, persisted.** `commandStyle: 'claude' | 'cli'` lives in the Zustand
  store and persists to `localStorage.openspec-ui.commandStyle`. Default is
  `claude` for first-run continuity.
- **Per-modal override that updates the default.** The modal selector lets the
  user switch for the current action; choosing a mode also updates the saved
  default so the next modal opens with it.
- **Modal shape differs by mode for "New Change".**
  - Claude: a description field → `/opsx:propose "<description>"`. Claude derives
    the kebab-case id and fills all four artifacts.
  - CLI: a kebab-case id field → `npx openspec new change <id>`. Only scaffolds
    the directory; the user (or Claude later) fills artifacts.
  This asymmetry is honest: the two commands really do different amounts of
  work, and we should not pretend otherwise.
- **Apply has no CLI form.** In CLI mode, the Apply button is disabled with a
  tooltip ("Apply requires Claude Code in the terminal"). Pretending otherwise
  would be a worse experience than the disabled state.
- **Archive maps cleanly.**
  - Claude: `/opsx:archive <id>`
  - CLI: `npx openspec archive <id>`
- **Use `npx openspec` rather than `npm run openspec --`.** `npx` works in any
  shell that has the project's `node_modules/.bin` on `PATH` (which `npm`-spawned
  shells do not necessarily have), and the preview line stays short and obvious.
  The `@fission-ai/openspec` package is already in devDependencies, so `npx`
  resolves locally without a network fetch.
- **Surface the active mode on the buttons.** Each action button gets a small
  badge (`Claude` / `CLI`) so users see what is about to be sent before they
  even open the modal.

## Risks / Trade-offs

- **Asymmetric Apply.** Disabling Apply in CLI mode is the right call but may
  feel inconsistent. Tooltip mitigates; future work could add a "Switch to
  Claude mode" affordance from the tooltip.
- **`npx openspec` resolution.** In the unlikely event the project's local
  `@fission-ai/openspec` is missing, `npx` would fetch latest from the registry
  instead of failing — different version, possibly different behavior. Accepted
  for v1; we document the recommendation to keep the devDep installed.
- **Mode confusion across surfaces.** A user could set the mode once and forget
  it; subsequent actions on other changes would use the same mode. The button
  badge is the mitigation — the user sees the mode every time before clicking.
- **Two New Change shapes.** Asking for an id (CLI) vs a description (Claude)
  is real cognitive load. Honest mapping wins; we make the modal title and
  field label make the difference obvious.
