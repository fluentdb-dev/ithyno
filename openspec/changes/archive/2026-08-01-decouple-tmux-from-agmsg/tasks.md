# Tasks

## 1. Registry schema + accessor

- [x] 1.1 `server/agents/registry.ts` — add `tmux: boolean` to both arms of the `AgentConfig` union (default `false`).
- [x] 1.2 Add `validateTmux(raw: unknown): boolean` — `undefined`/`null` → `false`; boolean → passthrough; anything else → throw (mirrors `validateParallelExecution`'s style).
- [x] 1.3 Wire `validateTmux` into `load()` (parsed from `parsed.tmux`) and into both `cache` initializers (constructor default + no-file-found branch) and the `catch` branch's last-known-good passthrough.
- [x] 1.4 Add `AgentRegistry.tmux(): boolean` accessor next to `agmsg()`, returning `this.cache.tmux`.
- [x] 1.5 Add `tmux: boolean` to `publicConfig()`'s return type and both return branches.

## 2. PTY startup

- [x] 2.1 `server/sync/pty.ts` — in `ptyStartup()`, compute `const tmuxEnabled = (registry?.tmux() ?? false) || agmsg !== null;` and replace the `if (agmsg === null)` early-return guard with `if (!tmuxEnabled)`.
- [x] 2.2 Update the doc comment above `ptyStartup()` describing the agmsg→tmux coupling to describe the OR condition instead.
- [x] 2.3 Update `tmuxMissingFallback()`'s banner text to mention both `agmsg:` and `tmux: true` as things to remove to fall back to direct spawn.

## 3. Tests

- [x] 3.1 `server/agents/registry.test.ts` — `tmux()` defaults to `false` when absent; parses `tmux: true`; throws (surfaces as `ok: false`) on a non-boolean value; `publicConfig()` includes it.
- [x] 3.2 `server/sync/pty.test.ts` — `tmux: true` with no `agmsg` wraps in tmux; `tmux: false` (or absent) with `agmsg` configured still wraps (agmsg's implication is unconditional); neither set → direct spawn; both signals absent + tmux missing from PATH is unaffected (no wrap attempted, no fallback banner) since tmux isn't enabled.

## 4. Docs

- [x] 4.1 Checked `agents.yaml` (repo-root dogfood config) and templates — no inline comment documents the `agmsg:` block today, so there's nothing to extend. Left the file's config values untouched (it doesn't opt into `tmux: true`).

## 5. Verification

- [x] 5.1 `npx openspec validate decouple-tmux-from-agmsg --strict` passes.
- [x] 5.2 `npm test` passes (696 passed, 1 pre-existing skip).
- [x] 5.3 `npm run typecheck` passes.
- [x] 5.4 `npm run build` passes.
- [x] 5.5 Write `openspec/changes/decouple-tmux-from-agmsg/outcome.md`.
