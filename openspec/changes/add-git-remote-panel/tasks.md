## 1. Server: git remote helpers

- [ ] 1.1 `server/git/remote.ts` (new) — `readOriginUrl(repoRoot: string): Promise<string | null>` — runs `git config --get remote.origin.url`, returns `null` on exit-code 1 (unset)
- [ ] 1.2 `writeOriginUrl(repoRoot: string, url: string): Promise<void>` — probes `readOriginUrl` first; if null runs `git remote add origin <url>`, else runs `git remote set-url origin <url>`
- [ ] 1.3 Unit test with a fresh temp git repo: `writeOriginUrl` on a repo without origin → readOriginUrl returns the url. Second `writeOriginUrl` with a different url → readOriginUrl returns the new url.

## 2. Server: API routes

- [ ] 2.1 `GET /api/git/remote` — returns `{ url: string | null }`; no side effects
- [ ] 2.2 `POST /api/git/remote` — body `{ url: string }`, CSRF-guarded (existing `requireCsrfBase` middleware), 400 on invalid URL shape, 200 on success with `{ url }`
- [ ] 2.3 URL validation: match `/^(https?:\/\/|git@[^:]+:|ssh:\/\/).+/` — permissive but rejects obvious junk
- [ ] 2.4 Errors from `writeOriginUrl` surface as 500 with `{ error: string }`

## 3. Web: store slice

- [ ] 3.1 Add `remoteOriginUrl: string | null` to the store; init `null`
- [ ] 3.2 `loadRemoteOrigin()` action — `GET /api/git/remote`, sets `remoteOriginUrl`
- [ ] 3.3 `saveRemoteOrigin(url)` action — `POST /api/git/remote`, updates local state on success, pushToast on error
- [ ] 3.4 `App.tsx` boot effect: call `loadRemoteOrigin()` after auth check (same lifecycle as `load()` / `connectWs()`)

## 4. Web: GitIdentityModal remote section

- [ ] 4.1 Add a "Remote origin" section below the name/email fields, above the actions row
- [ ] 4.2 Show current `remoteOriginUrl` (or `<span class="muted">none</span>`) plus an input pre-filled with the current URL
- [ ] 4.3 Save button calls `saveRemoteOrigin(input.trim())`; disabled when input is empty OR unchanged from current
- [ ] 4.4 On success: pushToast "Remote origin saved"; on error: pushToast the error message

## 5. Web: GitIdentityChip hint

- [ ] 5.1 When `remoteOriginUrl === null` AND the repo is initialized (`gitStatus.isRepo`), render the chip's existing "missing" indicator style with title `"No git remote origin — click to set"`
- [ ] 5.2 If BOTH identity AND origin are missing, the chip's hint prioritizes identity (existing behavior), but the modal shows both
- [ ] 5.3 If origin is set and identity is set, chip renders in the normal state (no hint dot)

## 6. Spec delta

- [ ] 6.1 `openspec/changes/add-git-remote-panel/specs/dashboard/spec.md`: ADDED requirement covering the remote-origin surface, its GET/POST API, and the chip hint semantics

## 7. Verification

- [ ] 7.1 Fresh `git init` project → GitIdentityChip shows a hint dot → open modal → Remote origin shows "none" → enter `https://github.com/foo/bar.git` → Save → `git remote -v` in a shell shows `origin  https://github.com/foo/bar.git (fetch/push)`
- [ ] 7.2 Repo with existing origin → modal shows current URL → change to a new URL → Save → `git remote -v` reflects the new URL
- [ ] 7.3 Enter obvious junk (e.g. `not-a-url`) → validation error toast; server didn't accept it (`git remote -v` unchanged)
- [ ] 7.4 CSRF: manually issue `POST /api/git/remote` without the CSRF header → 403
- [ ] 7.5 Non-repo project (`gitStatus.isRepo === false`) → no chip hint for origin (initialization flow already covers it via the existing init prompt)
