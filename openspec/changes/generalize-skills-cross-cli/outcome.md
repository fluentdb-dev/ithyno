# Outcome — v1 pilot slice

## 🔁 Round 2 — fable review rework (2026-07-29)

An independent code review by a fable-model agent flagged 10 findings
(3 Med, 5 Low, 2 deferred to natural follow-up changes). Addressed 8
in this same commit before archive:

- **#1 YAML escape** — `frontmatter()` now emits via `yaml.stringify`
  instead of hand-rolled `key: ${value}`. Descriptions containing `: `,
  leading `#`/`[`/`>`/`&`, or backslashes now round-trip cleanly. Test
  covers the pathological case.
- **#2 vacuous skip test** — replaced with a synthetic-fixture test
  that builds a `supports: [codex]` skill in a tmpdir and installs for
  `[claude]`, asserting the real skip branch is exercised.
- **#3 all-or-nothing discovery** — `discoverSkillSourcesDetailed()`
  now returns `{sources, errors}`. Malformed YAML, name mismatch, and
  stat failures route per-entry into `installSkills().errors` with a
  `discover:` prefix; healthy skills still install. Tested with a
  mixed fixture (1 healthy + 1 broken YAML + 1 name-mismatch).
- **#4 leak guard matrix** — new test loops over
  `knownRendererClis() × KNOWN_TOKENS`, rendering a synthetic body per
  pair and asserting no raw `<capability:*>` survives. Regex widened
  to `[a-z0-9_]*` (matches the linter's).
- **#6 hardcoded `["claude"]` list** — replaced with
  `knownRendererClis().join(", ")` so the error message updates
  automatically when codex/others land.
- **#7 byte count wrong unit** — `InstallResult.bytes` now uses
  `Buffer.byteLength(content, "utf8")`. Test asserts it matches
  `stat.size` on disk and diverges from `content.length` (proven by
  the em-dash-bearing GENERATED banner).
- **#8 `String.replace` $-pattern defense** — placeholder fill and
  token expansion both use the function form
  (`.replace(re, () => value)`). Test constructs a manifest with
  `namespace: "ns$&x"` and asserts the literal is preserved.
- **#10 comment + path** — fixed the self-referencing comment
  ("install-skills.test.ts" → "server/skill-renderer.test.ts") and
  replaced `import.meta.url === \`file://${process.argv[1]}\`` with
  `pathToFileURL(process.argv[1]).href` (works with paths containing
  spaces).

**Deferred to follow-up changes** (per the review's own recommendation
+ my judgment):

- **#5 status discriminant** — partial fix (dry-run diff surfaced in
  `written` with a `diff` note instead of `errors`, so consumers
  gating on `errors.length === 0` stay clean). The full `created |
  updated | unchanged` discriminant belongs to the wire-into-init
  change where the consumer's needs shape the API.
- **#9 capability skip mechanism** — deferred to the Copilot renderer
  change (first concrete need for a renderer that can't satisfy all
  three v1 capabilities). Documented in that change's design when
  landed.

Test count: 12 → 18. All green. Build clean. Linter clean.

---


## ✅ Worked

- **The three-piece separation (source / manifest / renderer) is clean.**
  `ithyno/skills/ithy-opsx-apply/SKILL.md` (portable prose + capability
  tokens + placeholders), `manifest.yaml` (metadata + per-CLI overrides),
  and `server/skill-renderer/renderers/claude.ts` (~60 lines) together
  produce a valid `.claude/commands/ithy-opsx/apply.md` end-to-end.
  Adding a new CLI = writing one more file under `renderers/`. Adding a
  new skill = one directory under `ithyno/skills/`.
- **Capability tokens work as designed for the v1 vocabulary.**
  Three tokens (`<capability:subagent_spawn>`, `<capability:file_write>`,
  `<capability:bash>`) cover every current usage in `ithy-opsx-apply`.
  Renderer expansion is a simple regex replace — no LLM interpretation
  needed, deterministic, testable via golden fixture.
- **Byte-identical no-op re-install works from day one.** The
  installer reads existing content before writing; identical bytes →
  skip `fs.writeFile`. Test confirms mtime is unchanged. This drops
  the "install churn" that would otherwise show up in `git status`
  after every install.
- **Naming collision caught early.** The prior
  `add-doctor-and-installer` change already had a `server/install-skills.ts`
  for a *different* concept (bundled skill install into `~/.claude/`).
  Renaming my module to `server/skill-renderer/` before commit avoided
  a confusing import graph. Two related-but-distinct concepts get their
  own namespace.

## ⚠️ Surprises

