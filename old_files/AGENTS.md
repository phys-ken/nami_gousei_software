# Agent Guidelines — nami_gousei_software

詳細なアーキテクチャ・仕様は [CLAUDE.md](CLAUDE.md) を参照。  
現行の開発計画は [dev_add_sinwave.md](dev_add_sinwave.md) を参照。

---

## Quick Commands

```powershell
# 開発サーバー（静的 :8000 のみ）
python server.py

# 開発サーバー（静的 :8000 + REST API :8001）
node api_server.js

# ユニットテスト（全テスト 125 件）
node --test tests/wave.test.js tests/renderer.test.js tests/random.test.js tests/api.test.js

# API スモークテスト（api_server.js 起動中に実行）
node api/smoke.js
```

---

## Current Development: Sine Wave Mode

**作業ブランチ**: `feature/sinwave`  
**計画書**: [dev_add_sinwave.md](dev_add_sinwave.md)（フェーズ定義・数式・API 設計をすべて含む）

### ブランチ運用ルール
- すべての作業は `feature/sinwave` ブランチで行う
- `main` へのマージは Kenya（依頼主）の明示指示があるまで**禁止**
- `git reset --hard` は使わない（push 済み履歴を破壊するため）
- 各 Phase 完了ごとにコミット＋ `git push origin feature/sinwave`

### Phase 進行の原則
1. 実装 → ブラウザテスト(dev_add_sinwave.md §4 の各 Phase テスト項目) → `node --test` で退行確認 → コミット
2. ブラウザテスト NG ならコミットしない
3. アーキテクチャ上の判断・数式の不確実性・UX 設計の判断が必要な場合は **Kenya に質問**し場当たり的なハックを行わない（質問フォーマットは dev_add_sinwave.md §7 参照）

---

## Architecture Overview

詳細は [CLAUDE.md#アーキテクチャ](CLAUDE.md) 参照。

```
WaveEditor → Wave/SineWave → WaveRenderer → ProblemGenerator → Exporter
```

REST API 経由の場合: `POST /api/generate` → validate.js → translate.js → bridge.js (vm sandbox) → serialize.js

### Key Files

| ファイル | 役割 |
|---------|------|
| `js/wave.js` | `Wave` クラス（頂点ベース）。sinwave 開発で `SineWave` クラスを末尾追加予定 |
| `js/renderer.js` | Canvas 描画。`pixelRatio:2`、`computeCanvasSize()` に寸法計算集約 |
| `js/problems.js` | Type 1〜7 の設問・解答 Canvas 生成 |
| `js/app.js` | UI 状態管理・localStorage 永続化 |
| `api/bridge.js` | Node.js vm サンドボックスで `js/` を実行 |
| `api/validate.js` | Zod スキーマバリデーション |
| `api/translate.js` | API 仕様 → ProblemGenerator 状態変換 |

---

## Critical Conventions

- **pixelRatio=2**: Canvas の物理ピクセルを 2 倍にして `ctx.scale(2,2)`。描画コードは論理座標（580×200）で書く
- **`wave.vertices` 直接アクセスは Phase 1.5 で抽象化予定**: sinwave 開発では `isEmpty()` / `getKeyXs(t)` / `getMaxAmplitude()` / `reflect()` を使う
- **後方互換**: localStorage / API リクエストの既存フォーマットは壊さない。`kind === 'sine'` がなければ Wave として扱う
- **vm サンドボックス制約**: `js/` にブラウザ API を追加したら `api/sandbox-stubs.js` も更新が必要
- **Type 3 の特殊性**: `result.refCanvases` が存在する唯一の Type（解説スナップショット列）

---

## Testing Policy

- 既存テスト全 125 件を常時 PASS に保つ。退行が出たら即修正
- sinwave 新規テストは `tests/wave.test.js` に追記（Phase 1）、`tests/api.test.js` に追記（Phase 6）
- ブラウザテストの最終判定は**テスト専用エージェント**が行う（開発エージェントの予備確認は判定に非ず）

---

## Common Pitfalls

- `App._int(id, def)` / `_float(id, def)` は `0` を有効値として扱う（`|| default` パターン不使用）
- `SineWave` は `vertices` プロパティを持たない
- Type 3 の distractor と Type 4 の distractor は Canvas 描画方法が異なる（CLAUDE.md 参照）
- `_buildReflectedWave()` → sinwave 開発後は `wave.reflect(boundary, endType)` に委譲
