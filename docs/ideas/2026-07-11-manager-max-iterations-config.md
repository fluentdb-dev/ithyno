---
status: idea
tags: [feature/manager, feature/config, area/skills, phase-5]
source: conversation
related:
  - openspec/changes/archive/2026-07-11-add-manager-loop-skill
  - docs/2026-07-11-manager-usage-and-agents-migration.md
promoted_to: null
---

# Manager MAX_ITERATIONS config field

Phase 4.2 で Manager loop の convergence guard を `MAX_ITERATIONS = 5`
の hard-coded 定数として実装した。将来的にはこれを **`agents.yaml`**
で override 可能にしたい。

## Motivation

- 大きい change や複数 file を跨ぐ refactor では 5 iterations では
  足りない場合がある (現実の review needs-rework は 1-3 回で収束する
  例が多いが、複雑な spec で 8-10 iterations が必要になるケースがあり得る)
- 逆に、小さい fix change (typo, comment) は 2 iterations で escalate
  したい (無限 loop の cost 節約)
- Manager cost が可視化される Phase 5+ で「cap を budget と連動させる」
  要件が出るかもしれない

## Design sketch

`agents.yaml` の top-level に `manager` section を新設:

```yaml
manager:
  maxIterations: 5             # default 5、user は override 可能

agents:
  ...
```

または agent 単位で:

```yaml
agents:
  - name: manager-claude
    role: manager
    runtime: claude
    prompt: /opsx:manage ${change_id}
    maxIterations: 10          # このマネージャは 10 まで
```

**Manager slash command 側**: prompt の
`MAX_ITERATIONS = 5` を「agents.yaml から取得可能なら使い、なければ 5」
に書き換える。

Ithyno server が `manager.maxIterations` を `POST /api/agents/dispatch`
の response に含める or Manager prompt が起動時に GET する経路 を
実装。

## Change id (promotion 時)

`add-manager-max-iterations-config` (or similar) として `openspec new
change` で起票。前提: Phase 4.2 landed、user が「iteration cap を
change ごとに変えたい」要件を持ち込んだ時。

## Frontmatter update (promotion 時)

```
status: promoted
promoted_to: openspec/changes/add-manager-max-iterations-config/
```

## 参考

- Phase 4.2 の Manager Loop Slash Command 要件 (openspec/specs/dashboard/spec.md)
- Fable review "Missing #manager-loop-convergence-guard" (docs/2026-07-07-phase-3-through-6-decomposition.md)
