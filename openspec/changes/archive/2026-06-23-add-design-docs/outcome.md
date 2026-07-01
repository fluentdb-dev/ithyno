## ✅ What worked
- **`docs/` as a single unified document space.** Putting stage-① ideas, stage-② design notes, and (future) stage-⑤ typedoc output under one umbrella turned the dashboard into a coherent docs browser without per-stage UI special-casing.
- **`gray-matter` on the server + `react-markdown` on the client** was about as minimal as a markdown stack gets. Bundle-size cost was modest; rendering quality matched our existing OpenSpec content out of the box.
- **Sidebar status dots for idea files** showed lifecycle at a glance. Effort was tiny (one CSS variable per status) and the payoff was immediate.
- **Reused the existing `Watcher` class for `docs/`**: instantiating it twice rather than rebuilding it kept the file-watch architecture homogeneous and gave us echo suppression and `awaitWriteFinish` for free.

## ⚠️ What surprised us
- The first iteration shipped the colored status dots without a legend. Discoverability was poor — the user asked "what do these colors mean?" Lesson: any new visual encoding needs a legend or a tooltip in the same change, not as a follow-up.
- React-markdown's GFM plugin already handles task-list checkboxes, tables, code blocks, blockquotes — we wrote almost no per-element styling.

## 🔁 What we'd do differently
- Include the status legend in v1, as we eventually did during verification. Marker without a key is a usability bug.
- Sort: I shipped "directories first, then files." VS Code's convention was the right reference, but we could have also alphabetized dirs and files together for a flatter feel. Worth revisiting if the tree grows.

## 🌱 Follow-ups
- `add-cross-cutting-tags` (queued): the tag chips currently in the Docs viewer are non-clickable. Making them navigate to `/tags/<ns>/<name>` is the whole purpose of the next change.
- `add-archive-outcome` (this change!): demonstrates the "feedback channels" sketch — outcomes need a home in the docs space too. Long term, the Capabilities page (per `feedback-channels` idea) stitches outcome + spec + code.
- Typedoc integration in `add-code-docs` will write into `docs/api/`, and the same Docs page will pick it up without code changes.
