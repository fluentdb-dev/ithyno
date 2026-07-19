# Tasks — add-agmsg-config-write

## 1. PENDING annotation

- [x] 1.1 `openspec/specs/dashboard/spec.md` の
  `### Requirement: Settings Tab` の SHALL 段落直後に
  `> ⚠️ **PENDING MODIFIED** by [add-agmsg-config-write]
  (../../changes/add-agmsg-config-write/): Settings form に
  agmsg section を追加する予定` を挿入

## 2. Server: `writeAgmsg` in config-writer.ts

- [x] 2.1 `server/agents/config-writer.ts` に `writeAgmsg(
  projectRoot: string, block: AgmsgConfig | null): Promise<ApplyResult>`
  を追加。`writeParallelExecution` の pattern を踏襲
- [x] 2.2 `block === null` → 既存の `agmsg:` key を削除、
  他 top-level keys は preserve
- [x] 2.3 `block !== null` → `team` 必須 (非空文字列)、
  `storage` optional (非空文字列 or undefined)。invalid の場合
  `{ ok: false, status: 400, error: "agmsg.team is required..." }`
- [x] 2.4 atomic write (既存 `atomicWrite` helper 使用)
- [x] 2.5 write 後、既存の `applyAgentConfigPayload` と同じく
  spawn_options.yaml の auto-sync が発火することを確認 (chokidar
  watcher 経由でも良い、明示 invoke でも良い)

## 3. Server: `POST /api/config/agmsg` endpoint

- [x] 3.1 `server/index.ts` に endpoint 追加、`writeParallelExecution`
  の pattern を踏襲
- [x] 3.2 非 local origin → 403 (既存 guard 利用)
- [x] 3.3 payload 検証: `enabled: true` + team missing/empty → 400
- [x] 3.4 success → registry reload → `agents-updated` broadcast
  (既存の POST /api/agents/config と同じ shape)

## 4. Server tests (`config-writer.test.ts` + `server.test.ts` 相当)

- [x] 4.1 `writeAgmsg({team:"alpha"})` → agents.yaml に
  `agmsg:\n  team: alpha` が書かれ、他 top-level keys 保持
- [x] 4.2 `writeAgmsg({team:"alpha",storage:"..."})` → storage も出力
- [x] 4.3 `writeAgmsg(null)` on existing block → block 削除、
  他は保持
- [x] 4.4 `writeAgmsg(null)` on absent block → no-op (success)
- [x] 4.5 `writeAgmsg({team:""})` → 400 error
- [x] 4.6 (integration) POST /api/config/agmsg lifecycle:
  enable → disable → 400 case

## 5. Client: API + Settings form

- [x] 5.1 `web/src/api.ts` に `setAgmsgConfig(payload:
  {enabled:true,team:string,storage?:string} | {enabled:false}):
  Promise<void>` 追加
- [x] 5.2 `web/src/pages/Settings.tsx` に Agmsg section を追加:
  - Enable checkbox
  - Team text input (Enable ON 時のみ enabled、required 表示)
  - Storage text input (Enable ON 時のみ enabled、optional 表示)
  - Save button — draft と store の値が異なる時のみ enabled
- [x] 5.3 draft state: form local state で保持、Save で
  `setAgmsgConfig` post、WS broadcast 到着で store が更新され
  form が再読取り (source of truth)
- [x] 5.4 error toast via existing `pushToast`
- [x] 5.5 Enable checkbox off 時、team/storage inputs は空表示 &
  disabled

## 6. Verify

- [x] 6.1 `openspec validate add-agmsg-config-write --strict` VALID
- [x] 6.2 `npm test && npm run typecheck && npm run build` clean
- [x] 6.3 API lifecycle verify (curl 経由): initial → disable →
  enable+team → 400 on missing team → enable+team+storage → restore。
  full 5-scenario roundtrip against a fresh dev server (port 4324)
- [ ] 6.4 手動 browser UI verify: `/settings` を browser で開いて
  form の Enable/team/storage/Save の各挙動を確認。**deferred**:
  API 側で lifecycle 通過済み、UI は既存 Settings.tsx の pattern
  踏襲なので regression リスク低

## 7. Post-impl

- [x] 7.1 outcome.md
- [ ] 7.2 `/ithy-opsx:archive add-agmsg-config-write`
