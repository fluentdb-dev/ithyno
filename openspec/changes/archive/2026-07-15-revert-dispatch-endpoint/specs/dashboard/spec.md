# Delta: dashboard — revert dispatch endpoint

## REMOVED Requirements

### Requirement: Role-Based Agent Dispatch API

**Reason for removal**: `docs/ideas/2026-07-15-runtime-collapse-to-mode-dispatch.md`
の方針に沿って、role → agent 選択を server-side endpoint から skill 側
(`/opsx:manage`, `/opsx:code`, `/opsx:review`, `/opsx:verify`) に戻す。
Claude が Task tool + bash で直接 dispatch 判断する形が single-user
+ Claude 経由の実利用パターンに合致する。

**Migration**: Manager loop や UI は今後 `POST /api/agents/dispatch` を叩かない。
Kanban Start ボタンは既に `useStartFlow.tsx` の code-role filter で不要な agent
picker を出さない挙動になっており (`51eee4c`)、code agent 決定は
`web/src/util/selectStartAgent.ts` の純粋関数側で完結する。

### Requirement: Agent Selection By Role And Specialties

**Reason for removal**: role / specialty / runtime による weighted selection は
server 側の複雑さの源だった。Skill 経由の dispatch では Claude が
`agents.yaml` の declaration を読んで「code role の agent はこれ」と判断する
だけで足りる。`specialties` field 自体も後続 revert (`revert-agents-yaml-schema-fields`)
で撤去予定。

**Migration**: 現状 `agents.yaml` の `roles: [code]` 等の宣言だけが残り、
weighted matching は skill 側の単純な「roles.includes(role)」に置き換わる。

### Requirement: Synchronous Dispatch With Timeout

**Reason for removal**: 同 endpoint 撤廃に伴い、timeout / cancellation semantics も
skill 側 (Task tool 呼び出しの timeout / user interrupt) に委譲する。

**Migration**: Manager skill が Task tool 経由で subagent を回す際は
Claude Code の standard timeout / interrupt が使われる。server 側 timeout
プロトコルは不要。
