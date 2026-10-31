# Outcome — add-agent-cli-command-builder

## Worked

- Agent設定をClaude Code、Codex、Agy、GitHub Copilotごとの構造化された引数UIへ置き換え、モデル、推論、権限、sandbox、実行方法などをカテゴリ別に設定できるようにした。
- 実行時にユーザー環境のCLIを走査せず、保守者が明示的に生成する静的なcapability catalogをruntimeの参照元にした。
- 未対応引数は専用のFree-form argsとして保持し、既存の`command`と`args[]`を使う`agents.yaml`互換性を維持した。
- Claudeのmanaged project sessionとAgyのsession continuationを通常のCLIオプションと組み合わせて設定できるようにした。

## Review findings resolved

- Dispatcherが注入するprompt、change ID、artifact contractをAgent設定へ保存しない境界を追加した。Claudeの`--print`とCodexの`exec`で、構造化オプションを挟む形式も回帰テストで固定した。
- Free-form argsを全argvの別表示ではなく、構造化フィールドに含まれないargvだけを編集する欄へ修正した。
- Claude managed sessionで絶対パスや`claude-code` aliasを指定した場合も、設定された実行ファイルを保持するよう修正した。

## Verification

- 全78 test files: 1171 passed / 4 skipped
- Focused regressions: 111 passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `openspec validate add-agent-cli-command-builder --strict`: passed
- `git diff --check`: passed

## Follow-ups

- capability catalogの更新は、CLI仕様が変わったときに保守者がgeneratorとローカルargv検証を明示実行して反映する。
- catalogは利用可能性の保証ではないため、アカウントやgateway固有のモデル名は引き続き手入力を許可する。
