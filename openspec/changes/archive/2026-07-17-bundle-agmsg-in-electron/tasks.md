# Tasks — bundle-agmsg-in-electron

## 1. Vendor fujibee/agmsg via git submodule

- [x] 1.1 `git submodule add https://github.com/fujibee/agmsg.git
  vendor/agmsg` — pin to a specific tag (use `git submodule set-branch`
  or `git -C vendor/agmsg checkout <tag>`)
- [x] 1.2 `.gitmodules` に "shallow = true" を追加してクローン軽量化
- [x] 1.3 vendored tree の `LICENSE` が MIT であることを確認、README
  にも license 属性を明記
- [x] 1.4 CONTRIBUTING.md (無ければ README.md) に
  `git clone --recursive` の一行注意書きを追加

## 2. Electron `extraResources` に vendor/agmsg を追加

- [x] 2.1 `electron/package.json` の `build.extraResources` に
  `{ "from": "../vendor/agmsg", "to": "app/vendor/agmsg" }` を追加
- [x] 2.2 packaging 時に `resources/app/vendor/agmsg/scripts/*.sh`
  が正しく含まれることを smoke test で確認 (electron-builder が
  実行ビットを保持するかは要確認 — dropped なら install 側で
  fs.chmod でリカバリ)

## 3. First-launch installer 実装

- [x] 3.1 `electron/src/agmsg-installer.ts` を新規作成
  - `ensureAgmsgInstalled(app: App): Promise<void>` を export
  - Windows は早期 return (`process.platform === "win32"`)
  - `send.sh` の存在 check → あれば no-op
  - `~/.ithyno-config/skip-agmsg-install` marker check → あれば
    no-op
  - `electron.dialog.showMessageBox` で 3-ボタン modal
  - Install: `resources/app/vendor/agmsg/` → `~/.agents/skills/
    agmsg/` を再帰コピー、`.sh` に `fs.chmod(0o755)` 適用
  - Skip: 何もせず return
  - Never ask: `fs.writeFile` で marker file 作成
- [x] 3.2 `electron/src/main.ts` の `app.whenReady().then` chain に
  `await ensureAgmsgInstalled(app)` を `createWindowForProject` 前
  に挿入
- [x] 3.3 packaged / dev 両方で resources path が解決されるよう
  `app.isPackaged` 分岐: packaged → `process.resourcesPath +
  '/app/vendor/agmsg'`、dev → `path.resolve(__dirname, '../../
  vendor/agmsg')`

## 4. Docs

- [x] 4.1 `README.md` に "Electron 版では初回起動時に agmsg auto-
  install prompt が出ます。CLI 版では `/plugin marketplace add
  fujibee/agmsg` を Claude session で実行してください" を追記
- [x] 4.2 CLI 側の `bin/ithyno.js` startup banner には言及しない
  (CLI users は separately install が前提)

## 5. Verify

- [x] 5.1 `openspec validate bundle-agmsg-in-electron --strict` VALID
- [x] 5.2 `npm test && npm run typecheck && npm run build` clean
  (electron/ は tsc -p tsconfig.json 個別なので `cd electron &&
  npm run build` も追加で確認)
- [ ] 5.3 手動 packaging verify: `cd electron && npm run
  package:mac` → 出力 dmg を展開して `resources/app/vendor/agmsg/
  scripts/send.sh` が実行可能な形で含まれているか。**deferred**:
  dmg 生成には code signing / Apple Developer 環境が必要なため
  user 側で回す
- [ ] 5.4 手動 first-launch verify (macOS): 事前に
  `rm -rf ~/.agents/skills/agmsg ~/.ithyno-config/skip-agmsg-install`
  → dmg を起動 → prompt 表示 → Install クリック → コピー完了 →
  `~/.agents/skills/agmsg/scripts/send.sh` に実行ビット。**deferred**
  (5.3 と同じ)
- [ ] 5.5 手動 "Never ask" verify: 上記から一旦アンインストール後
  再度 `rm -rf` → Never ask クリック → marker 作成 → 再起動で
  prompt 出ない。**deferred**
- [ ] 5.6 手動 CLI 版 verify: `bin/ithyno.js` 起動 → agmsg install
  prompt が出ないこと (Electron only の確認)。**deferred**;
  bin/ithyno.js は変更していないので regression なし

## 6. Post-impl

- [x] 6.1 outcome.md
- [ ] 6.2 `/ithy-opsx:archive bundle-agmsg-in-electron`
