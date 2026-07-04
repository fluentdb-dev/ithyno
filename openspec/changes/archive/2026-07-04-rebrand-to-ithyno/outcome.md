# Outcome: rebrand-to-ithyno

## ✅ Worked

- **`ithyno` = app / `OpenSpec` = workflow** — the split holds up
  everywhere the two terms are used. Keeping the `openspec/`
  directory name, upstream `openspec archive` CLI,
  `.claude/skills/openspec-*` skills, and `/opsx:*` slash commands
  untouched meant the workflow's identity kept its clean references
  to Fission-AI/OpenSpec, while every user-facing surface (window
  title, banner, VSCode palette, HTML title, README heading) now
  reads "ithyno".
- **Env-var rename was mechanical.** `OPENSPEC_UI_*` /
  app-owned `OPENSPEC_*` → `ITHYNO_*` swapped cleanly via `perl -i
  -pe` across `server/`, `electron/`, `vscode-extension/`. No
  runtime surprises because everything was flag-driven, not
  key-serialized-anywhere.
- **`git mv bin/openspec-ui.js bin/ithyno.js` preserved history.**
  `git log --follow bin/ithyno.js` still walks back through the
  binary's earlier revisions.
- **VSIX package + Electron shell picked up the rename with zero
  code changes beyond the string-swap.** The VSIX now builds as
  `ithyno.vsix`, the palette shows `ithyno: Show Dashboard`, and
  the Electron window title reads "ithyno" — all from the same
  edit path (package.json `name` + display strings).
- **localStorage key rename was invisible.** Existing dev users on
  this branch lost their persisted preferences (terminal
  visibility, command style, overview layout, task filter,
  session token) but the fallbacks are all sensible defaults so
  the UX did not regress. No external users to worry about.

## ⚠️ Surprises

- **`git mv` + subsequent in-place edits didn't stage together.**
  Ran `git mv bin/openspec-ui.js bin/ithyno.js`, then edited
  `bin/ithyno.js` (commander name, env vars). The first commit
  registered the rename as `rename (100%)` — meaning the content
  match was against the pre-edit copy still in the index. My edits
  landed AFTER the mv but AFTER the initial `git add` too, so they
  weren't in the initial commit. Needed a follow-up "complete
  stale-ref sweep" commit (81e8daf) to capture bin/ithyno.js's
  actual rebrand content. Lesson: with `git mv`, do the content
  edits BEFORE the first `git add` for that file, or explicitly
  re-add after the edit.
- **Some files carry rebrand + unrelated in-flight work.**
  `server/index.ts` (writeback + revert-pty + external-discard
  code) and `agents.yaml.example` (revert-pty docs) both had their
  rebrand env-var / string swaps done in the same session but
  couldn't be committed as part of "rebrand" cleanly. Left dirty;
  the env-var lines will land alongside those other changes' impl
  commits. Not a rebrand problem per se — a byproduct of committing
  archive-only until now.
- **`openspec-flow` skill name is misleading.** It's project-local
  but the `openspec-*` prefix suggests upstream ownership. Users
  hesitate to edit it. Renaming to `ithy-flow` is now proposed
  under `add-impl-commit-and-rename-flow-skill`.
- **`grep -rn` audit had to keep excluding the same things over
  and over.** `node_modules`, VSIX `host/`, TS compile `out/`,
  Vite `dist/`, `openspec/changes/archive/` (historical prose is
  meant to stay), test fixtures with `/Users/dev/openspec-ui` as
  a hardcoded string. A `.gitattributes` or `.gitignore` for
  audits doesn't exist; ended up piping through repeated
  `grep -v`. Fine for one-off, would be worth a helper for
  ongoing renames.

## 🔁 Differently

- Considered keeping `bin/openspec-ui.js` as a thin alias
  (`require('./ithyno.js')`) for backward compat. Rejected because
  no external consumers exist yet — the whole point of doing this
  now is that we don't need shims. Alias adds a wart to the source
  tree with no upside.
- Considered renaming `openspec/` directory to `ithyno-spec/` or
  similar. Rejected — that's the OpenSpec workflow's directory
  convention, not ours. Renaming it would break the whole point of
  operating on top of OpenSpec.
- Considered leaving `web/src/*.tsx` "OpenSpec UI" strings alone
  (arguing they're "internal"). Overturned — users see the header
  logo, the toast messages, the error banners. All of those are
  user-facing.

## 🌱 Follow-ups

- **`add-impl-commit-and-rename-flow-skill`** (proposed, awaiting
  impl) — renames the `openspec-flow` skill to `ithy-flow` for
  ownership clarity + introduces the `impl:` commit type between
  propose and archive. Fixes the "one giant archive commit"
  history problem this session ran into.
- **`server/index.ts`, `agents.yaml.example` rebrand chunks land
  with their sibling changes.** `writeback` / `revert-pty` /
  `external-discard` implementations will each carry the rebrand
  env-var / display-string edits they touched. Not a separate
  follow-up — falls out of the batch-impl-commit strategy.
- **npm publish** — `ithyno` is not yet on npm. When we publish,
  make sure the `bin` field's binary name (`ithyno`) is what
  `npx ithyno` and `npm install -g ithyno` resolve to. Verify with
  `npm pack --dry-run` before publishing.
- **VS Code marketplace publisher `ithyno`** — currently set as
  the publisher in `vscode-extension/package.json` but not yet
  claimed on the marketplace. If someone else grabs it, we'd need
  to rename to a scoped publisher (e.g. `ithyno-official`).
  Reserve the ID sooner rather than later.
- **Rename `openspec-ui/` on-disk directory** — user's local
  working checkout is still at `/Users/cishihara/Documents/works/
  openspec-ui/`. Fine to leave; users clone into whatever dir they
  want, and git repo name / GitHub URL are separate concerns.
