# Delta: dashboard — revert extend-agent-job-model

## REMOVED Requirements

### Requirement: Job Model Includes Role And Runtime

**Reason for removal**: R1 (revert-dispatch-endpoint) で dispatch endpoint
が撤去され、role / runtime を軸にした job selection / display の意味が
消失。skill 経由 (`/opsx:manage`, `/opsx:code`) は job model を通さず
Task tool で直接動くため、JobSummary に role / runtime を持つ必要が無い。

**Migration**: 既存 UI (Agents tab) の Recent Jobs から role / runtime
badge が消える。verdict badge は残る (`add-review-artifact` 由来、別 revert
で扱う)。orphan-adopted job で `role: "orphan"` を出していた領域は
verdict badge の存在有無だけで見分けが付く。

### Requirement: Job Model Includes Artifact Paths On Finish

**Reason for removal**: `artifactPaths` は dispatch endpoint response で
review.md の path を返す用途が主だった。dispatch endpoint 撤廃済みなので
用途消失。worktree diff の直接読み出しは既存の diff endpoint で足りる。

**Migration**: server side `listChangeArtifacts()` scanner は削除。
`review.md` の内容取得が必要なケースは今後 skill / Claude 側で
`git worktree` の diff or 直接 read で対応する。
