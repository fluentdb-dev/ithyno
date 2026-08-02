# Design — generalize-skills-cross-cli

## Context

The `.claude/skills/*` and `.claude/commands/*` conventions this
repo uses are Claude Code's native surface. Every other CLI has its
own convention:

| CLI | Skill/prompt surface | Notes |
|---|---|---|
| Claude Code | `.claude/skills/<name>/SKILL.md` + `.claude/commands/<ns>/<cmd>.md` | slash commands invoke skill body |
| Codex | `.codex/prompts/*.md` or config-driven (TBD, verify at impl) | needs research |
| Antigravity | `.antigravity/rules/*` (TBD) | needs research |
| Cursor | `.cursor/rules/<name>.mdc` | MDC format (frontmatter + body) |
| Gemini | context files, project-level system prompt | no slash-command equivalent (?) |
| Copilot | `.github/copilot-instructions.md` (project-wide) | single-file, fragment merging needed |
| Opencode | (TBD — check upstream) | |

**Key insight**: prompt bodies are 95% the same across CLIs (they
describe the workflow). CLI-specific concerns are:
1. **Where** the file goes.
2. **How** it's invoked (slash command, `@` mention, auto-injection).
3. **What** in-process tools exist (Task tool, subagent spawn, etc.).

Only #2 and #3 need per-CLI translation. #1 is a path convention.
The prompt body is nearly universal.

## Goals

- Write each skill's workflow logic **exactly once**.
- Install-time picker: user selects which CLIs to target.
- Zero manual editing of generated files (`.claude/*`, `.codex/*`,
  etc.). Editing the universal source is the only supported flow.
- Idempotent re-install: adding/removing CLIs updates the surface
  without leaving orphans.
- CI catches drift between universal source and rendered outputs.

## Non-Goals

- Third-party skill marketplace.
- Runtime CLI-abstraction inside skills (skills stay static
  render-time output).
- Auth/model config per CLI (out of scope; user's own CLI config).
- Turning agmsg's spawn adapter into a general framework (agmsg
  handles runtime dispatch; this handles prompt-surface install).

## Decisions

### D1: Sibling `manifest.yaml`, not SKILL.md frontmatter

Frontmatter would keep skills in one file, but:
- SKILL.md stays pure prompt text → easier to diff prose changes vs.
  metadata changes.
- Manifest is data-only → JSON-schema-lint-able, easy to enumerate
  from install code.
- Matches OpenSpec's pattern (proposal + tasks + specs as separate
  artifacts, not one file).

### D2: Renderers as ES modules

JS renderers over shell scripts:
- Node is already a hard dependency (ithyno server runs on it).
- Renderers unit-testable in vitest (same suite as everything else).
- Type-safe manifest → output mapping.
- agmsg's shell-script choice was because it runs in dispatch
  environments where Node may not be available; install-time doesn't
  have that constraint.

### D3: Extend `openspec init`, don't add a new subcommand

- Init already prompts for project details; adding a "which CLI"
  question is one more prompt.
- Users don't need to remember a second command.
- Skills install alongside the openspec/ scaffold — one atomic
  step.
- Trade-off: `openspec init` becomes larger. Mitigated by extracting
  the skill-install code into its own module (`server/install-skills.ts`)
  so it can also be invoked standalone (`openspec init --skills-only`
  for re-install).

### D4: Generated files are gitignored per-CLI, source is committed

- `.claude/`, `.codex/`, etc. → gitignored (except a `README.md` in
  each explaining "these files are generated; edit `ithyno/skills/`").
- `ithyno/skills/` → committed source of truth.
- Fresh clone flow: `git clone` → `openspec init` → per-CLI surface
  materializes.
- This flips the current UX ("clone and go") but the payoff is no
  drift-by-hand-edit and a clear source-of-truth.
- Escape hatch: `--commit-generated` flag on install for teams that
  want the current behavior.

### D5: Capability tokens are minimal at v1

Start with just:
- `<capability:subagent_spawn>` — the "run this prompt in a
  sub-worker" primitive. Claude → Task tool. Others → subprocess.
- `<capability:file_write>` — the "modify a file" primitive
  (trivial on all CLIs, but named so the renderer can validate).
- `<capability:bash>` — shell out. Trivial everywhere.

Extend by demand. Overspecifying capability tokens up-front is worse
than underspecifying and iterating.

### D6: CLI enum aligns with agmsg's

