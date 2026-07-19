# Tasks — wrap-embedded-pty-in-tmux

## 1. tmux availability probe

- [x] 1.1 `server/sync/pty.ts` (or new tiny module): `hasTmux()` that
  runs `which tmux` once at first call, caches boolean, returns
  cached value on subsequent calls (avoid spawning `which` on every
  PTY attach)
- [x] 1.2 Test: mock `which tmux` success/fail via a test-only
  override hook or dependency injection so `pty.test.ts` can exercise
  both branches

## 2. Extend `ptyStartup()` return shape

- [x] 2.1 `server/sync/pty.ts`: extend `ptyStartup(registry)` so the
  returned `startup` string is the tmux-wrapped form when
  `registry.agmsg()` is non-null AND `hasTmux()` is true
- [x] 2.2 Session name resolution: `process.env.ITHYNO_TMUX_SESSION`
  if set and non-empty, else fixed `ithyno`
- [x] 2.3 Compose `tmux new-session -A -s <name> -- <managerCmd>
  <shell-quoted managerArgs...>`; reuse the existing `shellQuote()`
  helper for consistency
- [x] 2.4 `initialInput` passthrough — unchanged; the caller's write
  path in `attachPtyToSocket` needs no edits

## 3. Missing-tmux fallback banner

- [x] 3.1 When `registry.agmsg()` is non-null AND `hasTmux()` is
  false: `ptyStartup()` returns a startup line that runs the platform
  shell with a `-c`-style echo of the fallback message, then drops
  into interactive mode. Concrete shape:
  ```
  sh -c 'cat <<EOF
  ⚠️  agmsg is configured in agents.yaml but `tmux` was not found on PATH.
  Install tmux (brew install tmux on macOS, apt/pacman/dnf on Linux) and
  reopen the Terminal panel — or remove the agmsg: block to fall back to
  the direct-spawn path.
  EOF
  exec $SHELL -i'
  ```
- [x] 3.2 `initialInput` MUST NOT be written in the fallback path
  (the manager isn't running, so the auto-injected first message
  would go into the raw shell). Return `initialInput: undefined` in
  this branch

## 4. Server tests (`server/sync/pty.test.ts`)

- [x] 4.1 New describe block `ptyStartup — tmux wrap
  (wrap-embedded-pty-in-tmux)`
- [x] 4.2 `agmsg absent → direct spawn unchanged` — existing behavior
  still passes (regression lock)
- [x] 4.3 `agmsg present + tmux available → wraps in tmux new-session
  -A -s ithyno --` (mock `hasTmux()` true)
- [x] 4.4 `agmsg present + tmux missing → returns fallback shell with
  banner; initialInput is undefined`
- [x] 4.5 `ITHYNO_TMUX_SESSION` env override → resolved startup uses
  the overridden name
- [x] 4.6 Manager args with spaces are shell-quoted so tmux sees a
  single argv token per arg (regression against `--` swallow bugs)

## 5. Verify

- [x] 5.1 `openspec validate wrap-embedded-pty-in-tmux --strict` VALID
- [x] 5.2 `npm test && npm run typecheck && npm run build` clean
- [x] 5.3 shell smoke test: `tmux new-session -A -s <name> -- bash -c
  'sleep 5'` の syntax が動作することを確認 (`tmux ls` で session が
  visible)。ブラウザ経由の実 PTY 経路検証は Manager が実際に agmsg
  ワークフローを走らせるタイミング (P2b landing 後) にまとめて行う
- [ ] 5.4 手動 UI verify (tmux 未 install シミュレーション):
  fallback banner の実表示は unit test で string 出力を lock 済み。
  ブラウザでの表示確認は P2b 以降にまとめて実施

## 6. Post-impl

- [x] 6.1 outcome.md
- [ ] 6.2 `/ithy-opsx:archive wrap-embedded-pty-in-tmux`
