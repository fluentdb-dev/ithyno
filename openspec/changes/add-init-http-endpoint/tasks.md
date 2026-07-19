# Tasks — add-init-http-endpoint

## 1. PENDING annotation

- [x] 1.1 Insert PENDING MODIFIED annotation to
  `openspec/specs/project-init/spec.md` § Preflight Checks

## 2. Spec delta

- [x] 2.1 Write MODIFIED `Preflight Checks` (autoCreateDir /
  autoGitInit recovery paths)
- [x] 2.2 Write ADDED `Init HTTP Endpoint`
  (`POST /api/init` shape + auth + path validation)

## 3. runInit extension

- [x] 3.1 Add `autoCreateDir` option to `bin/init.js`
- [x] 3.2 Add `autoGitInit` option to `bin/init.js`
- [x] 3.3 Add `gitInitPerformed` to the RunInitResult
- [x] 3.4 Update `bin/init.d.ts` to reflect the new options and field

## 4. Tests

- [x] 4.1 `runInit` with `autoCreateDir: true` on a missing dir succeeds
- [x] 4.2 `runInit` with `autoGitInit: true` on a non-git dir succeeds and
  reports `gitInitPerformed: true`
- [x] 4.3 Default behavior (both flags false) still refuses missing dir
  and non-git dir with exitCode 2
- [x] 4.4 `autoCreateDir` creates parent dirs recursively (mkdir -p)

## 5. HTTP endpoint

- [x] 5.1 Create `server/routes/init.ts` with `POST /api/init` handler
- [x] 5.2 Wire into `server/index.ts`
- [x] 5.3 Apply CSRF token middleware (same pattern as agmsg config)
- [x] 5.4 Path validation: reject relative `dir`, reject empty body
- [x] 5.5 Test: 200 on happy path, 401 without auth, 400 on bad body

## 6. Browser UI

- [x] 6.1 Add `initProject()` client to `web/src/api.ts`
- [x] 6.2 Add `NewProjectSection` component to `web/src/pages/Settings.tsx`
- [x] 6.3 Parent-dir input + project-name input + option checkboxes +
  submit + result display
- [x] 6.4 Show action list and "Next steps" panel on success

## 7. Verify

- [x] 7.1 `openspec validate add-init-http-endpoint --strict` VALID
- [x] 7.2 `npm test && npm run typecheck && npm run build` clean
- [x] 7.3 Manual: hit `POST /api/init` from `curl` with valid CSRF
- [x] 7.4 Manual: Settings tab New Project form creates a fresh
  `/tmp/init-http-test-*` project and reports the actions
- [x] 7.5 Auth check: unauthenticated `POST /api/init` returns 401

## 8. Post-impl

- [x] 8.1 `outcome.md`
- [x] 8.2 Update `docs/ideas/2026-07-19-init-from-ui.md` frontmatter:
  `status: partly-promoted` (Electron / VS Code follow-ups still
  pending)
- [ ] 8.3 `/ithy-opsx:archive add-init-http-endpoint`
