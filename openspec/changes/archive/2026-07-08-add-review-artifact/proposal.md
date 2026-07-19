---
tags: [phase-3, agents, review, artifact, area/server, area/web]
phase: 3
milestone: Manager 用の底面
sequence: 5
depends_on:
  - add-runtime-abstraction
  - add-dispatch-endpoint
  - extend-agent-job-model
enables:
  - add-manager-prompt-and-skills
  - add-agents-tab-live-panel
---

## Why

Phase 3.2 `add-dispatch-endpoint` は artifact 経路を用意し、Phase 3.4
`extend-agent-job-model` は `Job.artifactPaths` を populate するように
なった。だが Manager (Phase 4) が review dispatch の結果を判断するには
`review.md` の **構造化された verdict** が必要:

- `verdict: pass | needs-rework` — 分岐条件そのもの
- `findings: [{file, line, severity, message}]` — retry 時の
  prompt_suffix 材料
- `summary?: string` — Agents タブでの一言表示用

現状 dispatch は `artifactPaths` を list するだけで、内容の parse は
Manager 側に投げている。しかし Manager が prompt engineering で file を
Read → frontmatter parse → 判断 は fragile。

**Ithyno が review.md の schema と parser を持ち、Job / DispatchResult に
`verdict` field を populate する**。Manager は response の `verdict` を
そのまま消費する形。

## What Changes

### 1. `review.md` schema

```markdown
---
verdict: pass | needs-rework
findings:
  - file: server/foo.ts
    line: 42
    severity: high | medium | low
    message: "Off-by-one in the loop bound"
  - file: web/src/bar.tsx
    line: 15
    severity: medium
    message: "Missing null check on props.value"
summary: "Rework needed on the migration loop"
---

## Notes
(any freeform narrative from the reviewer — optional)
```

**Frontmatter が authoritative**。Body は human-readable な補足で、parser は
ignore する。

Fields:
- `verdict`: **required**、`"pass" | "needs-rework"` のいずれか
- `findings`: **optional**、default = `[]`。各 finding は
  - `severity`: **required**、`"high" | "medium" | "low"`
  - `message`: **required**、非空文字列
  - `file`: optional、文字列
  - `line`: optional、正整数
- `summary`: optional、`verdict + findings.length` から生成される Agents
  タブ用の 1 行

### 2. Parser — `server/agents/review-parser.ts` (新規)

```typescript
export type ReviewVerdict = "pass" | "needs-rework";
export type ReviewSeverity = "high" | "medium" | "low";
export type ReviewFinding = {
  file?: string;
  line?: number;
  severity: ReviewSeverity;
  message: string;
};
export type ReviewArtifact = {
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
  summary?: string;
  body?: string;      // frontmatter を除いた raw markdown (UI 用)
};

export function parseReviewContent(raw: string): ReviewArtifact | null;
export async function parseReview(projectRoot, changeId): Promise<ReviewArtifact | null>;
```

- Content parse は `gray-matter` を使用 (既存 dependency)
- 不正な verdict、必須 field 欠損は `null` を return (parse 成功したが
  schema 違反、caller は verdict 無しとして扱う)
- 存在しない file / 読み取り失敗も `null`

### 3. Runner — finish 時に review.md を parse

`server/agents/runner.ts::finish()` で `listChangeArtifacts` の結果に
`review.md` が含まれていれば `parseReview()` を呼び、`job.verdict` に
セット。

```typescript
job.artifactPaths = await listChangeArtifacts(worktreePath, changeId);
if (job.artifactPaths?.some((p) => p.endsWith("/review.md"))) {
  job.verdict = (await parseReview(projectRoot, changeId)) ?? undefined;
}
job.status = status;
```

**Order**: artifactPaths と verdict を populate してから status を flip
(既存の atomicity 契約を維持)。

### 4. Job / JobSummary に `verdict?: ReviewArtifact`

`server/agents/runner.ts` の JobSummary に:

```typescript
verdict?: ReviewArtifact;
```

`web/src/types.ts` の JobSummary mirror にも sync。ReviewArtifact 型は
`server/agents/review-parser.ts` から export、web 側は
`web/src/reviewTypes.ts` (新規) にコピー (client mirror pattern)。

### 5. DispatchResult に `verdict?: ReviewArtifact`

`server/agents/dispatch.ts::DispatchResult` に:

```typescript
verdict?: ReviewArtifact;
```

`dispatch()` の完了 branch で `outcome.verdict` を DispatchResult に反映。
Timeout branch も同様に `runner.getJob(id)?.verdict` を read。

### 6. `/opsx:dispatch` slash command の指示更新

`.claude/commands/opsx/dispatch.md` の "Response の使い方" 節を更新:

- `verdict` field が present なら直接 `verdict.verdict` (pass/needs-rework)
  と `verdict.findings` を報告
- `verdict` が unset なら (review-role でなかった or parse 失敗)
  artifactPaths を list するだけ

## Out of scope

- **needs-human.md の parse 結果を Job に載せる** — Phase 3.5 は review
  に絞る。needs-human は Phase 2 で既に `needsHumanQuestion` を Change に
  載せている
- **verdict の history** — 同一 change に対して review が複数回走った時
  の履歴保持は Job 単位で個別に持つのみ (Job history 一覧が持てば足りる)
- **findings の重複除去** — findings は reviewer が書いた通りに保存、
  dedup は Manager or UI 側で判断
- **`verdict: pass` かつ `findings.length > 0`** の意味論 — spec 上は
  「pass だが observations あり」として許容、Manager の解釈は
  「pass = advance phase」で findings は無視 or note として扱う
- **cancel path の verdict populate** — Phase 3.4 の既知制約
  (cancel が finish を通らない) に伴い、cancelled review job も
  verdict なし。Phase 4 で cancel cleanup を統一する時に一緒に対応
- **UI** — Phase 5.1 で Agents タブが verdict badge を描くのは別 change

## Impact

- 新規 `server/agents/review-parser.ts` (~120 LOC)
- 新規 `server/agents/review-parser.test.ts` (~15 tests)
- `server/agents/runner.ts` — finish() 内 review parse (~10 LOC)
- `server/agents/runner.ts` — JobSummary に `verdict?` (~3 LOC)
- `server/agents/dispatch.ts` — DispatchResult に `verdict?` (~5 LOC)、
  完了 branch で反映
- 新規 `web/src/reviewTypes.ts` (~30 LOC) — client mirror
- `web/src/types.ts` — JobSummary に `verdict?` (~3 LOC)
- `.claude/commands/opsx/dispatch.md` — response 使い方の 1 節更新
- Backward compat: 100% (追加のみ)
