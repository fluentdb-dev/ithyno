# Outcome — add-runtime-detection

## ✅ Worked

- **薄い実装、predictable な shape**。detection module は 55 LOC、endpoint
  は 40 LOC。前 change の add-dispatch-endpoint と違い、ロジックが単純
  (`which <cmd>` + cache) で pure functional な形。
- **`uniqueCommands` set で dedup** した detection は 1 行の `new Set(...)`
  で書けた。runtimes が `claude` と `claude-alt` の 2 定義で command が
  両方 `claude` なら detection は 1 回。tests 3.5 で pass 検証。
- **`Object.defineProperty(process, "platform", ...)` を try/finally で
  wrap** して Windows sentinel テストを書けた。`vi.stubGlobal` は
  `process.platform` に効かないので直接書き換え、restore で漏れないよう
  finally で戻す。
- **Cache は 1 行の `let ... : ... | null = null`** で済んだ。Registry
  reload や explicit `?refresh=1` で `runtimeDetectionCache = null` の
  branch を踏む。Complex な TTL / LRU は不要。
- **`skipOnWindows = process.platform === "win32" ? it.skip : it`** の
  1 行 helper で POSIX 固有 tests を skip 可能にした。CI が
  Windows runner を追加した時のためのガード (未来対応)。

## ⚠️ Surprises

- **`vi` を import したが未使用で typecheck エラー**になった。tsconfig の
  `noUnusedLocals` が効いていて test file も対象。修正は 1 行削除。
  build 側は問題なかったので気付くのが遅れた。次回から test も含めて
  `npm run typecheck` を早い段階で通す方針。
- **`type DetectionResult` の export を `import type` にしたかった** が、
  index.ts で `import { detectAllRuntimes, type DetectionResult }` を
  混在 import できる TypeScript 4.5+ 構文で書いた。TypeScript compiler の
  version 依存があるので、後日 downgrade するなら型と関数を分けて import
  する必要あり。
- **`refresh=true` / `refresh=1` の 2 パターン受け入れ**。仕様書には `?refresh=1`
  と書いたが、curl から書きやすい `refresh=true` も許容した (fastify の
  query string parsing に依存)。仕様との差は spec の scenario では
  `?refresh=1` 例のみ触れているので、documented behavior と
  implementation は互換。

## 🔁 Differently

- **runtimeDetectionCache を module-level `let` で保持している** が、テスト
  性を上げるなら `class RuntimeDetectionCache` で構造化する余地がある。
  現状 endpoint の中身が浅いのでこのままで OK。
- **`?refresh=1` 経路の integration test** は書いていない。fastify の
  server を起こす統合テスト harness が現状無く、Phase 3.2 の
  add-dispatch-endpoint も同じ理由で API 経路の end-to-end test を defer
  している。Phase 5.1 で Agents タブ Live panel が実装される時に UI 経由
  で確認する。

## 🌱 Follow-ups

- **Windows `where <cmd>` サポート** — 現状 sentinel を返すだけ。
  Windows user が現実的に付いた時に別 change で。
- **Version detection** — 例: `claude --version` を叩いて `>= 4.7` を
  確認する。Fusion runtime (Phase 3.5) や旧 CLI 互換性で必要になった時
  に別 change で。
- **Cache invalidation on agents.yaml reload** — 現状 registry の
  `startWatching` は agents.yaml 変更で load を再走するが、runtime
  detection cache は残ったまま。file watcher の onChange で
  `runtimeDetectionCache = null` を叩くと clean。次 change で対応する
  か、`?refresh=1` で回避する運用にするか判断。
- **Phase 5.1 add-agents-tab-live-panel** — Runtimes section で
  `installed / not-found / hint` バッジを表示。Endpoint はここで初めて
  UI 消費される。

## Notes

- 新規 file 2 個 (runtime-detect.ts / runtime-detect.test.ts)
- Modified: server/index.ts (+40 LOC で 1 route + import)
- Registry / runner / dispatch は変更なし
- Tests: 204 → 211 (+7)、typecheck / build clean
