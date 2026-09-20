---
title: ithyno User Manual
audience: end-user
---

# ithyno User Manual

エンドユーザ向けのマニュアルです。設計や実装の背景は `docs/` 直下 (内部文書) を参照。

## Contents

- [エージェント設定 — 対応 CLI と agents.yaml](./multi-agent-cli.md)
  claude / copilot / agy / codex をワーカーとして `agents.yaml` に書く方法。
- [Local bridge for CLI and MCP](./bridge.md)
  ローカル実行に必要なプロジェクト識別、same-user 制約、no-port fallback、MCP 連携の手順。
- [Troubleshooting](./troubleshooting.md)
  よくあるエラーと回避方法 (session-id / サーバー起動失敗 / new project 途中終了 …)。
