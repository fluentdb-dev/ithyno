# Outcome — port-ithy-opsx-dispatch-to-universal-source

## ✅ Worked

- **Verbatim copy strategy validated.** `.claude/commands/ithy-opsx/dispatch.md`
  turned out to already be portable markdown — no Claude-specific frontmatter
  fields leaked into the body. The `awk`-based frontmatter stripper produced
  a 934-line SKILL.md from the 941-line source (7 lines of frontmatter
  removed cleanly). No content edits were needed for the port to compile.
- **Zero renderer-code changes.** The universal-source + per-CLI-renderer
  pattern established in `scaffold-ithy-opsx-skills-per-cli` did what it
  promised: dropping a new manifest + SKILL.md into `ithyno/skills/` was
  enough to have all 7 renderers pick it up automatically. No `.ts` edits
  under `server/skill-renderer/renderers/*`.
- **Test extension worked in one pass.** The per-CLI e2e loop refactor
  (from "assert the first written path" to "assert both apply and dispatch
  paths with correct source attribution") ran green on first attempt.

## ⚠️ Surprises

- **Task-tool references in the SKILL.md body.** The ported skill still
  contains Claude-specific phrasing like "spawn via the Task tool" and
  "Manager (this Claude session)". At runtime a non-Claude Manager
  reading this skill will parse the intent (dispatch stage workers)
  correctly, but the concrete instructions won't map perfectly. This is
  the "verbatim first, capability-token substitution later" tradeoff
  the proposal called out — flagging it here so it's visible in outcome
  history when someone later goes to do the polish pass.
- **The `.claude/commands/ithy-opsx/dispatch.md` copy is still on disk.**
  This change did NOT remove it — that removal is gated on ALL skills
  being ported (per the previous change's Task 4 exit criterion). Until
  then, Claude users get the hand-authored file AND the renderer's
  generated file at the same path — the renderer's write-behavior needs
  a verify at some point that it doesn't clobber the hand-authored one
  in a surprising way. (Current renderers write to the same path;
  hand-authored copy is redundant but not incorrect for Claude.)

## 🔁 Differently next time

- **Batch-port similar skills.** dispatch was the pilot for "just copy
  the body verbatim, no code change needed". `archive` / `merge` /
  `revert` follow the same shape (thin `.claude/commands/*.md` files
  delegating to a `.claude/skills/*/SKILL.md`) and could ship as one
  bundled change: "port the ithy-opsx skill trio to universal source"
  instead of three separate proposals. The per-skill proposal was
  right for THIS one (proves the port model works, keeps the delta
  small), but subsequent ones should batch.

## 🌱 Follow-ups

1. **Remaining skills to port** (in rough priority for the Kanban-Start
   pipeline being usable end-to-end under non-Claude Managers):
   - `ithy-opsx:archive` — needed for the archive step of any completed
     change; user-triggered rather than dispatch-triggered but still
     hot.
   - `ithy-opsx:review` and `ithy-opsx:verify` — worker skills the
     ported dispatch will try to invoke on the review/verify stages.
     Without them, non-Claude workers can't respond.
   - `ithy-opsx:dispatch-multi` — sibling of dispatch, multi-change
     variant.
   - `ithy-opsx:answer`, `ithy-opsx:escalate` — needs-human helpers
     the dispatch flow references.
   - `ithy-opsx:apply` — a Claude-specific auto-commit apply variant;
     the universal `opsx:apply` shipped by upstream OpenSpec covers
     most cases. Port only if we keep depending on the auto-commit
     behavior.
   - `ithy-opsx:import`, `ithy-opsx:merge` — utility skills.
2. **Capability-token abstraction pass.** After the mechanical ports
   land, walk each SKILL.md and replace `Task tool` → `<capability:
   subagent_spawn>`, `Bash` → `<capability:bash>` etc. The renderer
   already substitutes these tokens per-CLI. This is polish, not
   correctness — the ported skills work as-is on Claude and are
   parseable-if-imperfect on non-Claude.
3. **`.claude/commands/ithy-opsx/*.md` retirement.** Once ALL skills
   are ported (item 1 complete), remove the hand-authored templates
   and their `templates/.claude/commands/ithy-opsx/*.md` mirrors, so
   there's only one source of truth per skill.
