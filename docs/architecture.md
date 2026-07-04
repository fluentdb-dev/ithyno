# アーキテクチャ設計

ithyno の技術設計。**ローカルブラウザダッシュボード** 形態・**OpenSpec準拠** を前提とする。

---

## 1. ゴールと非ゴール

### ゴール
- OpenSpecの `openspec/` ディレクトリを唯一の真実とし、進捗を**可視化**する。
- `tasks.md` のチェックボックスをUIから**双方向に編集**できる（UI↔ファイル）。
- AIエージェントによる外部編集を**即座にUIへ反映**する。
- Markdownを汚さない（独自HTMLコメントや方言を埋め込まない）。

### 非ゴール（v1では扱わない）
- 複数リポジトリ / リモート同期 / マルチユーザー同時編集の厳密な排他制御。
- OpenSpecそのもののCLI機能（`openspec change` 等）の置き換え。
- 仕様本文（requirement / scenario）のリッチなWYSIWYG編集。v1は**閲覧**のみ、編集はチェックボックスに限定。

---

## 2. 対象とするOpenSpecの構造

```
openspec/
├── specs/
│   └── [domain]/
│       └── spec.md              # 現行仕様（source of truth）
└── changes/
    ├── [change-name]/
    │   ├── proposal.md          # なぜ・何を変えるか (## Intent / ## Scope / ## Approach)
    │   ├── design.md            # 技術アプローチ
    │   ├── tasks.md             # 実装チェックリスト（進捗の本体）
    │   ├── .openspec.yaml       # メタデータ
    │   └── specs/
    │       └── [domain]/
    │           └── spec.md      # デルタ仕様（## ADDED/MODIFIED/REMOVED）
    └── archive/
        └── [YYYY-MM-DD-change-name]/   # 完了済み
```

### パース対象フォーマット

**tasks.md（進捗の中核）**
```markdown
# Tasks

## 1. Theme Infrastructure
- [ ] 1.1 Create ThemeContext with light/dark state
- [x] 1.2 Add CSS custom properties for colors

## 2. UI Components
- [ ] 2.1 Create ThemeToggle component
```
- `## N. <section>` で論理グルーピング。
- `- [ ] N.M <text>` / `- [x] N.M <text>` が個々のタスク。階層番号（1, 1.1, 1.2）。

**spec.md / delta spec**
```markdown
## Purpose
...
### Requirement: User Authentication
The system SHALL ...
#### Scenario: Valid credentials
- GIVEN ...
- WHEN ...
- THEN ...
```
delta は `## ADDED Requirements` / `## MODIFIED Requirements` / `## REMOVED Requirements`。

**proposal.md** — `## Intent` / `## Scope` / `## Approach`。

---

## 3. システム構成

3層構成。すべてローカルで完結する。

| 層 | 役割 | 主な技術 |
|----|------|----------|
| **クライアント** | ダッシュボード描画・操作 | Vite + React + TypeScript |
| **サーバー** | パース・サージカル編集・ファイル監視 | Node.js + Fastify + chokidar |
| **ストア** | 真実のソース | `openspec/` 配下の `.md` ファイル |

クライアントとサーバーは単一プロセス（Fastify が静的アセットも配信）でも、開発時は Vite dev server + プロキシでも動かせる構成にする。

### データフロー

1. **初期ロード** — サーバーが `openspec/` を再帰スキャン → ドメインモデルへパース → REST `GET /api/state` で返却。
2. **UI→ファイル（toggle）** — チェックボックス操作 → `POST /api/tasks/toggle` → サーバーが該当 `tasks.md` の**該当行だけ**を書き換え → 書き込み。
3. **ファイル→UI（外部編集）** — chokidar が変更検知 → 差分パース → WebSocket で全クライアントへ push。

---

## 4. 技術選定と根拠

| 領域 | 採用 | 理由 / 代替案 |
|------|------|---------------|
| フロント | **React + TypeScript + Vite** | 型安全・HMR・エコシステム。代替: Svelte（軽量だが採用者の慣れを優先）。 |
| サーバー | **Node.js + Fastify** | フロントと言語統一、軽量・高速。代替: Express（枯れているが遅い）、Vite plugin単体（監視ロジックが複雑化するため不採用）。 |
| MDパース | **unified / remark + remark-gfm** | GFMのタスクリストをASTで安全に扱える。位置情報（`position`）が取れるため行特定が正確。代替: 自前正規表現（脆い、不採用）。 |
| ファイル監視 | **chokidar** | クロスプラットフォームで安定。`awaitWriteFinish` で書き込み途中の検知を防げる。 |
| リアルタイム通信 | **WebSocket（`ws`）** | 双方向・低レイテンシ。代替: SSE（サーバー→クライアント片方向で十分なら可、但しシンプルさでWS採用）。 |
| 状態管理(client) | **Zustand** | 軽量。WSイベントで丸ごと差し替えやすい。代替: Redux（過剰）。 |
| UI | **Tailwind CSS + 最小限の自前コンポーネント** | 素早い。カンバンのD&Dは `@dnd-kit`。 |
| CLI | **Node bin + `commander`** | `npx openspec-ui` で起動。 |
| 配布 | **npm パッケージ** | `npx openspec-ui` で即実行。 |