The 7 CLIs agmsg's `spawn.sh` supports (`claude-code | codex |
copilot | gemini | antigravity | opencode | cursor`) become the
skill renderer set. This keeps one source of truth for "which CLIs
does ithyno know about" and avoids drift between agmsg's dispatch
side and skills' install side.

### D7: Renderer failure is soft-fail

If a CLI's renderer throws (e.g. Codex's format changed and our
renderer doesn't know), the install:
- Logs the error clearly.
- Continues with other CLIs.
- Exits non-zero with a summary at the end.

Rationale: one broken renderer shouldn't block a Claude+Cursor user
from getting their skills installed.

## Risks

### R1: Codex/Antigravity/Opencode file conventions are moving targets

We can't rely on stable public docs for every CLI. Mitigation:
- v1 ships only `claude` + `codex` renderers (pilot).
- Each additional CLI's renderer is its own tracked change (with
  research + verification against that CLI's current release).
- CI runs the renderers against fixture manifests to catch our own
  regressions, but can't detect upstream CLI-format changes.

### R2: Copilot's single-file `.github/copilot-instructions.md`

Unlike Claude/Cursor where each skill is a separate file, Copilot
uses one project-wide instructions file. The renderer needs to
support **fragment merging** — appending each skill's Copilot
section into a single file, with delimiters so re-runs replace
rather than duplicate.

Mitigation: Copilot renderer includes a section-delimiter convention
(`<!-- ithyno:skill:opsx-propose:start -->` /
`:end -->`) and idempotent merge logic.

### R3: User has a hand-edited `.claude/commands/opsx/propose.md`

If they customized their generated file, re-install would blow it
away. Mitigation:
- Drift guard test in CI catches divergence between source and
  output.
- Install prompts on detected drift: "Your generated file has been
  hand-modified. Overwrite / skip / diff?"
- The manifest could support per-CLI "extension slots" that let a
  user extend the generated output through the universal source,
  removing the incentive to hand-edit generated files.

### R4: `openspec init` grows into a monolith

Adding CLI selection + skill install to init inflates it. Mitigation
per D3: extract into `server/install-skills.ts`, keep init as a
thin composition.

### R5: Skills mention Claude-specific features (Task tool) that no
other CLI has

Some workflow patterns rely on the Task tool's in-process subagent.
For CLIs without it, renderers substitute a subprocess call to
`<cli> --prompt <body>`, but the semantics differ (subprocess has
its own auth session, etc.). Mitigation:
- Capability tokens make the requirement explicit (`<capability:subagent_spawn>`).
- If a CLI can't provide the capability, the renderer skips that
  skill for that CLI, with a warning at install time.
- The manifest's `capabilities_required` list is the contract.

## Alternatives considered

### A1: Keep per-CLI hand-authored skill files

- Pros: No abstraction layer. Renderers are trivial (copy files).
- Cons: 6x maintenance (any workflow change edits 6 files). Drift
  inevitable.
- Rejected.

### A2: Runtime CLI dispatch inside skills (single file, if-else)

- Pros: One file per skill.
- Cons: Skill body becomes a maze of `if claude then X else if
  codex then Y`. Prompts get less readable. Runtime dispatch inside
  a prompt is fragile (the LLM has to interpret the branch).
- Rejected.

### A3: Compile once at commit-time (Git hook or CI)

Instead of install-time render, compile at PR merge time and commit
generated files.
- Pros: Fresh clone works with no install step.
- Cons: PRs bloat with regenerated files (loud diffs). Contributors
  forget to run the compile step.
- Rejected in favor of install-time (D4).

### A4: Third-party tool (something like `openspec-skills-cli`)

- Pros: ithyno-independent.
- Cons: Users have to install another tool. Loses cohesion with
  init flow.
- Rejected.

## Rollout plan

- **v1**: Pilot 2 skills × 2 CLIs (`opsx-propose`, `opsx-apply` ×
  `claude`, `codex`). Install prompt asks CLI, renders both.
- **v2**: Migrate remaining `/opsx:*` and `/ithy-opsx:*` skills.
  Add `cursor` renderer.
- **v3**: Add `antigravity`, `gemini`, `copilot`, `opencode`
  renderers. Each ships as its own change with a small test fixture.
- **v4**: Deprecate `templates/.claude/skills/` completely. Fresh
  clones require `openspec init` to get any skill surface (behavior
  change signaled in release notes).

## Verification approach

- Unit tests per renderer: given a fixed `manifest.yaml` + `SKILL.md`,
  assert exact output bytes.
- Integration test: run install against a tmpdir, assert file tree
  matches golden fixture per selected CLI set.
- Drift test: after any renderer change, run against every current
  skill and compare to committed sources.
- Manual: `openspec init` in a scratch dir, pick each CLI, verify the
  generated files load in that CLI (e.g. Claude Code shows the
  slash command; Cursor shows the rule).
