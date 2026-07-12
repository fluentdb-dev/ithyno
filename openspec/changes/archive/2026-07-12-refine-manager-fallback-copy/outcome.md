# Outcome: refine-manager-fallback-copy

## ✅ Worked

- **User-tested wording in one turn.** The moment the user opened
  the Manager section for the first time, "fallback" landed as
  jargon. Fix took ~15 minutes: swap 4 strings, MODIFY one scenario,
  ship. The PENDING annotation kept the current spec honest for
  the ~5 minutes between propose and archive.
- **Internal state names stayed technical.** `fallbackSource:
  "declared" | "env" | "default"` is API contract; renaming it
  would ripple into store / api / server. Keeping the internal
  names precise while softening the user-facing copy is exactly
  the split that matters.

## ⚠️ Surprises

- **The `add-agents-tab-manager-section` outcome mentioned "The
  4-section header comment is now stale"** — that stale comment
  actually still says 4 sections, not 5. This copy fix didn't
  touch it. Minor follow-up.
- **No client tests exist for the Manager section copy** — nothing
  broke by definition, but nothing verifies the new wording either.
  Client jsdom / testing-library setup remains a follow-up from
  refine-agents-config-modal.

## 🔁 Differently

- **Should have caught this in the propose review** for
  add-agents-tab-manager-section. "Fallback" is a common word in
  developer-facing tools; it's easy to reach for. User-testing
  before the propose lands would have prevented the 2-change
  cycle.

## 🌱 Follow-ups

- **Fix the stale header comment** in `Agents.tsx` (still says
  "4 sections"; actually 5).
- **Reword other developer-jargon copy** proactively — search
  `web/src/` for "fallback", "orphaned", "dispatch" and check
  what's user-facing. Each one is a small propose worth the copy
  hygiene.