---

## 5. ドメインモデル（サーバー内部表現）

パース結果は以下の正規化された読み取り専用モデルにする。**このモデルからMarkdownへ全文シリアライズし直すことはしない**（後述の同期方針のため）。

```ts
type WorkspaceState = {
  root: string;                 // openspec/ の絶対パス
  specs: SpecDomain[];          // 現行仕様
  changes: Change[];            // アクティブな変更
  archive: ChangeSummary[];     // 完了済み（一覧のみ）
};

type Change = {
  id: string;                   // ディレクトリ名 = change-name
  proposal: ProposalDoc | null; // Intent/Scope/Approach
  design: RawDoc | null;
  tasks: TaskList;
  deltaSpecs: SpecDomain[];
  progress: { done: number; total: number };
};

type TaskList = {
  filePath: string;
  sections: TaskSection[];
};

type TaskSection = { title: string; tasks: Task[] };

type Task = {
  id: string;        // "1.2" など
  text: string;
  checked: boolean;
  line: number;      // tasks.md内の0始まり行番号（編集対象の特定に使う）
  filePath: string;
};
```

`line` を保持することが双方向同期の鍵。UIからのtoggleは「ファイルパス + 行番号 + 期待状態」で送られ、サーバーはその行だけを編集する。

---

## 6. 双方向同期の設計（プロジェクトの核心）

idea.md が挙げた最大のトレードオフ「同時編集の競合」と「Markdownの方言化」へ正面から答える部分。

### 6.1 基本原則: フルシリアライズせず「サージカル編集」する

UIからの更新で `tasks.md` を**モデルから再生成して上書きしない**。理由:
- 全文再生成は、AIが書いたコメント・空行・書式の揺れを破壊し、不要なdiffを生む。
- 「Markdownの可読性を保つ」という設計目標に反する。

代わりに、**該当行のチェックボックス1文字だけ**を置換する。

```
編集前: - [ ] 1.2 Add CSS custom properties for colors
編集後: - [x] 1.2 Add CSS custom properties for colors
        ↑ この1箇所のみ変更。他のバイトは1文字も触らない。
```

実装: 対象ファイルを読み込み、`line` 行目の `- [ ]` ⇄ `- [x]` を**厳格な正規表現**で1回だけ置換し、書き戻す。インデント・タスク番号・本文は不変。

**正規表現は「マーカー部分だけ」をキャプチャする厳格な形にする**。行全体を再構築すると、複数行にまたがるタスク（インデントされた継続行）を壊す危険がある。

```markdown
- [ ] 1.2 Add CSS custom properties for colors
      (Note: Use OKLCH color space)        ← 継続行。絶対に触らない
```

採用パターン（チェック状態の1文字のみ置換、本文は後方参照で温存）:
```
/^(\s*[-*]\s*\[)[ xX](\]\s+)/
→ 置換後の状態文字（' ' または 'x'）だけを差し込む
```
- 行頭の空白・リストマーカー（`-`/`*`）・`[` … `]` 後の空白を捕捉し、その間の1文字だけを書き換える。
- 大文字 `X` も既存表記として許容して読み取る（書き込みは小文字 `x` に統一）。
- 継続行・タスク本文・末尾コメントには一切触れない。
- この厳格性は `surgicalEdit.ts` の**単体テスト必須ケース**として担保する（マルチラインタスク／タブインデント／`*` マーカー／大文字 `X` を網羅）。

### 6.2 競合検知（楽観的ロック）

toggleリクエストに、UIが最後に観測したそのファイルの**ハッシュ（または mtime）**に加えて、**対象行の元テキスト（`expectedText`）**を含める。

```
POST /api/tasks/toggle
{ filePath, line, expectedChecked: true, baseHash: "sha1:...", expectedText: "- [ ] 1.2 Add CSS custom properties for colors" }
```

サーバーは書き込み直前にファイルを再読込し、**2段階で判定**する:

