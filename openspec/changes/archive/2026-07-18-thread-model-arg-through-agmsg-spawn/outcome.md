# Outcome — thread-model-arg-through-agmsg-spawn

Small follow-up to P2b/c (`route-live-shell-to-agmsg-spawn`). The
dispatcher's agmsg branch previously dropped `entry.args` entirely
on the `/agmsg spawn` call, so `--model sonnet` (and its silent Opus
default) went unused. This change threads `--model <id>` from
`entry.args` into the spawn call via `spawn.sh`'s built-in
pass-through, and leaves all other args to the follow-up
`auto-sync-agmsg-spawn-options`.

## ✅ Worked

- **Verified upstream support before designing**: greping
  `spawn.sh` confirmed `--model <id>` is a documented pass-through
  (line 48-49, 215-219). The dispatcher just had to include it in
  the spawn command line.
- **Order-agnostic parser**: the extraction walks `entry.args`
  once, matching `--model` at any position and grabbing the
  immediately-following token. Tested against 7 shell inputs
  (including bare `--model`, `--model --other-flag`, and multi-
  arg mixes) — all correct on the fixed version.
- **Scope discipline**: the propose explicitly punted `--
  dangerously-skip-permissions` and other flags to a separate
  server-side sync change (`auto-sync-agmsg-spawn-options`).
  Kept this change narrow (2 spec-delta paragraphs + ~15 lines
  of skill bash + 3 new scenarios).

## ⚠️ Surprises

- **Bare `--model` semantics**: my first extraction only checked
  "is there a token at index i+1?". The live shell verify
  immediately surfaced a case I hadn't thought about: `--model
  --other-flag`. Semantically that's a bare `--model` (the "value"
  is another flag), not a `--model=--other-flag` invocation. Added
  a `[[ "$next" == --* ]]` guard so it escalates cleanly.
- **Design layering**: the earlier draft of this change tried to
  own both the CLI-level threading AND the auto-sync of other args
  into `spawn_options.yaml`. User pushed back — those belong on
  the server-side / config-writer surface, not on the dispatcher
  skill. Split into two changes was the right call.

## 🔁 Differently next time

- **Write the shell test cases BEFORE the skill edit**. The bare
  `--model --other-flag` case was found *after* the initial write.
  Table-driven expectations up front would catch that pre-commit.
- **Grep the target tool for the exact feature before designing**.
  Doing that here (finding `spawn.sh`'s `--model` support) turned
  a hypothetical propose into a fact-checked one in one bash call.

## 🌱 Follow-ups

- **`auto-sync-agmsg-spawn-options`** (in-flight): server-side sync
  of non-`--model` args from `agents.yaml` to `~/.agmsg/config/
  spawn_options.yaml`. Handles `--dangerously-skip-permissions`
  and any other CLI-vendor constants.
- **Additional pass-through flags on `/agmsg spawn`**: `spawn.sh`
  also accepts `--project`, `--team`, `--window`, `--split`,
  `--terminal`, `--no-wait`, `--ready-timeout`, `--fresh`. None
  are threaded from `entry.args` today. If a user actually wants
  per-worker control of them, add a small allowlist to this
  extraction loop.
- **`--fresh` semantics**: spawn.sh has `--fresh` (force a fresh
  session even if resumable). Currently the dispatcher never
  triggers this — every agmsg re-spawn resumes the same
  `<team>-<agent>` session. If iteration N wants a fresh worker
  session (context isolation), a per-stage `--fresh` opt-in is a
  follow-up.
- **Live end-to-end verify**: this change was verified via a
  shell-only test of the extraction logic. The full
  `/ithy-opsx:dispatch` invocation against a real agmsg spawn was
  not exercised because the user's local agmsg install just landed
  in this session and no real dispatch has been triggered yet.
  First live dispatch will exercise this path; if it surfaces
  additional issues, postscript this outcome.
