# Outcome — retrofit lesson

## ✅ Worked

- **Three tangled bugs, one root cause, one commit.** The template
  default, the misnamed generic-but-Claude-only function, and the
  overly-permissive picker were all symptoms of the same underlying
  design gap: init time should not encode CLI-specific args. Fixing
  them together made the internal seams (per-CLI dispatch table,
  candidate constants, session-file-per-CLI) fall out naturally.
- **Legacy `.ithyno/session-id` fallback read** kept existing dev
  environments seamless. No forced migration, no lost conversations.
  The old file just stays where it is until a fresh mint (which
  writes to the new path) happens.
- **Tests followed the design cleanly.** Per-CLI dispatch table →
  one test per registered CLI + one test per fallback case. Candidate
  filter → mirror the constants in the test file, verify each
  installed-set combo. No cargo-cult scaffolding.

## ⚠️ Surprises

- **The propose skip was the wrong call.** I originally framed this
  as "bug fix — template writes wrong args, doesn't work" and skipped
  the proposal per CLAUDE.md's trivial-fix clause. The user pushed
  back correctly: this adds capabilities (per-CLI dispatch table),
  alters observable UI (picker shrinks), and shifts a file-system
  contract (session-id → session-claude). "It fixes a bug" ≠ "it's a
  trivial fix." Retrofit was the right recovery, but the initial
  classification was too generous.
- **`resolveSessionIdStartup` was misnamed since 2026-07-19** —
  landed as "generic-looking" but hardcoded Claude from the start.
  This was a latent trap that only surfaced when someone (the user)
  asked "does this work for all CLIs?" The rename is trivial; the
  lesson is that generic-looking function names should either BE
  generic or be renamed to name their scope. Naming discipline.
- **The user's design push for per-CLI dispatch was cleaner than my
  first quick-fix instinct.** My first pass would have gated the
  picker to Claude only and left `--continue` merely removed —
  smaller diff but leaves the "generic-named Claude-only function"
  landmine and the "picker gate but no runtime story" mismatch. The
  user's "ptyStartup をハードコードにするべきではない" cut through to the
  cleaner shape.

## 🔁 Differently

- **Would have paused before commit** to reason about
  observable-behavior impact more carefully. My internal rule going
  forward: if a fix touches UI + file-system paths + runtime
  contracts in one commit, it's not "trivial" no matter how the
  original bug looked.
- **Would have looked for the naming trap** (`resolveSessionIdStartup`
  vs `resolveClaudeSessionStartup`) earlier — the mismatch was
  visible in the code the moment I opened the file. Reading with
  "what would a fresh contributor assume this does?" would have
  caught it.

## 🌱 Follow-ups

- **`add-codex-manager-startup-strategy`** — research Codex's resume
  mechanism (`codex resume`? `--session <id>`?), register in
  `MANAGER_STARTUP_STRATEGIES`, drop `codex` from `MANAGER_UNVERIFIED`.
- **`add-agy-manager-startup-strategy`** — same for Agy.
- **Per-CLI dispatch skill port** — the `(動作未確認)` label can only
  be dropped when the CLI both (a) has a startup strategy AND (b) can
  actually run `/ithy-opsx:dispatch` in its command surface. (b) is
  gated on `generalize-skills-cross-cli` renderer follow-ups for each
  CLI. Track jointly with the strategy additions.
- **Copilot/Gemini/Opencode/Cursor Manager support** — currently
  hidden from picker entirely. Each requires strategy + dispatch skill
  + verified workflow before entering `MANAGER_UNVERIFIED` (and then
  `MANAGER_VERIFIED` after live-test).
- **Data-migration one-shot** — a `scripts/migrate-session-id.mjs`
  that renames `.ithyno/session-id` to `.ithyno/session-claude`
  across the user's active projects. Not required (fallback read
  handles it) but nice-to-have to fully retire the legacy path.
- **Rule tightening in CLAUDE.md**: "bug fix skips propose" clause
  could use a stricter test — "the fix doesn't add capabilities,
  doesn't move observable UI, doesn't change any file-system or API
  contract." Would have flagged this change correctly. Consider a
  follow-up doc-only change to add that test to the hard-rule text.

## Retrofit-specific note

This proposal was written AFTER `4d1687b` shipped. Per CLAUDE.md's
Retrofit section, the artifacts describe what is already true;
tasks.md items are all `[x]`; and archive follows immediately.
Nothing about the shipped code changes as part of this record — only
the spec + tasks + this outcome are added, and a PENDING annotation
is inserted on the current `Manager Entry Drives Fresh PTY Startup`
requirement.