1. **ハッシュ一致** → そのままサージカル編集を実行（高速パス）。
2. **ハッシュ不一致**（＝間に外部編集があった） → ただちに弾かず、**行ズレ吸収のフォールバック**を試みる:
   - `line` 行目が `expectedText` と完全一致 → その行をそのまま編集（行番号は同じ、内容も無傷）。
   - 一致しなければ、ファイル全体から `expectedText` に**完全一致する行を1つだけ**探す → 見つかればその行を編集（**行ズレを自動補正**）。
   - 一致行が0個、または2個以上（曖昧）の場合のみ → **書き込まず 409 Conflict** を返し、最新stateを同梱。

この設計の意図: AIがドキュメント上部に行を挿入しただけ（＝対象タスク行の中身は不変）のケースは、ハッシュは変わるが `expectedText` で本人を特定できるため**409を出さずに成功させる**。これにより「チェックするたびに弾かれる」ストレスを排除する。真に409となるのは、**チェック対象のタスク行そのものがAIに書き換えられた**稀なケースに限定される。

これによりロストアップデートを防ぐ。ファイルロック等のOS機構には依存しない（堅牢性とポータビリティ優先）。

### 6.3 エコー抑制（書き込みループ防止）

サーバー自身の書き込みも chokidar が検知してしまうと、不要な再パース＆pushが起きる。対策:
- サーバーが書いた直後の**新ハッシュを記録**しておき、watcherイベントのハッシュがそれと一致したら**無視**する（自己発火の抑制）。
- chokidar は `awaitWriteFinish`（安定するまで待つ）を有効化し、書き込み途中の半端な内容を読まない。

### 6.4 外部編集の反映フロー

```
AIが tasks.md を編集
  → chokidar change イベント (awaitWriteFinish 後)
  → ハッシュ照合: 自己発火なら無視 / 外部編集なら続行
  → 当該ファイルだけ再パース（全スキャンしない）
  → WebSocket で { type: "change-updated", changeId, ... } を全クライアントへ
  → UIが該当部分を更新（進捗バー・チェック状態が即追従）
```

### 6.5 AIのストリーミング書き込みと「編集中」表示

`awaitWriteFinish`（6.3）は、書き込みが安定するまで再パースを遅らせる正しい設計だが、副作用がある: **CursorやClaudeはファイルを一括上書きせず、数秒〜数十秒かけて逐次追記する**ことが多い。その間UIは沈黙し、AIの出力が静止して初めて画面が切り替わる。

- **v1（フェーズ1・2）の方針**: このバッチ更新挙動で問題ない。データの整合性は保たれ、最終結果は正しく反映される。
- **将来拡張（フェーズ3以降）**: chokidar の `add`/初回 `change` イベント（＝`awaitWriteFinish` 確定前）を捉え、**「AIが編集中（Writing…）」のステータスだけ**を軽量WSイベントで流す。本文はパースせず、対象 change/ファイルに「編集中」バッジを出すのみ。確定後に通常の `change-updated` で本体を反映する。これによりユーザーは「いま裏でAIがこのファイルを触っている」と把握でき、不要な操作（その最中のtoggle）を避けられる。

### 6.6 パースの堅牢性

- `remark` の AST `position` から各タスクの行番号を取得。正規表現スキャンより堅牢で、ネストしたリストやコードブロック内の `- [ ]` 誤検知を避けられる。
- パース失敗（不正なMarkdown）時はそのファイルを `parseError` 付きで返し、UIは生テキスト表示にフォールバック。**UIが落ちない**ことを保証する。

---

## 7. REST / WebSocket API（v1）

### REST
| メソッド | パス | 用途 |
|----------|------|------|
| `GET` | `/api/state` | ワークスペース全体の正規化stateを返す |
| `GET` | `/api/changes/:id` | 単一changeの詳細（本文含む） |
| `POST` | `/api/tasks/toggle` | チェックボックスのサージカル編集（`baseHash` + `expectedText` による楽観ロック／行ズレ自動補正、6.2参照） |
| `GET` | `/api/file?path=` | 任意 `.md` の生テキスト（閲覧フォールバック用） |

### WebSocket（サーバー→クライアント push）
```ts
type ServerEvent =
  | { type: "state-replaced"; state: WorkspaceState }      // 大きな変更時
  | { type: "change-updated"; changeId: string; change: Change }
  | { type: "spec-updated"; domain: string; spec: SpecDomain }
  | { type: "file-writing"; filePath: string; changeId?: string }  // AIが編集中（6.5、フェーズ3以降）
  | { type: "conflict"; filePath: string };                // 競合通知
```

---

## 8. UI設計

### 画面構成
1. **Overview（トップ）**
   - アクティブな change をカード表示。各カードに **進捗バー（done/total）**・タイトル・Intent要約。
   - 全体サマリ（合計タスク数・完了率）。
