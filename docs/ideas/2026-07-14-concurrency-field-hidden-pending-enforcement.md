---
status: idea
tags: [feature/agents-yaml, decision-log]
source: conversation
promoted_to: null
---

# `concurrency` フィールドを Modal から隠した (schema は残す)

**状態 (2026-07-14)**: `AgentDef.concurrency` は Phase 1 で schema に
入ったが、runner/dispatch/pool のどこでも enforce していない。実際の並列
制御は `runner.locks` の change 単位 (1 change = 1 active job)。

Modal に input を出していると「設定すれば効く」と誤解されるので、
`AgentConfigModal.tsx` の Advanced から Concurrency input を撤去した。
schema/loader/config-writer には残しているので、既存 `agents.yaml` の
`concurrency: N` はそのまま round-trip する。

**復活タイミング**: 実際に concurrency を enforce する change を propose
する時。同時に検討すべき論点:

- `runner.run()` の change-lock を残すか / 緩めるか
- `worktreePool` slot との相互作用
- `${session_id}` の scope 変更 (change 単位 → dispatch 単位)
