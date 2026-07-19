---
tags: [feature/init, area/ui, area/electron, area/vscode, area/server]
status: idea
promoted_to:
---

# `ithyno init` から UI 経由の「新規プロジェクト作成」に発展させる

## 動機

`add-init-command` (2026-07-19 archived) で `npx ithyno init [dir]` の CLI 経路
は landed した。ただし今の init は:

- 既存の git repo を要求 (preflight で refuse)
- ターゲットディレクトリは既存でないと failure
- UI からは呼び出せない — terminal 前提

一方 Ithyno の distribution channel は 3 系統ある:

1. **CLI + browser** (`bin/ithyno.js`)
2. **Electron desktop app** (`electron/`)
3. **VS Code extension** (`vscode-extension/`)

このうち **CLI 以外は「New Project ボタンで空のプロジェクトを作る」体験**が
自然。今の init は CLI 志向の設計なので、UI 経路のギャップを埋める必要がある。

## 目標 / 非目標

**目標:**

- 3 channel 全部で「New Project」ボタン (or 相当) が動く
- 内部は `runInit` 1 箇所を共有 (channel ごとに実装が分岐しない)
- 「親フォルダ選択 → プロジェクト名入力 → 作成 → 開く」まで自動
- 非 git dir でも自動 `git init` する option (auto-git-init)

**非目標:**

- CLI の `ithyno init` の挙動を変えない (既存の terminal 使用者向け UX を保護)
- テンプレートの多様化 (Python 用テンプレなど) — 現状 1 種類でよい
- インタラクティブ prompt (project name 選び直し等) — UI 側でやる

## 共通 backbone

`bin/init.js` の `runInit` は既に stateless な関数として export されている。
これをそのまま:

1. **HTTP endpoint** `POST /api/init` でラップ (server)
2. **VS Code extension** から直接 import (host が同じ Node context にいる)
3. **Electron main process** からも直接 import (renderer には IPC bridge)

「新規プロジェクト」体験のために `runInit` に追加する option:

```ts
runInit({
  targetDir: '/path/to/parent/<name>',
  force: false,
  skipGitignore: false,
  autoCreateDir: true,   // ← 新: 存在しなければ mkdir -p
  autoGitInit: true,     // ← 新: git repo でなければ git init
  quiet: true,
});
```

CLI 側の default は現行維持 (`autoCreateDir: false`, `autoGitInit: false`)。
UI 経路の default は両方 `true`。preflight は同じでも「事前に処置してから
再判定」に変わる。

### `POST /api/init` の shape

```
POST /api/init
Content-Type: application/json
X-Csrf-Token: ...        # 既存 auth と同じ

{
  "dir": "/absolute/path",
  "force": false,
  "skipGitignore": false,
  "autoCreateDir": true,
  "autoGitInit": true
}

→ 200
{
  "ok": true,
  "target": "/absolute/path",
  "actions": [ { "path": "CLAUDE.md", "action": "create" }, ... ],
  "gitignoreResult": "created",
  "summary": { "created": 6, "overwritten": 0, "skipped": 0 },
  "openspecMissing": true,
  "gitInitPerformed": true
}
```

失敗時は `{ ok: false, exitCode, reason }` そのまま。

## Channel 別の flow

### 1. CLI + browser

- **CLI**: `ithyno init` そのまま (現行)。UI からは触らない。
- **Browser**: `bin/ithyno.js` で起動しているサーバに UI からアクセスしている
  ケース。ネイティブ dir picker が使えない (Chrome の
  `showDirectoryPicker()` は限定的)。3 択:
  1. **Path input box** に絶対 path を打ち込む (最小、動く、UX 悪)
  2. `showDirectoryPicker()` を使う (Chrome/Edge のみ、他ブラウザで grey out)
  3. **表示だけ** — 「Electron 版 or VS Code 拡張から作成してください」と
     案内 (browser 使用者にはやや不親切だが実装最小)

  推奨: 1 (path 入力) と 2 (dir picker、対応ブラウザのみ) を併存。fallback
  path で最低限動かす。

### 2. Electron

