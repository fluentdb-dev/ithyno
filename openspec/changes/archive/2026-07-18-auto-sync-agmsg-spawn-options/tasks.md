# Tasks — auto-sync-agmsg-spawn-options

## 1. Server: new module `spawn-options-writer.ts`

- [x] 1.1 `server/agents/spawn-options-writer.ts` を新規作成
  - `syncSpawnOptions(projectRoot: string, cfg: AgentConfig):
    Promise<void>` を export
  - 内部 helpers: `parseArgsToFlags(args: string[])`,
    `mapCommandToAgmsgType(command: string)`,
    `readSpawnOptionsYaml(path: string)`,
    `writeSpawnOptionsYaml(path: string, sections: Record<string,
    Record<string, string | true>>)`, `atomicWrite`
- [x] 1.2 `cfg.agmsg === null` → 即 return (no-op)
- [x] 1.3 `roles: [manager]` は除外、`mode: live-shell` のみ対象
- [x] 1.4 `--model` とその value は sync 対象外 (skip)
- [x] 1.5 boolean vs pair の判定: next token が undefined or `--`
  開始 → boolean、それ以外 → pair
- [x] 1.6 出力 path は `$HOME/.agmsg/config/spawn_options.yaml`
  (未存在なら mkdir -p)
- [x] 1.7 atomic write (tmp file + rename)
- [x] 1.8 既存の他 type セクションは merge preserve、ithyno-declared
  types のみ authoritatively rewrite

## 2. Server: config-writer.ts で Save 時に invoke

- [x] 2.1 `server/agents/config-writer.ts` の
  `applyAgentConfigPayload` の最後 (agents.yaml write 完了後) に
  `await syncSpawnOptions(projectRoot, freshCfg)` を追加
- [x] 2.2 freshCfg は既存の validator 経由で loading (writer 内で
  既に持っている想定; ない場合は registry から取得)

## 3. Server: index.ts で boot 時に invoke

- [x] 3.1 `server/index.ts` の boot sequence、`registry.load()` の
  直後に `await syncSpawnOptions(projectRoot, registry.publicConfig())`
  を追加

## 4. Server tests (`spawn-options-writer.test.ts`)

- [x] 4.1 no agmsg block → no file created / no read
- [x] 4.2 live-shell + `--dangerously-skip-permissions` → `claude-
  code:` セクションに boolean で emit
- [x] 4.3 live-shell + `--verbose 2` (pair) → `claude-code:`
  セクションに pair で emit
- [x] 4.4 `--model sonnet` は skip (spawn_options.yaml に出ない)
- [x] 4.5 manager entry は spawn_options.yaml に出ない
- [x] 4.6 unknown command (`my-wrapper` 等) は silently skip
- [x] 4.7 既存の `grok-build:` セクションは preserve (ithyno-
  declared でない type は触らない)
- [x] 4.8 既存の `claude-code:` セクション内の stale entry は
  削除 (authoritative rewrite)
- [x] 4.9 missing `~/.agmsg/config/` → mkdir -p して write
- [x] 4.10 atomic write の smoke: `.tmp` sibling が残らない

## 5. Verify

- [x] 5.1 `openspec validate auto-sync-agmsg-spawn-options
  --strict` VALID
- [x] 5.2 `npm test && npm run typecheck && npm run build` clean
- [x] 5.3 手動: agents.yaml に既存の
  `--dangerously-skip-permissions` を持つ live-shell claude worker
  があれば、server 再起動後 (or UI Save 後) に
  `~/.agmsg/config/spawn_options.yaml` に `claude-code:
  --dangerously-skip-permissions: true` が現れることを確認

## 6. Post-impl

- [x] 6.1 outcome.md
- [ ] 6.2 `/ithy-opsx:archive auto-sync-agmsg-spawn-options`
