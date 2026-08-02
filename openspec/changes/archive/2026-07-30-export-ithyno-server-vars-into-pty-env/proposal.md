---
tags: [pty, dispatch, electron, vscode, env-vars, contract]
execution: main-tree
retrofit: true
---

## Why

The `/ithy-opsx:dispatch` and `/ithy-opsx:dispatch-multi` skills call
the ithyno server's phase API (`GET /api/changes/<id>/phase`,
`POST /api/changes/<id>/phase`) via `curl "$ITHYNO_BASE/api/..."`.
The skill documentation named `ITHYNO_BASE = http://localhost:4321`
as a hardcoded constant with the offhand note "adjust if the user's
`ITHYNO_PORT` differs".

That "adjust" never happened, because ithyno's parent shell (the
Electron shell or the VSCode extension host) never actually exported
`ITHYNO_PORT` or `ITHYNO_BASE` into the Manager PTY environment. Both
launchers spawn the server on an **ephemeral per-project port**
(`electron/src/server-spawner.ts:76` via `pickFreePort()`;
symmetric in the VSCode extension host) and pass it to the server as
`PORT=<n>` — but only pass `ITHYNO_SESSION_TOKEN` through to the PTY.

Consequence: under Electron (session port e.g. 57703),
`curl http://localhost:4321/api/changes/<id>/phase` connection-refused
and every phase-boundary API call from the dispatch skills failed
silently. Dispatch remained functional on the CLI dev workflow (where
the default 4321 happens to be right) but was broken end-to-end for
every packaged shell.

There is no existing spec requirement for the PTY env at all — the
`ITHYNO_SESSION_TOKEN` export landed by `expose-manager-activity-per-change`
was never formalized either. This proposal introduces the missing
contract.

## What Changes

### 1. `server/sync/pty.ts` (already committed as `c5beae8`, retrofit)

The PTY child env SHALL include, in addition to the existing
`ITHYNO_SESSION_TOKEN`:

- `ITHYNO_PORT` — bare port number, e.g. `"57703"`. Sourced from
  `process.env.PORT ?? "4321"` — the server process already knows
  its port because its launcher sets `PORT` at spawn time.
- `ITHYNO_BASE` — full base URL, e.g. `"http://localhost:57703"`.
  Provided so consumers do not have to concatenate.

Fall back to port `"4321"` when `process.env.PORT` is unset (CLI dev
workflow — no parent shell to set it). Explicit fallback keeps the
CLI path bit-compatible.

### 2. Skill docs (mirrored: `.claude/` + `templates/.claude/`)

Rewrite the `ITHYNO_BASE` constant description in:

- `.claude/commands/ithy-opsx/dispatch.md`
- `templates/.claude/commands/ithy-opsx/dispatch.md`
- `.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`
- `templates/.claude/skills/ithy-opsx-dispatch-multi/SKILL.md`

From:

```
ITHYNO_BASE = http://localhost:4321 — adjust if the user's
ITHYNO_PORT differs.
```

To (paraphrased): "Exported into the Manager PTY by the ithyno
server. Fall back to `${ITHYNO_BASE:-http://localhost:${ITHYNO_PORT:-4321}}`
when neither is set. Do NOT hardcode 4321 — dispatch will
connection-refuse under Electron."

Also replace `curl … http://localhost:4321/…` with
`curl … "${ITHYNO_BASE:-http://localhost:${ITHYNO_PORT:-4321}}/…"`
in the two remaining hardcoded-port skills — both were the same
class of bug as dispatch and would have failed under Electron for
their respective flows:

- `.claude/commands/ithy-opsx/answer.md` — `POST /api/changes/<id>/needs-human/answer`
- `templates/.claude/commands/ithy-opsx/answer.md`
- `.claude/commands/ithy-opsx/escalate.md` — `POST /api/changes/<id>/needs-human`
- `templates/.claude/commands/ithy-opsx/escalate.md`

`.claude/` and `templates/.claude/` MUST stay byte-identical for
each file (`scripts/verify-bundle.mjs` drift guard).

### 3. Formalize the PTY env contract (new spec requirement)

Add a `dashboard` spec requirement: **"Manager PTY exposes ithyno
server contact vars"**. Lists the three vars that MUST be present in
the PTY env and their meanings.

## Non-goals

- **Restructuring `server-spawner.ts` to pass port explicitly.** The
  server process already reads `PORT` from its own env; passing it a
  second time via a different channel would be redundant. The fix
  reads what's already there.
- **Formalizing `ITHYNO_PROJECT_ROOT`, `ITHYNO_OPEN`, or any other
  Electron-only launcher vars.** Those are private to the
  launcher/server handshake and not needed by any skill running
  inside the PTY.
- **A test for the actual PTY env shape.** `server/sync/pty.test.ts`
  mocks `node-pty` and never actually spawns a child — the env
  contract is best verified by manual smoke test (see task 5.1).

## Impact on existing capabilities

- **NEW** requirement: "Manager PTY exposes ithyno server contact
  vars" — formalizes the three-var contract (SESSION_TOKEN, PORT,
  BASE). Landing this also retroactively documents the pre-existing
  `ITHYNO_SESSION_TOKEN` export.
- **NO** requirements MODIFIED or REMOVED.
- Downstream skills (dispatch, dispatch-multi) documentation
  rewritten to reflect env-based resolution — no behavior change on
  the CLI dev workflow (4321 default preserved).

## Retrofit note

Implementation landed in commit `c5beae8` (2026-07-30) as a
"trivial bug fix" judgment call. The user pointed out that adding
new env-var contracts to the PTY is spec-level — retrofit-proposing
per CLAUDE.md's "If implementation happened ahead of a proposal,
retrofit the change after the fact" rule.
