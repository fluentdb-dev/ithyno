# Delta: dashboard — revert session-id CLI wiring

## REMOVED Requirements

### Requirement: Template Variable Session Id

**Reason for removal**: R1 (dispatch endpoint 撤去) + R2 (job model) 撤退後、
session-id を CLI に配線する経路が Manager loop skill 経由に一本化。
`${session_id}` template var は使用箇所ゼロ。

**Migration**: `agents.yaml` で `${session_id}` を書いている entry (現在
claude agent の args) は該当 flag ごと削除。Claude Code は毎回新しい session
を作る挙動に戻る。

### Requirement: Change-Scoped Session Id Persistence

**Reason for removal**: `.ithyno/sessions.json` に change 単位 UUID を
persist する仕組みも同時撤去。session 継続は Claude 側の `--continue` /
`--resume` を必要に応じて manual 指定する形に戻る。

**Migration**: 既存 `.ithyno/sessions.json` は残骸として残る (無害、手動
削除可)。同 file を参照するコードは無い。

### Requirement: Dispatch Session Correlation

**Reason for removal**: dispatch endpoint 自体が R1 で撤去済み。この
requirement は元々 dispatch response に session-id を含める仕様だったので
自然に落ちる。

**Migration**: 影響なし。
