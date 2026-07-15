---
tags: [feature/revert, area/web, area/server, runtime-collapse, phase-5-rollback]
---

# Revert Manager UI special-casing (partial)

## Why

R9 of the runtime-collapse pivot — final. In-flight changes
`add-agents-tab-manager-section` と `refine-manager-fallback-copy`
は Agents tab に Manager 専用 UI section を追加した。
`docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md` の方針:

> Manager section を「declaration の見え方」だけに戻す。役割は agmsg
> team room role に還元

そのため Manager section の visual special-casing (dedicated section +
/api/manager-status endpoint) を撤去。Manager agent (pptr) は通常の
agent list に混ざる形に戻る。

**残す**: `add-manager-agent-config` の Terminal PTY startup routing (agents.yaml
の `role: manager` を PTY panel が spawn する仕組み)。これは Terminal
panel の実運用に必要。Modal の manager singleton guardrail も残す
(誤って複数 Manager 定義するのを防ぐ)。

## Targets

Both Case β (in-flight, not yet archived).

1. **`add-agents-tab-manager-section`** (in-flight, Case β): Agents tab
   の Manager section 全体 REVERT
2. **`refine-manager-fallback-copy`** (in-flight, Case β): Manager section
   の copy 修正 → section 自体消えるので irrelevant

## What Changes

### Spec (ADDED — 1 requirement, post-revert baseline)

- `Manager Agent Listed With Other Agents` — Manager (`role: manager`) agent
  は他の worker agent と同じく Agents tab の Configured 一覧に表示される
  だけ、dedicated section は無い。

### Impl

- `web/src/pages/Agents.tsx` — ManagerSection component + ManagerRow +
  ManagerDefaultsCard 全部 削除
- `web/src/api.ts` — `fetchManagerStatus()` 削除
- `web/src/store.ts` — `managerStatus` state / `loadManagerStatus()` 削除
- `web/src/types.ts` — `ManagerStatus` type 削除
- `server/index.ts` — `GET /api/manager-status` endpoint + 依存する
  helper 撤去
- `web/src/styles.css` — `.manager-section` / `.manager-*` CSS 削除

## Case β revert validity

target 2 change は in-flight (openspec/changes/ 下)。ADDED delta で
「Manager は section なし」の post-revert baseline を記録。target
change directory は `reverted-target archive` 手順で `openspec/changes/archive/`
に移動 (impl はすでに shipping 済みなのでコード側は R9 impl で削除)。

## Blast radius

- **UI**: Agents tab から Manager section 完全消失 (代わりに pptr が
  Configured 一覧に普通の agent として出る)
- **Server**: 1 endpoint 撤去 + helper 削除
- **CSS**: `.manager-*` クラス撤去

## Out of scope

- `add-manager-agent-config` の Terminal PTY 手続き — 残す (実運用中)
- Modal manager singleton guardrail — 残す (誤設定防止)
