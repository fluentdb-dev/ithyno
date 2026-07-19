---
tags: [feature/init, area/server, area/docs]
---

# PTY fallback uses a per-project session UUID (`--session-id` / `--resume`)

## Why

`pty-startup-default-fresh-session` (2026-07-19 archived) changed the
embedded Terminal's fallback (no manager entry, no env override) from
`claude --continue` to plain `claude`. That fixes the "No conversation
found to continue" stall on new projects — but it means **every
Terminal open is a fresh conversation** with no continuity between
Ithyno sessions.

Users want a persistent Claude Code conversation **per project**
without hardcoding a session id in `agents.yaml` and without the
opaque `--continue` behavior. Claude Code already supports this via:

- `--session-id <uuid>` — start a fresh session with a specific id
  (fails if the id is already in use)
- `--resume <uuid>` — resume a specific session (fails if the id
  doesn't exist)

The two flags compose into "create-once, resume-thereafter" if we
persist the id on the ithyno side.

## What Changes

### 1. `.ithyno/session-id` — per-project session UUID

A new plaintext file at `<project>/.ithyno/session-id`. Contains a
single UUID v4 line. Created on first PTY open; read on subsequent
opens.

Rationale for the store shape:

- **File not directory** — one project, one id. Simpler than the
  reverted change-scoped `.ithyno/sessions.json` map.
- **Plaintext, not JSON** — human-inspectable, trivially editable
  to reset.
- **Under `.ithyno/`** — matches the reverted change's convention;
  future project-local state files (session-created markers, cache
  hints, etc.) fit here.

### 2. PTY startup fallback becomes create-or-resume

`server/sync/pty.ts` — priority 3 (no manager entry, no env override,
`ITHYNO_PROJECT_ROOT` resolves normally):

```ts
const idPath = join(PROJECT_ROOT, '.ithyno', 'session-id');
if (fs.existsSync(idPath)) {
  const uuid = fs.readFileSync(idPath, 'utf8').trim();
  baseStartup = `claude --resume ${shellQuote(uuid)}`;
} else {
  const uuid = crypto.randomUUID();
  fs.mkdirSync(dirname(idPath), { recursive: true });
  fs.writeFileSync(idPath, `${uuid}\n`);
  baseStartup = `claude --session-id ${shellQuote(uuid)}`;
}
```

Priority 1 (manager entry) and priority 2 (`ITHYNO_TERMINAL_STARTUP`
env) are unchanged. Users who want to opt out — either by declaring
a manager entry or by setting `ITHYNO_TERMINAL_STARTUP=claude` — do
so as before.

### 3. `.gitignore` maintenance adds `.ithyno/`

`bin/init.js`'s `updateGitignore` — currently ensures `.worktrees/`
is present. Extend the same append-only-if-missing pattern to
`.ithyno/`. Existing `.gitignore` files without either line get both
appended; files with only one line get the other appended.

### 4. Docs breadcrumb

`docs/migration-guide.md` — a one-paragraph note on the persistent
session id (kept in `.ithyno/session-id`, gitignored, delete to
reset). Replace the shorter `/resume` breadcrumb from the previous
change with this fuller description.

### 5. What this change does NOT touch

- **`${session_id}` template var** — NOT re-introduced. The
  reverted change (`revert-session-id-cli-wiring`, 2026-07-15)
  removed template substitution because the dispatch endpoint that
  supplied it was gone. This change consumes the UUID directly
  in `pty.ts` without going through the registry-resolve substitution
  path. Future dispatch work can add the template var back if it
  finds a source for it.
- **Manager entry priority** — unchanged. If a user declares a
  manager, the session-id fallback isn't used.
- **VS Code extension setting `ithyno.terminalStartup`** — not
  touched here. The VS Code side spawns its own PTY via VS Code's
  terminal API, not through `server/sync/pty.ts`. A parallel fix
  there is a follow-up.
- **Multi-workspace / multi-project cases** — one Ithyno project
  = one session id. Multiple simultaneous PTYs against the same
  project reuse the same id (Claude Code handles single-writer
  concurrency by its own storage locks).

## Spec deltas (2 capabilities)

- **`dashboard`** — **MODIFIED** `Embedded PTY Uses tmux When Agmsg
  Is Configured`: expand the priority-3 fallback description to
  cover the `.ithyno/session-id` create-or-resume logic; add two
  scenarios (first-launch mint + subsequent resume).
- **`project-init`** — **MODIFIED** `.gitignore Maintenance`:
  `updateGitignore` now ensures BOTH `.worktrees/` AND `.ithyno/`
  are present, appending whichever is missing.

## Impact

- **Affected specs**: `dashboard` 1 MODIFIED, `project-init` 1
  MODIFIED
- **Affected code**:
  - `server/sync/pty.ts` — the priority-3 fallback branch (a few
    lines); import `crypto.randomUUID`, `fs.existsSync/readFileSync/
    mkdirSync/writeFileSync`
  - `bin/init.js` — extend `updateGitignore` to also handle
    `.ithyno/`; expose the new behavior via the same return-value
    shape
  - `bin/init.d.ts` — declare the extended semantics if the
    interface widens (probably no change: the callback returns are
    the same enum)
  - `server/init.test.ts` — extend the `updateGitignore` tests to
    cover the two-line case
  - `docs/migration-guide.md` — one-paragraph edit
- **Risk**:
  - **File corrupted or empty** — `fs.readFileSync` returns empty
    string, `--resume` gets no argument, Claude Code errors out.
    Mitigation: `trim()` the read value; if empty, mint a fresh id
    and overwrite. Simpler than a validation loop.
  - **User deletes `~/.claude/projects/<enc>/<uuid>.jsonl`** externally
    → `--resume` fails on the next Terminal open with "No conversation
    found with session ID". User remedies by deleting
    `.ithyno/session-id`; documented in the migration guide.
  - **File race between two simultaneous PTY opens** — both check
    non-existence, both mint different UUIDs, whichever writes last
    wins. Practically rare (users open one Terminal at a time), and
    the loser session gets abandoned harmlessly. Not worth a lock.
  - **Existing user with a `--continue`-style manager entry** —
    priority 1 wins, this fallback never runs. No behavior change.
- **Migration**: none for CLI users. Terminal users who want the
  old fresh-session-every-time behavior can set
  `ITHYNO_TERMINAL_STARTUP=claude`.

## Related

- `openspec/changes/archive/2026-07-19-pty-startup-default-fresh-session/`
  — the fallback change this refines.
- `openspec/changes/archive/2026-07-14-add-session-id-template-var/`
  — the earlier `${session_id}` implementation (subsequently reverted).
- `openspec/changes/archive/2026-07-15-revert-session-id-cli-wiring/`
  — why the earlier session-id work was removed.
