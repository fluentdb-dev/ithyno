## REMOVED Requirements

### Requirement: Manual Phase Transitions In The UI

**Reason for removal**: Phase 2 は「User が Kanban 上でカードをドラッグ / Phase menu で phase を進める」を前提にしていたが、設計対話の結果、phase 遷移は Phase 3 で入る Manager agent (User が `/opsx:apply` で起動する claude session 自身) が自動で書き戻す設計に転換した。User の interaction は openspec 4-step (propose / apply / archive / merge) だけに限られ、Kanban 上の manual transition affordance は不要になった。

Backend の `POST /api/changes/:id/phase` route は保持する — 同じ API を Manager が叩く。

### Requirement: Needs-Human Kanban Lane

**Reason for removal**: needs-human は独立した swim lane を持たなくても、needs-human phase の change を **priorPhase の lane に留めたまま card badge (`<WaitBadge>` + question 表示) で示す** ことで意図は伝わる。専用 lane を持つと escalation UI が dashboard 側の関心事のように見え、次項 (Escalation User Experience) の modal を必然化させてしまう構図があった。両者まとめて削除する。

Backend の needs-human artifact / API / editor fallback は保持する — Manager が phase を書き戻すのに使う。

### Requirement: Escalation User Experience

**Reason for removal**: Escalation の Q&A UI は agent 側 (Claude Code) の役割で、dashboard の modal で受けると agent conversation との二重管理になる。Phase 3 の Manager は phase 遷移で needs-human を検知したら、PTY session を能動的に spawn して initialInput 経由で質問を注入し、通知チェーン (toast / titlebar / OS notification / bell) で User に報告する。User は通常の claude terminal 会話として応答し、agent が `/opsx:answer` で close する。この設計に modal は登場しない。

Backend の escalate / answer API と editor fallback は保持する — 前者は Manager PTY spawn 経路の内側で、後者は「User が editor で needs-human.md を hand-edit する」経路で引き続き使う。
