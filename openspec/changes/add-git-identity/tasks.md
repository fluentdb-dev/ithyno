## 1. Server: git module

- [x] 1.1 New `server/git/status.ts` — export `getGitStatus(root)` returning `{ isRepo, root?, headBranch?, reason? }` using `.git` fast-path + `git rev-parse` fallback; treat `ENOENT` (git binary missing) as `{ isRepo: false, reason: "git-missing" }`
- [x] 1.2 New `server/git/config.ts` — export `readGitConfig(root)` using `git config --show-scope --get user.name` / `user.email` to compute both effective and local, and `writeLocalConfig(root, { userName?, userEmail? })` that unsets on empty values
- [x] 1.3 New `server/git/init.ts` — export `gitInit(root)` that runs `git init` when `.git` is missing, returns the new status; idempotent for repos that already exist

## 2. Server: endpoints

- [x] 2.1 `GET /api/git/status` — reads via `server/git/status.ts`, no auth beyond local-only
- [x] 2.2 `GET /api/git/config` — reads via `server/git/config.ts`, local-only
- [x] 2.3 `POST /api/git/config` — mutating; add through the same auth + CSRF gate as other POST endpoints; validates body; calls `writeLocalConfig`; on success emits WS `git-status-updated`
- [x] 2.4 `POST /api/git/init` — mutating; auth-gated; calls `gitInit`; emits WS event on success

## 3. Server: state + broadcast

- [x] 3.1 `WorkspaceState.gitStatus` added to `/api/state` payload
- [x] 3.2 Broadcaster union in `server/util/broadcaster.ts` (or equivalent) gains `git-status-updated`
- [x] 3.3 Diagnostic `console.log` on init / config write success and failure (following the `[start:*]` / `[runner]` style from the existing codebase)

## 4. Web: types + api + store

- [x] 4.1 `web/src/types.ts` — `GitStatus`, `GitConfig`; `WorkspaceState.gitStatus`
- [x] 4.2 `web/src/api.ts` — `fetchGitStatus`, `fetchGitConfig`, `postGitConfig`, `postGitInit` (mutating ones via existing `postJson`)
- [x] 4.3 `web/src/store.ts` — track `gitStatus`; update on initial fetch + on WS `git-status-updated`

## 5. Web: header chip

- [x] 5.1 New `web/src/components/GitIdentityChip.tsx` — initials from `user.name` (up to 2 chars), neutral icon fallback, warning dot when `!isRepo`
- [x] 5.2 Shell detection helper `web/src/runtime/shell.ts` — export `isVsCodeShell()` returning `typeof (window as any).acquireVsCodeApi === "function"`
- [x] 5.3 Mount the chip in the app header (top-right) **only when `!isVsCodeShell()`**; in the VS Code shell the header slot is empty
- [x] 5.4 CSS: circle, size, colors, warning dot (`web/src/styles.css`)

## 6. Web: identity modal

- [x] 6.1 New `web/src/components/GitIdentityModal.tsx` — two visual states (not-a-repo / repo)
- [x] 6.2 Repo state: repo root path (readonly), current branch (readonly), two editable fields with placeholder = effective value, per-field `Source: <scope>` sublabel
- [x] 6.3 Not-a-repo state: `Initialize repository` primary CTA; identity fields disabled with hint
- [x] 6.4 Save button greyed until a field changes; sends only diffed fields; refresh local on 200
- [x] 6.5 Refresh `GET /api/git/config` when the modal opens (initial state gives status but not local)
- [x] 6.6 CSS: modal-specific styles (`web/src/styles.css`)

## 7. Web: picker integration

- [x] 7.1 `web/src/components/Kanban.tsx` `ExecutionPicker` — `worktreeAvailable = gitStatus.isRepo && agents.length > 0`; `worktreeDisabledReason` extended to include the git-repo case
- [x] 7.2 Reason text branches on `isVsCodeShell()`: local/Electron → `"Not a git repository — open the Git panel to initialize."`; VS Code → `"Not a git repository — initialize via VS Code's Source Control."`

## 8. Tests

- [x] 8.1 `server/git/status.test.ts` — covered by integration test (fresh dir → not-a-repo; init → is-repo; subdir cwd walks up)
- [x] 8.2 `server/git/config.test.ts` — `--show-scope` output parsing (7 cases)
- [x] 8.3 `server/git/integration.test.ts` — end-to-end: init on empty dir, no-op on existing repo, write + read + unset local, empty-local fallback, idempotent unset (8 cases)

## 9. Docs

- [x] 9.1 `docs/architecture/git-identity.md` — short doc: capability overview, endpoint shapes, how ExecutionPicker uses the status
- [x] 9.2 `docs/migration-guide.md` — note that `git init` no longer needs to be run before opening the dashboard

## 10. Verification

- [x] 10.1 Fresh dir (no `.git`): dashboard opens with warning chip; ExecutionPicker Worktree disabled with clear reason
- [x] 10.2 Modal init: click chip → click Initialize → `gitStatus.isRepo` flips true across all open tabs
- [x] 10.3 Set local identity: change `user.name`, click Save → `git config --local --get user.name` reflects it
- [x] 10.4 Clear local identity: blank the field, Save → local unset, effective falls back to global
- [x] 10.5 Chip tooltip shows the effective identity (verify with a repo that has only global set)
- [x] 10.6 Auth: `POST /api/git/config` / `/api/git/init` refuses without token (401)
- [x] 10.7 Local-only: same endpoints refuse from a non-loopback address (403)
- [ ] 10.8 VS Code shell (after `add-vscode-extension` lands): chip not mounted; ExecutionPicker Worktree disabled reason mentions VS Code Source Control
