# Outcome — pty-startup-default-fresh-session

## ✅ Worked

- **Fallback change is a 1-line code edit** with one existing test
  update — `claude --continue` → `claude`. Priority list and rest of
  the resolution logic untouched.
- **Template's `agents.yaml.example`** gains a commented `manager`
  agent block up front. Two variants only: plain `claude` (default,
  spelled out for clarity) and `--resume, <session-id>` (explicit
  pin). `--continue` is deliberately excluded per feedback that it's
  opaque + fragile.
- **Docs breadcrumb** in `docs/migration-guide.md` explains the
  fresh-session default and points at `/resume` from inside Claude
  Code as the way to continue prior conversations.
- 278 tests + typecheck + build all clean.

## ⚠️ Surprises

- **The template initially advertised three variants** (`--continue`,
  `--resume`, plain). User feedback ("continueはやめるべき")
  clarified that `--continue` shouldn't be documented at all — it's
  opaque (auto-picks something) and its failure mode ("No conversation
  found to continue") is exactly what triggered this change. Cut it
  from the template + added a paragraph explaining why.
- **The spec still shows `claude --continue` in one legacy scenario**
  (agmsg-tmux example under `Embedded PTY Uses tmux…`) because it's
  documenting what happens when the user explicitly declares a
  manager with `args: [--continue]`. That's still a valid override,
  just no longer the recommended default. Left the scenario as-is
  since it's showing user intent, not our default.

## 🔁 Differently next time

- **Ship the tighter framing on `--continue` from the start.** The
  first draft treated `--continue` as a legitimate opt-in; the user
  called out that it's actively worth discouraging (opaque, error-
  prone). Would have saved a template + doc edit round-trip.

## 🌱 Follow-ups

- **Auto-detect stale conversations?** A future runtime check could
  peek at `~/.claude/` to see if any prior session exists in this
  project, and only surface `--continue`-style behavior when one
  does. Deferred as low-value: explicit is better than magic here.
- **Manual verify 7.3 / 7.4** (fresh Electron terminal opens without
  the "No conversation found" message) is pending user smoke on the
  next Electron dev launch.