- 既存 preload に `pickProjectDir()` を追加 (main process の
  `showOpenDialogSync({ properties: ['openDirectory', 'createDirectory'] })`
  を呼ぶ)。
- Renderer 側で:
  1. ボタン click → `window.openspecUI.pickProjectDir()` で dir 選ぶ
  2. 「Project name」input で子ディレクトリ名決める
  3. `POST /api/init` に `{ dir: parent + '/' + name, autoCreateDir: true, autoGitInit: true }`
  4. 成功したら Electron の「Open Recent」相当で新プロジェクトを開く
     (main process に IPC で `open-project` メッセージ)

- 「createDirectory: true」は macOS 上で dialog 内に New Folder ボタンが
  出るのでそこで空フォルダも作れる。あるいは:
  - **単一 dialog** — 既存空フォルダを選ばせる
  - **2 段 dialog** — 親 + 名前 (推奨、明示的)

### 3. VS Code extension

- `vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false })`
  で親 dir 選ぶ
- `vscode.window.showInputBox({ prompt: 'Project name' })` で名前
- Extension host process (Node) から `runInit` を直接 import 呼び出し
  (HTTP なくてもいい — extension が Node 側で動くので)
- 成功したら `vscode.commands.executeCommand('vscode.openFolder', Uri.file(newProjectPath), { forceNewWindow: true })`

Extension は `vscode-extension/host/` に Ithyno server コピーを持っている
(現状の shape)。そこから `bin/init.js` を import。

### 4. 決定木まとめ

| channel | dir picker | 実行 |
| --- | --- | --- |
| CLI | (terminal) | `ithyno init <path>` |
| Electron | `dialog.showOpenDialogSync` | POST /api/init → 完了後 open-project IPC |
| Browser | path input + optional `showDirectoryPicker()` | POST /api/init |
| VS Code | `vscode.window.showOpenDialog` + inputBox | `runInit()` 直接 + `vscode.openFolder` |

## 未解決 / propose 段階で決めること

1. **`runInit` の option 拡張は破壊的か?** 追加のみなので既存呼び出しは動く。
   ただし CLI に `--auto-create-dir` / `--auto-git-init` flag を追加するか
   別 command (`ithyno new-project <parent-dir> <name>`) に分けるか要検討。
   後者のほうが CLI の可読性は上。

2. **`git init` の中身**: `git init` だけ? `git init && git commit --allow-empty
   -m "initial"` まで? 空 commit がある方が worktree 系操作は素直だが好み分かれる。

3. **成功後の遷移**:
   - Electron: 現ウィンドウ / 新ウィンドウ どちらで開く?
   - VS Code: `forceNewWindow` true / false?
   - Browser: 現 UI が `?dir=` を再ロード? redirect?

4. **`openspec init` を一緒に走らせるか**: 現在 init の Next steps に手動で
   出しているが、「New Project」体験としては `openspec init` も自動で走る
   のが自然。`npx -y @fission-ai/openspec init` を child_process で叩けば
   よい。オプション?

5. **Progress feedback**: init 自体は数秒だが、`openspec init` (npx 経由の
   package download を含む) は 10 秒〜。ストリーム or spinner?

## 見積もり (提案段階では詰めない)

粗く 3 propose:

| propose | scope |
| --- | --- |
| `add-init-http-endpoint` | `runInit` の option 拡張 + `POST /api/init` + auth |
| `add-electron-new-project-flow` | preload bridge + renderer UI + main IPC |
| `add-vscode-new-project-command` | extension command + inputBox + openFolder |

Browser 版 UI は上記 3 の共通 UI として最初の propose に含める。

## 参考

- `openspec/changes/archive/2026-07-19-add-init-command/` — CLI init の landed
  形。`bin/init.js` の `runInit` シグネチャ + preflight。
- `electron/src/main.ts` の既存 `showOpenDialogSync` パターン — 「Open Project」
  では既に使っている。「New Project」も同じ呼び出しに `createDirectory: true`
  を足すだけ。
- `vscode-extension/host/` — extension 内から server 相当を動かす既存構造。
  そこから `runInit` を import できるはず (要確認)。
