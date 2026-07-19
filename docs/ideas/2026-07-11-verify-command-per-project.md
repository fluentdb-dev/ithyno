---
status: idea
tags: [feature/verify, feature/config, area/skills, area/agents, phase-5]
source: conversation
related:
  - openspec/changes/archive/2026-07-11-add-worker-skills
  - openspec/changes/archive/2026-07-11-add-manager-loop-skill
promoted_to: null
---

# Per-project verify command in agents.yaml

Phase 4.1 で shipped した `/opsx:verify` slash command は
`npm test && npm run typecheck && npm run build` を hard-coded で
実行する。Fable review MEDIUM #6 で指摘された通り、これは Node
project 決め打ちで、Python / Rust / Go project では機能しない。

将来的に **`agents.yaml`** の verify agent に verify command を
declare させ、`/opsx:verify` template がそれを Read する形にしたい。

## Motivation

- 現状: verify は Node 前提。それ以外の language / build tool は使えない
- Python: `pytest && mypy && black --check`
- Rust: `cargo test && cargo clippy && cargo build`
- Go: `go test ./... && go vet ./... && go build ./...`
- Mixed monorepo: 複数 command の chain

## Design sketch

`agents.yaml` の verify agent に `verifyCommand` field を追加:

```yaml
agents:
  - name: verify-claude
    role: verify
    runtime: claude
    prompt: /opsx:verify ${change_id}
    verifyCommand:                     # 新 field
      - "npm test"
      - "npm run typecheck"
      - "npm run build"
    specialties: [any]
```

**`/opsx:verify` template 側**: prompt 起動時に自分の agent
definition を GET し、`verifyCommand` array を Bash で順に実行する。
現行の hard-coded chain は default fallback として保持。

Ithyno server 経路: `POST /api/agents/dispatch` の response に
selected agent の `verifyCommand` を含めるか、または verify template
が起動時に `GET /api/agents/config` を叩いて自分の agent definition を
取得する。後者の方が dispatch shape を汚さない。

## Sub-directory の扱い

Monorepo で change が特定の workspace にのみ影響する場合、`cd` してから
verify command を実行する必要がある。`verifyCommand` を string の配列
ではなく object の配列にする案:

```yaml
verifyCommand:
  - { cmd: "npm test", cwd: "./web" }
  - { cmd: "npm run typecheck", cwd: "./server" }
```

または glob-matched change に応じて実行する command が変わる形。
複雑化する前に「change の proposal.md frontmatter に affected workspace
を declare する」設計も候補。

## Change id (promotion 時)

`add-verify-command-per-project` として起票。前提:

- Phase 4.2 landed (現在の verify template を書き換えられる状態)
- 非 Node project で ithyno を試したい user が現れる (or Ithyno 本体を
  monorepo 化したくなる)

## Frontmatter update (promotion 時)

```
status: promoted
promoted_to: openspec/changes/add-verify-command-per-project/
```

## 参考

- Fable review MEDIUM #6: "Verify role is Node-centric"
  (docs/2026-07-06-phase-2-implementation-and-redesign.md)
- Phase 4.1 の Verify Worker Slash Command 要件
  (openspec/specs/dashboard/spec.md)
