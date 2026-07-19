# Delta: dashboard — revert runtime detection

## REMOVED Requirements

### Requirement: Runtime Installation Detection

**Reason for removal**: R3 で `runtimes:` block 撤廃済み。detection の入力
(runtime → command マップ) がゼロになったため scanner 自体が意味を失う。

**Migration**: agents.yaml の `agents[].command` は既存の PATH resolution
(shell が spawn 時に解決) で足りる。事前 detection UI は撤去。

### Requirement: Runtime Status Endpoint

**Reason for removal**: `GET /api/agents/runtimes` は runtime 一覧を返すため
の endpoint。撤去。

**Migration**: 該当 endpoint に依存する client が無いことを R3 で確認済み
(空 list stub 化後も呼出は残っていた client 側 fetchRuntimes 経路も
本 revert で削除)。
