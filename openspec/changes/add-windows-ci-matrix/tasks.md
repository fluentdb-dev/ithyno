# Tasks

## 1. Workflow file

- [x] 1.1 Create `.github/workflows/test.yml` with `name: Test`,
      triggers `pull_request` + `push: branches: [develop, main]` +
      `workflow_dispatch`.
- [x] 1.2 Set `concurrency: group: test-${{ github.ref }}` with
      `cancel-in-progress: true` (distinct group from `release.yml`'s
      `release-${{ github.ref }}`).
- [x] 1.3 Define one job `test` with `runs-on: ${{ matrix.os }}` and
      `strategy: matrix: os: [macos-latest, windows-latest,
      ubuntu-latest]` + `fail-fast: false`.
- [x] 1.4 Set `defaults.run.shell: bash` at the job level so every
      `run:` step uses bash (git-bash on Windows). Prefer this over
      per-step `shell: bash` for brevity.
- [x] 1.5 Steps in order:
      - `actions/checkout@v4`
      - `actions/setup-node@v4` with `node-version: '20'` and
        `cache: 'npm'`
      - `npm ci --include=optional`
      - `npm run typecheck`
      - `npm test`
      - `npm run build`
      - `npm run openspec -- validate --all`
- [x] 1.6 Do NOT add an `actions/upload-artifact@v4` step —
      `release.yml` owns artifact production.
- [x] 1.7 Do NOT reference `secrets.*` beyond the default
      `GITHUB_TOKEN` (which is auto-provisioned and not called out).

## 2. Line-ending policy

- [x] 2.1 Create root `.gitattributes` declaring `* text=auto eol=lf`.
- [x] 2.2 Add `-text` exceptions for known binary patterns: `*.png`,
      `*.jpg`, `*.jpeg`, `*.gif`, `*.ico`, `*.icns`, `*.pdf`, `*.woff*`,
      `*.ttf`, `*.otf`, `*.dmg`, `*.exe`, `*.vsix`, `*.tgz`, `*.zip`,
      `*.node` (native modules).
- [x] 2.3 Run `git add --renormalize .` locally after landing
      `.gitattributes`; if it produces file changes, commit them as a
      separate "renormalize line endings" commit landed alongside the
      workflow. If it produces no changes, this step is a no-op — note
      it in the impl commit message.
      → **No-op on this macOS checkout**; renormalize produced zero
      file changes. Windows CI first-run may still stage LF-normalized
      diffs; if so, land a follow-up renormalize commit from a Windows
      or Linux machine.
- [x] 2.4 Verify no *intentionally-CRLF* file exists in the repo (grep
      for known Windows shell scripts). If any exist, add specific
      `path/to/file text eol=crlf` overrides.
      → No `*.bat`, `*.cmd`, or `*.ps1` files present; nothing needs a
      `text eol=crlf` override.

## 3. Test suite path-separator audit

- [x] 3.1 Grep for hard-coded `"/"` string joins in `server/**.ts` and
      `web/src/**` tests: `grep -rn "'/'" server/ web/src/ | grep -v
      "://" | grep -E "path|join|resolve"`.
      → Zero hits. No hard-coded forward-slash path joins in the test
      corpus. Existing tests already use `path.join()` / `path.resolve()`.
- [x] 3.2 For each hit, decide: is this a POSIX-only path (safe to
      leave), or a filesystem path that should use `path.sep` /
      `path.join()`? Fix in place if the latter.
      → N/A (no hits from 3.1).
- [x] 3.3 Do NOT proactively refactor non-test source code unless a
      Windows CI run reveals a concrete regression. This audit is
      scoped to tests only.

## 4. Verification — pre-merge (dev machine)

- [x] 4.1 `npm run openspec -- validate add-windows-ci-matrix --strict`
      passes.
- [x] 4.2 `npm test` on macOS still passes after `.gitattributes` and
      any test-file edits (baseline). Pre-existing `sharp` module
      failure in `scripts/build-icons.test.mjs` accepted (out of scope).
- [x] 4.3 `npm run typecheck` passes.
- [x] 4.4 `npm run build` passes (`npx vite build` clean).
- [ ] 4.5 Push the change to a scratch branch and open a draft PR
      against `develop`. Confirm `test.yml` fires the three-OS matrix
      and all three go green. This is the primary correctness signal
      — a mac-only pass in local dev does NOT prove Windows will pass.
      → **Deferred to manager.** Worktree cannot push. First real
      three-OS run happens once this branch reaches GitHub via merge.

## 5. Verification — Windows-specific expected outcomes

- [ ] 5.1 On the Windows job, confirm `npm ci --include=optional`
      completes without node-pty rebuild errors. If it fails, apply
      the D5 fallback from `design.md`:
      - Add a Windows-conditional step that runs `npm ci
        --ignore-scripts --include=optional` instead.
      - Introduce a `NODE_PTY_UNAVAILABLE=1` env for the Windows job
        and skip pty-touching tests when that flag is set.
      - Open a follow-up change `fix-node-pty-windows-prebuild` to
        resolve properly.
      → Deferred until CI actually runs.
- [ ] 5.2 On the Windows job, confirm the template drift guard
      (`server/init.test.ts` `describe("ithy-opsx template drift
      guard")`) passes. If it fails with CRLF-related byte mismatches,
      revisit `.gitattributes` scope and re-renormalize.
      → Deferred until CI actually runs.
- [ ] 5.3 On the Windows job, confirm `openspec validate --all`
      passes. If it fails on path-separator issues in openspec
      internals, escalate — that is upstream OpenSpec's bug, not
      this change's scope.
      → Deferred until CI actually runs.

## 6. Non-goals (do NOT do)

- [x] 6.1 Do NOT modify `release.yml`. Its matrix is already correct
      for release-build; changing it is out of scope.
- [x] 6.2 Do NOT automate the "no `[install-skills]` log line" Doctor
      sanity check. Remains Phase C manual. If a follow-up wants it,
      that is a separate proposal.
- [x] 6.3 Do NOT add a Node-version matrix. Node 20 only.
- [x] 6.4 Do NOT add arm64 runners. x64 only.

## 7. Outcome

- [x] 7.1 Write `openspec/changes/add-windows-ci-matrix/outcome.md`
      capturing:
      - ✅ Worked: three-OS matrix green on first PR, or list of fixes.
      - ⚠️ Surprises: any CRLF drift not caught by `.gitattributes`,
        any node-pty install issue, any Windows-specific test failure.
      - 🔁 Differently: if any decision (D1–D7) turned out wrong in
        practice, name it.
      - 🌱 Follow-ups: `fix-node-pty-windows-prebuild` (if D5 fallback
        used), any spec.md updates in `openspec/specs/` that surfaced
        Windows-only bugs, extending the matrix to more Node
        versions / arm64 later.
