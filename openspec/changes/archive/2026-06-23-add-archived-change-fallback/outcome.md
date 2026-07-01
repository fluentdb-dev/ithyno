## ✅ What worked
- **Parse archive date server-side, not client-side.** The directory name regex (`^(\d{4}-\d{2}-\d{2})-(.+)$`) is the right place for it — clients shouldn't reparse names.
- **Two-tier detection in ChangeDetail** (active → archive → not-found) preserved the legitimate "typo" message while fixing the after-archive UX. Backward compatible by construction.
- **No new URL** (`/change/:id` handles both states) kept the change small and shareable links unchanged.

## ⚠️ What surprised us
- The earlier `add-embedded-terminal` work had already moved `changeIdForPath` to `path.relative` + `path.sep`, so cross-platform paths were a non-issue here. Felt good to see prior groundwork pay off.

## 🔁 What we'd do differently
- Could have anticipated post-archive UX during `add-ui-orchestration` and bundled the fallback in — it surfaced only once we actually used the Archive button. Lesson: when shipping any destructive action, sketch the page-after-the-action at design time.

## 🌱 Follow-ups
- A dedicated archive viewer at `/archive/<id>` that renders the whole archived bundle (proposal / design / specs / outcome) — left as future work; the current fallback panel is the minimum.
- This very change is the "after the action" upgrade that should have been part of the original action's design — see "How design should anticipate post-action state".
