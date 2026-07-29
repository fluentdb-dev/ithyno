# Tasks

## 1. Scaffold reachability smoke

- [x] 1.1 In `server/init.test.ts`, add a `describe("ithy-opsx scaffold reachability smoke")` block near the existing `describe("ithy-opsx template drift guard")`.
- [x] 1.2 The block SHALL set up a per-test `mkdtemp()` in `beforeEach` and clean up in `afterEach` (mirror the existing `runInit + writeAgentsYaml integration` setup at the file's tail).
- [x] 1.3 First test: `runInit({ targetDir, autoGitInit: true, quiet: true })` returns `ok: true`, then iterate every file under `.claude/commands/ithy-opsx/` (via the same `walk()` helper the drift guard uses — reuse, don't duplicate) and assert byte-identical presence at `<target>/.claude/commands/ithy-opsx/<name>`.
- [x] 1.4 Second test: same as 1.3 but for `.claude/skills/ithy-opsx-*/` — iterate `readdir` under `.claude/skills/`, filter `.startsWith("ithy-opsx-")`, walk each, assert byte-identical presence at `<target>/.claude/skills/<skill>/…`.
- [x] 1.5 Failure messages name the specific relative path that failed to land, so a reader can grep `bin/init.js` / `walkTemplates` for the culprit in one step.
- [x] 1.6 Extract the `walk()` helper from the existing drift-guard block to a module-scope function so both `describe`s can share it (or leave two copies if the extraction adds more noise than it removes — decide during impl).

## 2. Package shape smoke

- [x] 2.1 In `server/init.test.ts`, add a `describe("ithy-opsx package shape smoke")` block.
- [x] 2.2 Shell out to `npm pack --dry-run --json` via `execFile("npm", ["pack", "--dry-run", "--json"], { cwd: process.cwd() })`.
- [x] 2.3 Parse the JSON output; `npm pack --json` returns an array with a single object containing a `files: [{path: string, size: number, ...}, ...]` array.
- [x] 2.4 First assertion: `files.filter(f => /ithy-opsx/.test(f.path))` — every path in the filtered set MUST match `^templates/\.claude/` prefix.
- [x] 2.5 Second assertion: no path matches `^\.claude/commands/ithy-opsx` or `^\.claude/skills/ithy-opsx-` (bare `.claude/…` shipping is a regression).
- [x] 2.6 On assertion failure, the message includes the offending path AND names `distribute-ithy-opsx-via-init-templates` as the contract being violated, so a future contributor knows where to look.
- [x] 2.7 Defensive: wrap the JSON parse in `Array.isArray(parsed) && Array.isArray(parsed[0]?.files)` — throw a clear "npm pack --json output shape changed" error if the shape doesn't match, rather than a cryptic `undefined is not an array`.

## 3. Test suite integration

- [x] 3.1 Verify the new `describe` blocks run under the existing `npx vitest run server/init.test.ts` invocation with no config changes.
- [x] 3.2 Confirm `npm test` (which shells to `vitest run --config vitest.config.ts`) picks up the new tests automatically — no `vitest.config.ts` edits needed.

## 4. Verification

- [x] 4.1 `npm run openspec -- validate add-init-scaffold-smoke-test --strict` passes.
- [x] 4.2 `npm test` passes with the new tests included (delta: 4 new tests, ~5s wall-clock added).
- [x] 4.3 `npm run typecheck` passes.
- [x] 4.4 Manual regression check: temporarily edit `bin/init.js` `walkTemplates` to filter out `ithy-opsx-*` skills, run the smoke — MUST fail with a named skill path. Revert the edit; test MUST pass again. Do NOT commit the temporary edit.
- [x] 4.5 Manual regression check: temporarily add `.claude/commands/ithy-opsx` to root `package.json` `files`, run the package-shape smoke — MUST fail with the offending path. Revert; MUST pass again. Do NOT commit the temporary edit.
- [x] 4.6 Write `openspec/changes/add-init-scaffold-smoke-test/outcome.md`.
