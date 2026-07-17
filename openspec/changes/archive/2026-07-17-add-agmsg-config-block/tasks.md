# Tasks — add-agmsg-config-block

## 1. Server: registry parse + validate

- [x] 1.1 `server/agents/registry.ts`: `AgmsgConfig` type export、
  top-level `agmsg?: { team: string; storage?: string }` parse
- [x] 1.2 `validateAgmsg`: block 存在時に `team` が非空 string で
  なければ throw (loader が `ok: false` + error を組み立てる)
- [x] 1.3 `storage` は optional、type check のみ (string or undefined)
- [x] 1.4 `AgentConfig` type / `publicConfig()` の shape に
  `agmsg: AgmsgConfig | null` を含める。registry.agmsg() accessor
  も追加

## 2. Server: model + wire

決定: `parallelExecution` と同じく `agmsg` も `WorkspaceState` には
乗せず `AgentConfig` (registry) 経由でクライアントに届ける。
`WorkspaceState` は openspec/ 由来の read-only state、agents.yaml
由来は AgentConfig 側に留める。

- [x] 2.1 `server/model.ts`: `AgmsgConfig` type export (同じ shape、
  consumer 用に再露出)
- [x] 2.2 `server/index.ts`: `agents-updated` WS event 型 と broadcast
  payload に `agmsg: AgmsgConfig | null` を追加
- [x] 2.3 `GET /api/agents/config` response — `publicConfig()` に
  `agmsg` 含まれるため endpoint 側は変更不要

## 3. Server: config-writer round-trip

- [x] 3.1 `server/agents/config-writer.ts`: `upsertAgent` は
  `{ ...doc, agents: list }` で spread する構造のため、既存 top-level
  `agmsg` block は自動保持される (追加コード不要)。テストで lock する

## 4. Server tests

- [x] 4.1 `server/agents/registry.test.ts`: block 無し (`agmsg`
  key 無し) → `cfg.agmsg === null`
- [x] 4.2 block あり (`agmsg: { team: "alpha" }`) → team のみ populated、
  storage は undefined
- [x] 4.3 block あり + storage 込み (`agmsg: { team: "alpha", storage:
  ".worktrees/.agmsg.sqlite" }`) → 両 field populated
- [x] 4.4 block あり + team 欠落 (`agmsg: { storage: "..." }`) →
  `ok: false` + error message
- [x] 4.5 block あり + team 空文字 (`agmsg: { team: "" }`) → 同上
- [x] 4.6 `config-writer.test.ts`: 既存の top-level `agmsg` block が
  agents upsert 後も preserve される (round-trip lock)

## 5. Client: type mirror

- [x] 5.1 `web/src/types.ts`: `AgmsgConfig` export + `AgentConfigResponse.agmsg`
  追加 (WorkspaceState.agmsg は追加しない — サーバ側の決定と対称)
- [x] 5.2 `web/src/store.ts`: `agmsg` slice を state に追加、`loadAgents`
  で populate、`agents-updated` WS handler で更新

## 6. Verify

- [x] 6.1 `openspec validate add-agmsg-config-block --strict` VALID
- [x] 6.2 `npm test && npm run typecheck && npm run build` clean
  (220 pass / typecheck 0 err / build 328 modules)
- [x] 6.3 手動 API 確認: registry unit tests が block-absent /
  block-present-team-only / block-present-team+storage の 3 分岐を
  カバー (config-writer round-trip テストで upsert 越しの保存も lock)。
  ライブ curl は P2 で dashboard 側 consumer が付いた時に実施
- [x] 6.4 手動 error banner: validator の反射は registry.test.ts の
  "block missing team" / "block empty team" / "non-string storage" で
  カバー。UI banner は既存の agents-config error path を共用する
  ため個別の browser verify は不要

## 7. Post-impl

- [x] 7.1 outcome.md
- [ ] 7.2 `/ithy-opsx:archive add-agmsg-config-block`
