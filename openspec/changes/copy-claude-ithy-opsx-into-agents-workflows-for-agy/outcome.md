# Outcome — copy-claude-ithy-opsx-into-agents-workflows-for-agy

## ✅ Worked

- **Co-locating with `migrate-agy.ts` was the right call.** Both the
  MOVE (legacy-dir) and COPY (claude-commands) operations are
  agy-specific rescue routines that fire under the same install
  condition. One file, two exports. No new module needed.
- **`kind: "move" | "copy"` discriminant added without breaking
  existing consumers.** Made the field optional; existing code paths
  that check `moved` or index `migrations[0]` still work (MOVE is
  index-0 because it runs first). Test file needed 2 tweaks (one
  cosmetic — check the found entry via `.find(m => m.kind === "move")`
  — and one addition to the "empty entry" test to match the new
  two-entry shape).
- **9 new tests all green first run.** 5 unit + 4 install wire-up.
  Total 49 → 58 in this file, 679 → 688 in the whole suite.

## ⚠️ Surprises

- **The order-of-operations test came out interesting.** Seeding
  `.claude/commands/ithy-opsx/apply.md` (which shares a basename
  with what the renderer will write) verified the concrete sequence:
    1. copy hook runs → target absent → COPIES the stale claude file
    2. renderer runs → target present → OVERWRITES with correct
       universal-source-derived content
  So even when the COPY plants a stale file at the renderer's
  eventual target, the renderer's authoritative write comes last
  and wins. Documented in-line so this doesn't look like a bug to
  future maintainers.

## 🔁 Differently next time

- **Discriminant field on shared shapes is worth doing up front.**
  Adding `kind` mid-flight required re-touching the previous change's
  test expectations. Cleaner would have been to design
  `migrations[]` with `kind` from the start when the first entry
  type landed. Fine for this cascade because the two changes are
  in the same session, but a lesson for structurally similar work.

## 🌱 Follow-ups

1. **Consider deleting `.claude/commands/ithy-opsx/*.md` for
   agy-only projects.** COPY is safe but leaves duplicate content
   on disk. A future "unify-cli-workspace" change could offer to
   remove `.claude/` entries when Claude is NOT among selectedClis
   for N consecutive installs. Deferred — user chose COPY explicitly,
   and destructive cleanup should be opt-in / user-visible.
2. **The `.claude/commands/ithy-opsx/*.md` files themselves are
   an anti-pattern going forward.** With the per-CLI renderer
   generating them from `ithyno/skills/`, hand-authored `.claude/`
   files should not exist in new projects. This change handles the
   legacy case for existing projects; the removal-from-templates
   piece is tracked in the (still open) "delete templates/.claude/
   command trees once all skills ported" task in the parent capability.
3. **Report upstream to openspec that antigravity adapter is
   using `.agent/` instead of `.agents/`.** Same follow-up as the
   previous change (migrate-legacy-agent-workflows-to-agents-on-init)
   flagged.
