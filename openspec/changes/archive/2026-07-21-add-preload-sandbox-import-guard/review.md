---
verdict: pass
reviewer: manager-hand-review
reason: copilot policy error persisting; Manager fallback per updated dispatch skill
---

# Review: add-preload-sandbox-import-guard

## Findings
- no blocking issues found

## Verdict rationale

Implementation matches proposal + spec:

- `scripts/check-preload-imports.mjs` — clear structure. Explicit `ELECTRON_SAFE_NAMES = {contextBridge, ipcRenderer}` allowlist at the top per the spec requirement "Preload-safe allowlist is explicit". Comment header documents the sandbox constraint + points to the promoted idea. Recursive walk with cycle protection (`visited` set), relative-import resolution covers `.ts`/`.tsx`/`/index.ts`/`/index.tsx`. Bare-module + node:* + other electron subpaths all rejected.
- Error message names the file, specifier, and reach path — matches the spec's "Transitive main-process import via local module" scenario requirement.
- Success line `[preload-guard] preload.ts import graph OK (N files walked)` matches the spec.
- Wired into `electron/package.json`: `build` and `dev` scripts prepend the check → `sync-about-config` → `tsc`. Order matches the spec's "Guard runs before tsc in dev + build" scenario.
- Test coverage: 11 vitest tests including Fixtures A (safe), B (transitive via local), C (direct main-process), plus type-only, bare-module, cycle, comment-strip — spec's regression scenarios covered.
- `vitest.config.ts` include glob extended to `scripts/**/*.test.mjs` — new tests discovered.
- `electron/README.md` gained the "Preload sandbox" section per Task 3.2.
- Manual regression (tasks 5.5, 5.6) actually run and produce the expected exit 1 with clear messages. This is the killer feature — the exact bug that shipped in `add-terminal-reconnect` R1 (`import { IPC_TERMINAL_RESTART } from './menu'`) would now be caught at `npm run build`.

Change is ready to archive.
