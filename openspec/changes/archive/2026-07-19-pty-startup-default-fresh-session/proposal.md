---
tags: [feature/init, area/server, area/docs]
---

# PTY startup default → `claude` (fresh session) + template manager sample

## Why

The onboarding flow landed by `add-new-project-onboarding-window`
takes a user from empty folder to a fully-initialized ithyno
project in ~30 seconds. But the embedded Terminal panel that opens
in the newly-loaded window immediately hits:

```
No conversation found to continue
```

Because `server/sync/pty.ts`'s fallback (when `agents.yaml` has no
`roles: [manager]` entry, and no `ITHYNO_TERMINAL_STARTUP` override)
is a hardcoded `claude --continue`. A newly-created project has no
prior Claude Code conversation to continue — the launch appears
broken to a first-time user.

Two changes cure this:

- **A. Change the fallback to `claude`** (no `--continue`). Claude
  Code starts fresh; users can `/resume` from inside the session if
  they later want to pick a specific prior conversation. The
  fallback becomes safe for both new and existing projects.
- **C. Add a commented manager entry to
  `templates/agents.yaml.example`.** Users who want the previous
  auto-continue behavior on their established projects get a copy-
  paste-ready sample they can uncomment and adjust.

The two changes are complementary: **A** removes the misleading
error for new projects, **C** makes the (still-supported) session-
persistence pattern discoverable.

## What Changes

### 1. Fallback becomes `claude`

`server/sync/pty.ts` — the third-priority fallback (when no manager
agent and no env override):

```ts
// before
baseStartup = v ?? "claude --continue";
// after
baseStartup = v ?? "claude";
```

That's the whole code delta. The priority list stays the same:

1. `registry.managerAgent()` — user-declared manager entry
2. `ITHYNO_TERMINAL_STARTUP` env var
3. Fallback: `claude` (was `claude --continue`)

Users who want auto-continue on established projects declare a
manager entry with `args: ['--continue']` (as many existing users
already do).

### 2. Template gains a commented manager sample

`templates/agents.yaml.example` — add a commented block right below
the header comment showing three common manager patterns so a user
who runs `ithyno init` sees "here's how to configure session
persistence" as an obvious next step:

```yaml
# Optional: declare a `manager` agent to control the embedded
# Terminal's auto-launch command. Without this block the Terminal
# opens a fresh `claude` session. Uncomment ONE of the samples:
#
# agents:
#   - name: manager
#     mode: live-shell
#     roles: [manager]
#     command: claude
#     args: [--continue]                     # continue the previous session
#
#   - name: manager
#     mode: live-shell
#     roles: [manager]
#     command: claude
#     args: [--resume, <session-id>]         # pin to a specific session
#
#   - name: manager
#     mode: live-shell
#     roles: [manager]
#     command: claude                         # explicit fresh session
```

The sample is placed BEFORE the existing worker-agent example so a
new user sees the manager pattern first (it's the more common thing
to want).

### 3. Docs breadcrumb

`docs/migration-guide.md` — add one line under the "ithyno init"
fast-path noting that the default embedded Terminal opens `claude`
fresh and pointing at the manager entry in the template.

### 4. What this change does NOT touch

- **`ITHYNO_TERMINAL_STARTUP` env** — untouched. Users using it get
  the same override behavior.
- **`registry.managerAgent()` resolution** — untouched. Manager
  entries drive everything as before.
- **agmsg tmux wrap** — untouched. The tmux-wrapped command uses the
  same `baseStartup` value; `claude` continues to work with or
  without the wrap.
- **CLI `bin/ithyno.js`** — untouched.

## Spec deltas (`dashboard` capability)

- **MODIFIED** `Embedded PTY Uses tmux When Agmsg Is Configured` —
  update the resolved-startup examples to reflect the new default,
  and clarify the fallback semantics.

Since the fallback priority list itself isn't a normative
requirement in the spec (it's an implementation detail described in
code comments and one scenario line), the delta is small: adjust
the scenario text that names `claude --continue` and add a new
scenario for the "no manager, no env override" fallback.

## Impact

- **Affected specs**: `dashboard` — 1 MODIFIED (small edits + 1 new
  scenario)
- **Affected code**:
  - `server/sync/pty.ts`: 1-line change to the fallback string
  - `server/sync/pty.test.ts` (or the closest existing test): add a
    test asserting `claude` is emitted when neither manager nor env
    is set
  - `templates/agents.yaml.example`: add the commented manager
    sample block
  - `docs/migration-guide.md`: one-line breadcrumb
- **Risk**:
  - **Existing users without a manager entry** who were relying on
    the implicit `--continue` will now get fresh sessions. Impact
    is UX-level (they can `/resume` from inside Claude Code, or add
    a manager entry to keep the old behavior). Announced in the
    outcome; documented in the template.
  - **Session persistence via `--continue`** is now an opt-in per
    manager entry rather than an implicit default. Consistent with
    other Ithyno defaults (agmsg opt-in, parallelExecution opt-in).
- **Migration**: users can restore old behavior with one
  `templates/agents.yaml.example`-style entry.

## Related

- `openspec/changes/archive/2026-07-19-add-new-project-onboarding-
  window/` — the flow that surfaced this issue.
- `openspec/changes/archive/2026-07-15-revert-manager-agent-config/`
  — historical context on the manager entry priority list.
- `templates/agents.yaml.example` — where the sample lives now.