2. **Change詳細**
   - タブ: `Tasks` / `Proposal` / `Design` / `Delta Specs`。
   - `Tasks` タブは **プログレスツリー**（セクション→タスクの階層）と、任意で **カンバン**（Todo / Done の2列、`@dnd-kit` でドラッグ。ドロップ＝toggle）。
   - チェックボックスはクリックで即 toggle。競合時はトースト表示。
3. **Specsブラウザ**
   - `openspec/specs/` のドメイン一覧 → requirement / scenario をGiven-When-Thenで整形表示（**閲覧のみ**）。
4. **Archive（任意 / 後フェーズ）**
   - 完了済みchangeの一覧。

### 同期UXの原則
- 外部編集が来たら、操作中でない箇所は**滑らかに更新**（行を点滅させて変化を示す）。
- 競合（409）は破壊的に上書きせず、必ずユーザーに気づかせてから再取得。

### 競合（409）からのリカバリーUX

前提として、6.2の `expectedText` フォールバックにより**409は「チェック対象のタスク行そのものがAIに書き換えられた」稀なケースに限定される**。したがって、画面全体を暗くする・強制リロードといった**大域的で破壊的な対応は採らない**（頻度が低く影響範囲も局所的な事象に対して過剰で、ユーザーの作業文脈を奪う）。

採用するのは **「楽観的更新 + バックグラウンド静的和解 + 局所的な再確認プロンプト」** の3段構え:

1. **楽観的更新**: クリック即座にUIのチェック状態を反転（レイテンシ体感ゼロ）。
2. **バックグラウンド和解**: 409時、レスポンス同梱の最新stateで画面を**静かに差し替える**。トーストは出さず、変化した箇所だけ点滅でハイライト。ユーザーが触っていない他タスクの更新はこれだけで完結。
3. **局所的な再確認**: ユーザーが操作した**まさにそのタスク行**が競合していた場合のみ、楽観的更新をロールバックし、その行にインライン表示を出す:
   - 「この項目はAIにより更新されました」＋ **更新後の新しいテキスト**を提示。
   - ワンクリックの **「もう一度チェックする」** ボタン（＝新 `expectedText`/`baseHash` で再送）。
   - 補助として控えめなトースト（自動で消える）。**モーダルや画面ロックは使わない。**

設計原則: **ユーザーの意図（チェックしたかった）を捨てない／全画面を奪わない／競合の局所性を保ったまま、最小の摩擦で再適用に導く**。

---

## 9. プロジェクトのディレクトリ構成（実装時）

```
openspec-ui/
├── package.json
├── bin/
│   └── ithyno.js          # CLIエントリ（commander）
├── server/
│   ├── index.ts                # Fastify起動・静的配信・WS
│   ├── parser/                 # remarkベースのパーサ群
│   │   ├── tasks.ts
│   │   ├── spec.ts
│   │   └── proposal.ts
│   ├── sync/
│   │   ├── watcher.ts          # chokidar + エコー抑制
│   │   └── surgicalEdit.ts     # 行単位チェックボックス編集 + 楽観ロック
│   └── model.ts                # ドメイン型
├── web/                        # Vite + React
│   ├── src/
│   │   ├── store.ts            # Zustand + WSハンドラ
│   │   ├── pages/{Overview,ChangeDetail,Specs}.tsx
│   │   └── components/{ProgressBar,Kanban,TaskTree}.tsx
│   └── index.html
├── docs/
│   ├── architecture.md
│   └── roadmap.md
└── README.md
```

---

## 10. リスクと対策（idea.md のトレードオフへの回答）

| リスク | 対策 |
|--------|------|
| 同時編集の競合（ロストアップデート） | 楽観的ロック（baseHash照合）＋ 409で再取得。フルシリアライズしない。 |
| 行番号ズレによる409多発（UX劣化） | `expectedText` フォールバックで対象行を内容一致から再特定し、行ズレは自動補正。真の409のみ局所的に再確認（6.2 / 8章）。 |
| マルチラインタスク・タブ/`*`マーカーの破壊 | 状態1文字のみ置換する厳格な正規表現＋単体テスト網羅（6.1）。 |
| AIストリーミング書き込み中のUI沈黙 | v1はバッチ更新で許容。フェーズ3で「編集中」軽量WSイベント（6.5）。 |
| 書き込みループ（自己発火） | 書き込み後ハッシュ記録 + watcherでの自己発火無視 + `awaitWriteFinish`。 |
| Markdownの方言化 | UIメタデータを `.md` に埋め込まない。番号・順序など必要な情報はすべて素のOpenSpec記法から導出。 |
| パース崩れでUIが死ぬ | ファイル単位の `parseError` フォールバック（生テキスト表示）。1ファイルの破損が全体を巻き込まない。 |
| 大規模リポジトリでの初期スキャン遅延 | 起動時は `changes/`（アクティブ）優先で段階ロード。`archive/` は遅延ロード。 |
