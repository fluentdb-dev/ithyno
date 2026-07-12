# Outcome: refine-agents-config-modal

## ✅ Worked

- **initialInput field closes the Phase 5.2 gap.** Users can now set
  the auto-inject line (`/opsx:manage` for Manager, `/ithy-opsx:apply
  ${change_id}` for code workers) from the UI. The placeholder
  switches by role so users see a sensible hint without reading docs.
- **Manager singleton enforced at 3 layers**: loader (2+ managers
  fail load), server writer (upsert-that-would-be-2nd → 400), and
  client modal (Add-mode role dropdown filters out `manager` when
  one exists). Any of the three alone would be a leaky guard;
  belt-and-braces here matches how the earlier config-writer /
  registry pair validates payloads.
- **Manager row's Delete button vanishes cleanly** via a
  one-line `canDelete = agent.role !== "manager"` check. Server-side
  reject with a clear message means even a hand-crafted API call
  can't accidentally strip the Manager.
- **`add-manager-agent-config`'s "picks the first" fallback is
  gone** — the scenario that documented the ambiguity is replaced
  with an explicit `agents[1]` error. Tightening a just-landed spec
  is a smell (should've caught it in the propose), but the PENDING
  annotation makes the transition visible for anyone reading the
  spec today.

## ⚠️ Surprises

- **The `!isAdd && seed !== "new"` idiom is redundant** to TypeScript
  but not obviously so — TS narrows `seed` in the second check
  independently of `isAdd`. Cut to just `seed !== "new"` since that's
  the only narrowing we actually needed.
- **Editing the existing Manager keeps `manager` selectable via
  `isEditingManager`.** Without this the user would open Edit on
  the Manager and see `manager` missing from the dropdown — the
  current value would look invalid. The `isEditingManager` guard
  covers this without adding a new UI state.
- **client tests punted.** Extending `AgentConfigModal.test.ts` for
  placeholder / role-gating would need jsdom + testing-library
  wiring the repo doesn't have yet. Server-side tests cover the
  contract; a separate test-infra change can add DOM-level checks.

## 🔁 Differently

- **Should have folded these guardrails into
  `add-manager-agent-config` itself.** The singleton principle and
  no-delete rule are natural companions to declaring `role: manager`.
  Landing them separately means the "many-manager fallback"
  scenario was live for < 1 day, but the PENDING annotation kept the
  window honest.
- **Considered forcing `role !== "manager"` before delete on the
  Modal side (button gone) AND on the server side (400) AND at the
  loader (already handled).** Kept all three — the loader can catch
  a hand-edited YAML that snuck through, the server can catch a
  client bug, the modal can catch a UX slip. Small triple-cost for
  a big user-facing win.

## 🌱 Follow-ups

- **Client jsdom / testing-library setup.** Tests for the modal's
  placeholder switching, role filtering, and shape-lock hint need a
  DOM-capable test runner. Would also enable Kanban and other UI
  regression tests we've been punting on.
- **Consolidate the "Manager runtime status" story.** The Runtimes
  section on the Agents tab shows worker runtimes; a similar check
  for the declared Manager's `command` (is `claude` on PATH?) would
  prevent silent PTY spawn failures. Landed as a follow-up in
  `add-manager-agent-config`'s outcome.
- **A rebuild trigger for the packaged UI**. Every UI change requires
  `npm run build` to reach the `:55910` production serve, which
  users have to know about. A file watcher that rebuilds on
  `web/src/` change would remove that footgun. Related to the
  Manager entry — the rebuild-and-reload cycle bit us during
  verification of Phase 5.2 → 5.3 → add-manager-agent-config too.
