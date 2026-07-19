# Outcome — wrap-embedded-pty-in-tmux

P2 of the agmsg integration split. Wrapped the embedded PTY's manager
startup in `tmux new-session -A -s <name> -- …` whenever `agents.yaml`
has an `agmsg:` block; kept the direct-spawn path untouched otherwise.
No agmsg runtime, no dispatcher change.

## ✅ Worked

- **Wrap is a pure string transform.** `ptyStartup()` still returns
  `{ startup, initialInput? }` — only the `startup` line changes when
  `registry.agmsg()` is non-null. That kept the diff small (one
  server file + tests) and let the existing `attachPtyToSocket` timing
  chain (300ms delay before startup write, +300ms before initialInput)
  work verbatim.
- **`hasTmux()` cache + test override hook.** A single `spawnSync
  which tmux` at first call, cached forever; `_setTmuxCacheForTest`
  resets the cache from tests without needing to shell out from CI.
  Six new unit tests, all green, deterministic across platforms.
- **`-A` idempotence.** The tmux `-A` flag means "attach if exists,
  create otherwise" — solves the "user closed the Terminal panel and
  reopened it" scenario without any bookkeeping on our side. No stale
  session cleanup needed for P2.
- **`--` separator saves us from manager-flag / tmux-flag collisions.**
  Test 4.6 locks that `--project 'my project'` survives the wrap with
  its arg boundaries intact.

## ⚠️ Surprises

- **The validator rejected the initial requirement text.** SHALL was
  present throughout the body but the leading paragraph opened with
  "When `agents.yaml` includes a valid ... block" — the parser wanted
  SHALL closer to the subject. Rewrote the intro sentence as "The
  embedded PTY session SHALL wrap …" and it accepted. Structural
  reminder: leading SHALL, not conditional-then-SHALL.
- **Fallback banner mechanics.** The startup line is written into a
  raw shell as if the user typed it, so I couldn't do the "cat
  <<EOF … exec $SHELL -i" gymnastics tasks.md 3.1 sketched — that
  would exec-replace the shell mid-stream. Simpler: emit a `printf`
  with the multi-line message; the shell prompt naturally returns
  after. Matches the "raw shell stays usable" requirement.
- **Shell smoke-test for tmux syntax.** Ran `tmux new-session -A -s
  ithyno-verify -d -- bash -c 'sleep 5'` from the harness Bash tool
  and confirmed `tmux ls` sees the session. Not a substitute for a
  full browser attach, but locks the CLI shape at least.

## 🔁 Differently next time

- **Write the requirement's opening sentence with SHALL front-loaded**
  when the delta is ADDED. Avoids the validator rework.
- **Consider factoring `ptyStartup` into pure `resolveStartup(inputs)
  + hasTmux()` helpers** if the tmux/agmsg logic grows in P2b/P2c.
  Right now the wrapping is inline for readability; if it fans out
  (session naming per project, tmux config env, PTY environ tweaks)
  it'll want its own module.

## 🌱 Follow-ups

- **P2b `route-live-shell-worker-via-agmsg`** — dispatcher routes
  `mode: live-shell` workers to `agmsg send` instead of subprocess.
  Requires this tmux host to be running so the worker pane has
  somewhere to land.
- **P2c `bootstrap-workers-under-agmsg-monitor`** — spawn worker
  panes under `agmsg monitor` inside the tmux session so they react
  to messages.
- **Browser verify with the actual Manager loop** — deferred to the
  P2b landing (the tmux host has nothing observable to check on its
  own; verify becomes meaningful once workers land in adjacent
  panes).
- **Per-project session naming default** — currently the default is
  a fixed `ithyno`. Deriving from `path.basename(projectRoot)` would
  make multi-workspace users' lives easier. Env override
  (`ITHYNO_TMUX_SESSION`) already handles the manual case; automatic
  derivation is a small P2 follow-up.
- **Session-died cleanup** — `tmux new-session -A` re-attaches even
  to a session whose pane 0 died; a `respawn-pane` hook or a health
  check before attach is a future refinement.
- **Windows path** — tmux is macOS/Linux. Windows users configuring
  `agmsg:` see the fallback banner. A Windows-native multiplex
  alternative is out of scope for the agmsg integration split.
