# Delta: agent-runner — revert specialties + concurrency schema fields

## REMOVED Requirements

### Requirement: Agent Role Metadata Fields

**Reason for removal**: `specialties` (weighted dispatch matching) と
`concurrency` (job cap) は R1 で dispatch endpoint 撤去後 unused。`role`
は `roles[]` に進化して reshape-agents-yaml-mode-roles が別途担保して
いる。schema slim 化のため撤去。

**Migration**: `agents.yaml` の `specialties: [...]` と `concurrency: N`
は unknown key として reject or 無視される (次の起動で警告)。既存 file
は該当行を削除。

### Requirement: Agent Metadata Validation

**Reason for removal**: 撤去する field の validation も同時撤去。

**Migration**: 実質影響なし。

### Requirement: Metadata Fields Are Inert

**Reason for removal**: field 自体が消えるため "inert" の宣言も不要。

**Migration**: なし。
