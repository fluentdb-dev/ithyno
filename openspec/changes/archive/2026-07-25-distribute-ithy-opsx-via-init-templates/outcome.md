# Outcome — distribute-ithy-opsx-via-init-templates

Landed 2026-07-25. Corrects `unify-ithyno-slash-command-surface`'s
distribution decision without touching its namespace consolidation. Ithyno's
`/ithy-opsx:*` surface now ships as an Init-scaffolded template
(`templates/.claude/commands/ithy-opsx/` + `templates/.claude/skills/ithy-opsx-*/`),
byte-identity-guarded against the dev-copy at `.claude/…`. Every trace of the
user-global installer — server module, HTTP endpoints, Doctor field, Settings
row, `installIthyOpsx`/`uninstallIthyOpsx` client helpers, CLI subcommands,
non-template packaging entries — is gone.

## ✅ Worked

- **Template scaffolding was the pre-existing right pattern.** `bin/init.js:166`
  already walks `templates/` generically; adding files at `templates/.claude/…`
  needed zero code changes to the scaffolder. The precedent
  (`templates/.claude/skills/openspec-flow/SKILL.md`) had been there since
  `expand-init-to-scaffold-agents` — the earlier proposal ignored it.
- **Drift guard runs in ~50 ms** and names the specific pair on failure
  (`drift: .claude/commands/ithy-opsx/dispatch.md differs from templates/.claude/commands/ithy-opsx/dispatch.md`).
  A PR that edits one side without the other fails CI before review, not after.
- **Typecheck stayed clean through every deletion pass.** The tsc chain caught
  the last `IthyOpsxDoctor` import stragglers immediately (server/doctor.ts,
  web/src/types.ts, both test fixtures). No dangling refs after §3.
- **npm pack --dry-run** now lists `ithy-opsx` ONLY under `templates/.claude/…`.
  The previous double-shipping (via `.claude/…` and `templates/.claude/…`) is
  replaced by single-source-of-truth.
- **502 tests passing** including the 2 new drift-guard tests. The single
  failure is the pre-existing `scripts/build-icons.test.mjs` sharp/Node 25.8
  flake, independently reported in three prior verify rounds.
- **`unify` kept its four load-bearing requirements** (three MODIFIED command
  wrappers + namespace consolidation). Only the six install-machinery
  requirements were removed. Both changes re-validate clean.

## ⚠️ Surprises

- **`cp -R src_dir/ target/` copies contents-into, not dir-into.** The first
  attempt at the skill copy shell-globbed `.claude/skills/ithy-opsx-*/`, and
  the trailing slash meant every source's `SKILL.md` clobbered the last one at
  `templates/.claude/skills/SKILL.md`. Fix: `cp -R "$src" "target/$(basename $src)"`
  per iteration.
- **`server/index.ts` had TWO install call sites**, not one — the endpoint
  handler pair AND a startup-time `installIthyOpsxSkills()` block before
  `fastify.listen`. The proposal's Impl only remembered the endpoints; the
  startup block would have kept writing to `~/.claude/` after removal of the
  handlers. Caught by grep, removed as part of §3.
- **`unify`'s `outcome.md` and `tasks.md` are inside a committed
  (but-not-archived) change.** Instead of trying to rewrite them into "this
  never happened," the change annotates them (`SUPERSEDED` blockquote at the
  top) and keeps the original body as historical record. Archive will fold
  everything into `openspec/changes/archive/…` — the annotation goes with it.
- **`~/.claude/` on this dev machine had a stale `.ithyno-install-manifest.json`
  timestamped 2026-07-24 16:42.** The manifest survived the local test cleanup
  of the sample HOME (`/tmp/ithy-opsx-clean-home`) because the manifest lives
  in `$HOME/.claude/`, not the sample. §5 cleaned it up on this dev machine
  only — no general uninstaller exists (there are no external users).

## 🔁 Do Differently

- **The install-vs-scaffold decision should have been up-front in `unify`.**
  The dev repo is also a consumer. Any distribution mechanism that scatters
  the source outside `.claude/…` and version-tracks-elsewhere structurally
  admits drift. The dev repo being the consumer is the same reason the
  templated `openspec-flow/SKILL.md` had to be byte-identity-guarded, and the
  same guard applies here.
- **Namespace charter should be enforced by test.** The
  `redesign-skill-namespace-and-dispatch` doc defines `/ithy-opsx:*` as
  "ithyno-tied: requires `.worktrees/`, `agents.yaml`, ithyno's HTTP API." The
  earlier install path violated that definition by putting the commands into
  a user's global shell for projects that had no ithyno. The corrected path
  (scaffold only on Init) matches the charter exactly, but the charter itself
  isn't guarded by any code — the next contradictory proposal will just quietly
  slip through. Follow-up 4 below.

## 🌱 Follow-ups

1. **Three phase branches** (`agent/dynamic-phase-lanes-from-agents-roles`,
   `agent/annotate-cards-with-worker-job-state`,
   `agent/expose-manager-activity-per-change`) were cut from
   `feature/add-phase-lane-view-toggle`, which was cut from a develop state
   that had `unify`'s install machinery in it. When they merge to develop
   after this change lands, git will re-add `server/install-skills.ts` etc.
   from the phase branches' side. Either forward-merge this change into
   `feature/add-phase-lane-view-toggle` first (then into each phase branch),
   or drop the install files at each phase-branch merge to develop. Decide
   at merge time; do not merge blindly.
2. **`.github/copilot-instructions.md` review** — Copilot auto-loads that
   file at session start. It currently reads correctly (says "review role →
   `/ithy-opsx:review <change-id>`"), but a scaffolded target project won't
   have that file. Verify Copilot reviewers on scaffolded targets still route
   correctly, or scaffold a copilot-instructions.md analog via `templates/`.
3. **Manager PTY on this dev repo after §5.** `~/.claude/commands/ithy-opsx/`
   is gone; the Manager now resolves `/ithy-opsx:*` from the dev repo's own
   `.claude/`. Restart any long-lived Manager sessions to pick up the
   project-local resolution path. Command-line: `pkill -f 'claude .*manager'`
   or just close and reopen the Manager pane.
4. **A `namespace-charter` invariant test** — grep guard: no file under
   `.claude/commands/opsx/` is authored by ithyno (i.e. `git log --follow`
   on that path shows only `openspec init` / `openspec update` commits).
   Would have failed the earlier bad direction at test time.
5. **Windows-target Init smoke test** — the templates ship uniformly, so
   `bin/init.js`'s POSIX-only path assumptions (if any) matter here. Not
   tested this round; noted for release matrix.
