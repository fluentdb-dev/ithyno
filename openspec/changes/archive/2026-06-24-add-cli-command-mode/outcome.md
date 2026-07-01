## ✅ What worked
- **Server stays mode-agnostic.** `/api/pty/inject` writes whatever bytes the UI sends; all `/opsx:*` vs `npx openspec` decisions live in the UI. Adding a mode required zero server changes.
- **Asymmetric Apply was the right call.** In CLI mode Apply has no single-command equivalent; disabling the button with a tooltip beat sending something that wouldn't work.
- **Mode badge on buttons** made the current style visible before opening the modal. Caught the "which mode am I in?" question at a glance.
- **Mode preference persisted to localStorage** with the same pattern as `terminalVisible`. Consistent persistence story across the app.

## ⚠️ What surprised us
- The "different input per mode" decision (description vs kebab-case id) felt risky during design but read as obviously honest in use — the two commands really do take different inputs.
- `npx openspec` resolves the locally-installed `@fission-ai/openspec` cleanly because it's a devDep; no network fetch surprise.

## 🔁 What we'd do differently
- The mode toggle in each modal is duplicated with the global default. A topbar-level mode indicator would scale better if more actions are added later; per-modal toggles can be removed once that exists.

## 🌱 Follow-ups
- Topbar-level command-style indicator + toggle, so Overview's "+ New Change" button reflects mode without opening the modal twice.
- `tags:` frontmatter on this change's proposal once `add-cross-cutting-tags` ships, so the per-tag view can stitch this with `add-ui-orchestration` (its predecessor).
