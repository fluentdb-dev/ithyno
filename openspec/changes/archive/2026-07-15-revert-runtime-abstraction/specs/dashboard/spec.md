# Delta: dashboard — revert runtime abstraction

## REMOVED Requirements

### Requirement: Runtime Definitions In agents.yaml

**Reason for removal**: R1 (dispatch endpoint) + R2 (job model role/runtime
field) 撤去後、runtime を中央定義して agent に inherit させる意味が消失。
Agent 定義は「name + command + args + mode + roles + prompts」の単一形で
足りる。

**Migration**: 既存 `agents.yaml` に top-level `runtimes:` block を持って
いる project は起動時に parse エラーになる。inline に書き下すこと (block を
削除して各 agent に `command` / `args` を直接記入)。ithyno 本体の
agents.yaml は既に inline shape。

### Requirement: Runtime-Backed Agents

**Reason for removal**: agent の `runtime: <name>` 参照による inheritance
機構を撤去。Modal Advanced の Runtime dropdown も同時撤去 (default collapsed
のため通常の Modal 操作には不可視)。

**Migration**: `runtime: xxx` を参照している agent 定義があれば、参照先
`runtimes:` block の command / args / prompts / supports を agent 側に
inline コピーする。

