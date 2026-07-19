# Outcome — revert-add-manager-agent-config

## ✅ Worked

- **Second Case β retirement in a row applies the same pattern
  cleanly.** Just like `revert-refine-agents-config-modal` earlier
  today: delete the target's `specs/`, rewrite `outcome.md` to
  point at the revert, `openspec archive <target> --yes` with the
  no-deltas warning, then archive the revert with its own small
  ADDED requirement. Both retirements now sit adjacent in
  `openspec/changes/archive/2026-07-19-*`.
- **`Manager Entry Drives Fresh PTY Startup` disentangles the
  no-tmux priority chain from the tmux-wrapping concern.** The
  existing `Embedded PTY Uses tmux When Agmsg Is Configured`
  requirement folded both concerns into one — this revert factors
  out the pure priority-chain contract so future PTY-related
  changes can point at the smaller requirement without dragging in
  tmux prose. The two requirements now coexist as complementary
  statements of the same code path.
- **No code changes.** `ptyStartup(registry)` in
  `server/sync/pty.ts` remains unchanged; the 3-tier priority
  chain landed 2026-07-06 has been continuously in effect since
  then, only wrapped by tmux (P2) or extended with session-id
  logic (P2-adjacent) along the way.

## ⚠️ Surprises

- **`SHALL` needed to be the first verb in the requirement body**
  for the openspec `--strict` validator. My first draft opened with
  a `When` clause before the SHALL and got rejected with "must
  contain SHALL or MUST" — even though `SHALL` was clearly present
  on line 2. Same trap I hit on
  `vscode-terminal-uses-project-session-id`. Worth writing up as a
  general note in the openspec-flow skill.
- **`initialInput` field's fate is subtly split.** Reshape moved
  the field from a top-level `initialInput:` to
  `prompts.manager:`, but the same string still ends up written to
  the child's stdin post-launch. The delta says both names in
  parentheses to keep the semantic explicit while acknowledging
  the schema migration.

## 🔁 Differently next time

- **Front-load the "does this delta match today's spec?" check
  during propose.** Both add-manager-agent-config and
  refine-agents-config-modal drifted for weeks before
  `openspec archive` surfaced the gap. A CI job that runs
  `openspec archive --dry-run <change>` on any change touching a
  requirement name would have caught this on the PR that landed
  reshape.

## 🌱 Follow-ups

- **Consolidate the three "PTY startup" requirements into one
  canonical statement.** Currently spread across:
  1. `Embedded PTY Uses tmux When Agmsg Is Configured` (tmux
     wrapping + 3-tier chain)
  2. `Manager Entry Drives Fresh PTY Startup` (just added by this
     revert — pure priority chain)
  3. `App Identity is "ithyno"` (contains an `ITHYNO_*` env var
     scenario that overlaps with tier 2 of the chain)

  A refactor change could fold these into one authoritative "PTY
  Startup Command Resolution" requirement with sub-scenarios for
  tmux vs direct spawn. Not scoped here.
- **Multi-manager UI switcher** is now formally dead: the singleton
  guard from revert-refine-agents-config-modal contradicts it. If
  users ever ask for that feature, it starts by reverting the
  singleton guard.