- **The propose named `opsx-propose` as the pilot skill, but that
  skill doesn't live in this repo.** `.claude/commands/opsx/*` and
  `.claude/skills/openspec-*` are shipped by the upstream `openspec`
  npm package, not by ithyno. The repo owns `ithy-opsx-*` commands
  and skills. Pivoted the pilot to `ithy-opsx-apply` (small,
  self-contained, exercises all three capability tokens). Lesson:
  distinguish `opsx-*` (upstream) from `ithy-opsx-*` (our) surface
  more carefully in future propose text.
- **`Write` silently no-op'd on the pre-existing `install-skills.test.ts`.**
  The tool returned "File created successfully" but the file still
  held the old test content. The vitest run then reported "12 tests
  passed" — but they were the OLD tests, not the ones I just "wrote."
  Only after grepping the file did the collision surface. The
  `Write` failure was flagged by an earlier tool call ("File has
  not been read yet"), but that error got lost in the flow. Adding
  a defensive "read the file before overwriting" step is now habit.
- **The generated file for `ithy-opsx-apply` is NOT byte-identical
  to the existing hand-authored `.claude/commands/ithy-opsx/apply.md`.**
  Frontmatter shape differs (renderer emits a GENERATED banner),
  capability token expansion adds "(or /ithy-opsx:dispatch for a
  live-shell worker)" that the hand-authored version doesn't have,
  and section boundaries are formatted slightly differently. That's
  expected — the whole point of the reshape is that the source is
  the truth and the target is derived. But the "compare rendered vs
  hand-authored" drift-guard test (§10) has to wait until we actually
  migrate (§9), because right now the hand-authored file is still
  the truth in practice.
- **Codex-as-separate-change turned out to be the right call.**
  I'd have blocked on Codex format research and the whole session
  would have stalled. Deferring §6 kept the pipeline provable with
  a single CLI (claude) and one skill (ithy-opsx-apply).

## 🔁 Differently

- **Should have picked the pilot skill from the actual repo surface
  before writing the propose.** I named `opsx-propose` in
  proposal.md § "What Changes" without checking whether that skill
  lives here. Small drift, easily corrected, but the impl had to
  clarify.
- **JSON schema validation via `Ajv` would be stronger than the
  runtime checks I wrote.** The current tests check individual
  fields (name matches dir, namespace shape, capabilities are
  known); a real schema validator would catch e.g. an unknown
  top-level key in `manifest.yaml`. Not blocking, but v2 should
  add Ajv.
- **`server/skill-renderer/index.ts` and
  `server/install-skills/*.ts` (existing) are close enough in
  concept that they'll likely need unification later.** Both are
  "put files somewhere." The former is project-local rendering;
  the latter is user-global bundle install. A future change may
  extract a shared "file-write plan + write" primitive.

## 🌱 Follow-ups

- **`add-codex-skill-renderer`** — the deferred §6 as its own
  change. Requires Codex prompt/command surface research (WebFetch
  Codex docs, verify against a live Codex install).
- **`wire-skill-renderer-into-openspec-init`** — §7. Adds CLI
  picker to `openspec init`, reuses `runDoctor()` detection,
  passes selection to `installSkills()`.
- **`migrate-claude-skills-to-generated`** — §9-§10. Big
  destructive edit: `.gitignore` the generated dirs, remove
  `templates/.claude/skills/`, update `walkTemplates`, update the
  drift-guard test to compare against renderer output. Doing this
  in isolation keeps the pilot commit reviewable.
- **Per-CLI renderer changes** — one propose+impl each for
  antigravity, cursor, gemini, copilot (which needs fragment-merge
  support first), opencode. Each ships golden fixtures for its own
  format.
- **Ajv-based manifest validation.** Replace the runtime field
  checks in `server/skill-renderer.test.ts` with a proper
  JSON-schema pass.
- **Migrate the remaining 10 `ithy-opsx-*` command wrappers.**
  Once the pipeline is trusted, extract each of
  `archive.md`, `revert.md`, `dispatch.md`, `dispatch-multi.md`,
  `import.md`, `merge.md`, `verify.md`, `review.md`, `escalate.md`,
  `answer.md` to `ithyno/skills/`. Progressive migration keeps risk
  low.
- **`.claude/skills/*` (not just commands).** Some ithy-opsx-*
  entries under `.claude/skills/` also need renderer support if we
  want the discoverable-skill flow. `manifest.yaml.per_cli.claude`
  could grow a `emit_skill_file: true` hint.
- **Fragment-merge primitive.** Landed as a `mode: "fragment-merge"`
  slot in the renderer output type but not implemented. First real
  need is Copilot's `.github/copilot-instructions.md`.
- **Bidirectional check: hand-edit detection.** Before we migrate
  (§9), add a warning: "you edited the generated file — those
  changes will be lost on re-install; move them to the source."
  Same shape as the drift test but pointed the other way.
