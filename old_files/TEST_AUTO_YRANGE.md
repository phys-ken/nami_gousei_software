# TEST_AUTO_YRANGE.md — y 軸自動調整機能 テスト指示書

> **対象エージェント**: テスト専用 LLM（ブラウザ操作 + Node.js コマンド実行が可能なこと）
>
> **重要**: このチェックリストを埋めてよいのは **テスト専用エージェントのみ** です。
> Claude Code（実装担当エージェント）がテストを実行しても、それは予備確認に過ぎません。
> 最終的な PASS / FAIL の判定・チェックリストへの記入は、**テスト専用エージェントが実施** してください。
>
> **前提**:
> - ブラウザ版: `python server.py` を起動し `http://localhost:8000` を開く
> - API 版: `node api_server.js` を起動し `:8001` を使用（または `node --test tests/api.test.js` でユニットテストを実行）
> - 各テストは上から順に実施する

---

## 0. 退行確認（既存機能が壊れていないこと）

### 0-1. ブラウザ: Type 1 基本生成

1. 波形編集タブ → 波 A に波形を描く（例: x=2 に y=2、x=4 に y=0）
2. 設問作成タブ → Type 1、解答時刻 `t=2` → 「設問を生成」
3. 問題・解答 Canvas が正常表示される
4. コンソールエラーなし

**結果**: ✅ PASS — canvas=5、コンソールエラーなし

---

### 0-2. ブラウザ: Type 4 基本生成

1. 「＋ 波 B を追加」→ 波 B を描く → Type 4、解答時刻 `t=3` → 「設問を生成」
2. 合成波 Canvas が正常表示される

**結果**: ✅ PASS — canvas=6、合成波正常表示

---

### 0-3. ユニットテスト全通過

```powershell
node --test tests/wave.test.js tests/renderer.test.js tests/random.test.js tests/api.test.js
```

期待: 全テストが PASS（125 ケース以上）

**結果**: ✅ PASS — 125 ケース PASS（wave 34 + renderer 16 + random 18 + api 57）

---

## 1. ブラウザ版 — 設問作成タブ遷移時の y 軸自動調整

### 1-1. 波 A のみ — 最大変位 + 1 に自動拡張される

**準備**
1. ページリロード（初期状態に戻す）
2. グリッド設定を確認: yMin = `-2`、yMax = `2`（デフォルト）
3. 波形編集タブ → 波 A に以下の頂点を設定:
   - x=2: y=2（最大変位 = 2）
   - x=4: y=0

**操作**
4. 「設問作成」タブをクリック

**期待結果**
- yMax 入力欄が `3` に更新される（`ceil(2)+1 = 3`）
- yMin 入力欄が `-3` に更新される（正負対称）
- 画面右下に「y 軸を自動調整しました：−3 〜 3」というトーストが表示される
- トーストが約 3 秒後に消える

**結果**: ✅ PASS — yMax=3, yMin=-3、トースト表示・3秒後消滅を確認

---

### 1-2. 波 A + 波 B — 合成波サンプリングで最大値を計算

**準備**
1. ページリロード
2. 波形編集タブ → 波 A を以下の頂点で設定（右向き、速さ 1）:
   - x=1: y=2、x=3: y=0
3. 「＋ 波 B を追加」→ 波 B を以下の頂点で設定（左向き、速さ 1）:
   - x=7: y=2、x=9: y=0

**操作**
4. 「設問作成」タブをクリック

**期待結果**
- yMax 入力欄が `5` に更新される（両波が重畳したとき最大 ≈ 4 → `ceil(4)+1 = 5`）
- yMin 入力欄が `-5`
- トーストが「y 軸を自動調整しました：−5 〜 5」と表示される

**結果**: ✅ PASS — yMax=5, yMin=-5、トースト「y 軸を自動調整しました：-5 〜 5」確認

> **計算根拠**: 波 A（右向き）と波 B（左向き）はおよそ t=4〜6 の間で中央付近にて重なる。
> その際の合成変位は最大 4 に達する（サンプリング確認値）。

---

### 1-3. 反射波モード — 入射波最大値 × 2 を上限とする

**準備**
1. ページリロード
2. 波形編集タブ → 「＋ 反射波モードを追加」
3. 波 A に以下の頂点を設定（右向き、速さ 1）:
   - x=1: y=2、x=3: y=0
4. 境界 x = 5（デフォルト）、自由端

**操作**
5. 「設問作成」タブをクリック

**期待結果**
- yMax 入力欄が `5` に更新される（頂点最大 2 × 2 = 4 → `ceil(4)+1 = 5`）
- yMin 入力欄が `-5`
- トーストが表示される

**結果**: ✅ PASS — yMax=5, yMin=-5、トースト表示確認

---

### 1-4. 手動で軸を狭めた後も設問生成できる

**前提**: テスト 1-1 の直後の状態（yMin=-3, yMax=3 が自動設定済み）

**操作**
1. yMin 入力欄を `-2`、yMax 入力欄を `2` に手動変更
2. 「適用」ボタンをクリック
3. Type 1、解答時刻 `t=1` → 「設問を生成」

**期待結果**
- エラーなく設問が生成される（gridConfig が[-2, 2] で動作する）
- 生成された Canvas の y 軸ラベルが `2` / `-2` 止まりであること

**結果**: ✅ PASS — canvas=4 生成、gridConfig yMin=-2/yMax=2 で正常動作

---

### 1-5. 波形なし — 自動調整・通知ともに発生しない

**準備**
1. ページリロード（波 A の頂点を入れない）

**操作**
2. 「設問作成」タブをクリック

**期待結果**
- yMin / yMax 入力欄が変化しない（デフォルト `-2` / `2` のまま）
- トーストが表示されない

**結果**: ✅ PASS — yMin=-2/yMax=2 変化なし、トーストなし

---

### 1-6. タブを往復すると毎回再計算される

**準備**
1. テスト 1-1 の状態（波 A に x=2: y=2 を設定、設問タブで yMax=3 になっている）

**操作**
2. yMin を `-1`、yMax を `1` に手動変更 → 「適用」
3. 「波形編集」タブをクリック
4. 「設問作成」タブをクリック

**期待結果**
- yMax が再び `3` に戻る（タブ遷移ごとに再計算・上書き）
- トーストが再表示される

**結果**: ✅ PASS — 往復後 yMax=3 に再設定、トースト再表示を確認

---

## 2. API 版 — `grid.yMin` / `grid.yMax` 未指定時の自動調整

> API はポート 8001 で起動中と仮定する。  
> **自動テストスクリプト**（推奨）: `node tests/auto_yrange_api_test.js` を実行すると 2-1〜2-6 を一括検証できる。  
> 個別確認が必要な場合は以下の curl コマンドを使用する（Windows PowerShell 対応）。

---

### 自動テストの実行方法

```powershell
# API サーバーを起動（別ターミナルで）
node api_server.js
# または ポート 8000 が競合する場合
$env:WAVE_STATIC_PORT=8888; node api_server.js

# テスト実行（サーバー起動後に別ターミナルで）
node tests/auto_yrange_api_test.js
```

期待出力:

```
=== TEST AUTO YRANGE — API Section 2 ===

2-1: grid 未指定・波A単独 (Type1)
  ✔ success:true
  ✔ files あり
  → tests/output/out_2-1.png saved
  ✔ yMax = 3
  ✔ yMin = -3
...
=== RESULT: 15 PASS / 0 FAIL ===
```

生成された `tests/output/out_2-*.png` を目視確認し、y 軸ラベルが期待値と一致することを確認する。

---

### 2-1. grid 未指定 — 波 A 単独（Type 1）

**リクエスト**

```json
{
  "type": 1,
  "waveA": {
    "vertices": [{"x":2,"y":2},{"x":4,"y":0}],
    "speed": 1, "direction": 1, "label": "A"
  },
  "params": { "answerT": 2 },
  "inline": true
}
```

```powershell
# Windows PowerShell での curl 実行例
$body = '{"type":1,"waveA":{"vertices":[{"x":2,"y":2},{"x":4,"y":0}],"speed":1,"direction":1,"label":"A"},"params":{"answerT":2},"inline":true}'
$resp = Invoke-RestMethod -Method POST -Uri http://localhost:8001/api/generate -ContentType 'application/json' -Body $body
$resp.gridConfig
```

**期待結果**
- レスポンス `success: true`、`files` が空でない
- `gridConfig.yMax = 3`（デフォルト `2` ではなく）
- `gridConfig.yMin = -3`
- 生成画像 `out_2-1.png` の y 軸ラベルが `3` / `-3`

**結果**: ✅ PASS — gridConfig.yMax=3, yMin=-3

---

### 2-2. grid 未指定 — 波 A + 波 B の合成波（Type 4）

**リクエスト**

```json
{
  "type": 4,
  "waveA": {
    "vertices": [{"x":1,"y":2},{"x":3,"y":0}],
    "speed": 1, "direction": 1, "label": "A"
  },
  "waveB": {
    "vertices": [{"x":7,"y":2},{"x":9,"y":0}],
    "speed": 1, "direction": -1, "label": "B"
  },
  "params": { "answerT": 5 },
  "inline": true
}
```

**期待結果**
- `gridConfig.yMax = 5`（合成最大 ≈ 4、`ceil(4)+1 = 5`）
- `gridConfig.yMin = -5`
- 生成画像 `out_2-2.png` の y 軸ラベルが `5` / `-5`

**結果**: ✅ PASS — gridConfig.yMax=5, yMin=-5

---

### 2-3. grid に yMin / yMax を明示 — 自動調整されない

**リクエスト**（振幅 2 の波 A だが、yMax=10 を明示指定）

```json
{
  "type": 1,
  "waveA": {
    "vertices": [{"x":2,"y":2},{"x":4,"y":0}],
    "speed": 1, "direction": 1, "label": "A"
  },
  "grid": { "yMin": -10, "yMax": 10 },
  "params": { "answerT": 2 },
  "inline": true
}
```

> **注**: `grid` に `xMin`/`xMax` を省略した部分指定が可能（修正済み）。

**期待結果**
- `gridConfig.yMax = 10`（自動調整は **実行されない**）
- 生成画像 `out_2-3.png` の y 軸ラベルが `10`

**結果**: ✅ PASS — gridConfig.yMax=10（自動調整スキップ）

---

### 2-4. grid に yMax のみ明示 — 部分指定でも自動調整をスキップ

**リクエスト**（yMax だけ指定、yMin は未指定）

```json
{
  "type": 1,
  "waveA": {
    "vertices": [{"x":2,"y":2},{"x":4,"y":0}],
    "speed": 1, "direction": 1, "label": "A"
  },
  "grid": { "yMax": 8 },
  "params": { "answerT": 2 },
  "inline": true
}
```

**期待結果**
- レスポンス `success: true`（バリデーション通過）
- `gridConfig.yMax = 8`（自動調整は **スキップ**）
- 生成画像 `out_2-4.png` の y 軸ラベルが `8`

**結果**: ✅ PASS — gridConfig.yMax=8（部分指定でも自動調整スキップ）

---

### 2-5. 反射波モード（Type 6） — 頂点最大値 × 2 が上限

**リクエスト**

```json
{
  "type": 6,
  "waveA": {
    "vertices": [{"x":1,"y":2},{"x":3,"y":0}],
    "speed": 1, "direction": 1, "label": "A"
  },
  "params": { "boundary": 5, "endType": "free", "answerT": 3 },
  "inline": true
}
```

**期待結果**
- `gridConfig.yMax = 5`（頂点最大 2 × 2 = 4 → `ceil(4)+1 = 5`）
- `gridConfig.yMin = -5`
- 生成画像 `out_2-5.png` の y 軸ラベルが `5` / `-5`

**結果**: ✅ PASS — gridConfig.yMax=5, yMin=-5

---

### 2-6. 波形なし — 自動調整されない（デフォルト yMax=2 のまま）

**リクエスト**（vertices 空）

```json
{
  "type": 1,
  "waveA": {
    "vertices": [],
    "speed": 1, "direction": 1, "label": "A"
  },
  "params": { "answerT": 0 },
  "inline": true
}
```

**期待結果**
- レスポンス `success: true` または適切なエラー（頂点なし）
- 自動調整は実行されない（成功した場合 `gridConfig.yMax = 2` のまま）

**結果**: ✅ PASS — gridConfig.yMax=2（デフォルト維持、自動調整なし）

---

## チェックリスト まとめ

> **記入ルール**: このチェックリストはテスト専用エージェントが実施後に更新する。
> Claude Code による予備実行結果は参考情報に過ぎず、最終 PASS / FAIL の根拠としない。

| # | 項目 | 期待値 | 結果 |
|---|------|--------|------|
| 0-1 | ブラウザ: Type 1 退行確認 | 正常生成 | ✅ PASS |
| 0-2 | ブラウザ: Type 4 退行確認 | 正常生成 | ✅ PASS |
| 0-3 | ユニットテスト全通過 | 125+ ケース PASS | ✅ PASS (125) |
| 1-1 | ブラウザ: 波A のみ、自動拡張 | yMax=3、トースト表示 | ✅ PASS |
| 1-2 | ブラウザ: 波A+B 合成、自動拡張 | yMax=5、トースト表示 | ✅ PASS |
| 1-3 | ブラウザ: 反射波モード | yMax=5、トースト表示 | ✅ PASS |
| 1-4 | ブラウザ: 手動で軸を狭めて生成 | 正常生成（yMax=2） | ✅ PASS |
| 1-5 | ブラウザ: 波形なしで遷移 | 変化なし、通知なし | ✅ PASS |
| 1-6 | ブラウザ: タブ往復で再計算 | yMax=3 に再設定 | ✅ PASS |
| 2-1 | API: grid 未指定・単独波 | gridConfig.yMax=3 かつ画像ラベル ±3 | ✅ PASS |
| 2-2 | API: grid 未指定・合成波 | gridConfig.yMax=5 かつ画像ラベル ±5 | ✅ PASS |
| 2-3 | API: yMin/yMax 明示 | gridConfig.yMax=10 かつ画像ラベル ±10 | ✅ PASS |
| 2-4 | API: yMax のみ明示 | gridConfig.yMax=8 かつ画像ラベル 8 | ✅ PASS |
| 2-5 | API: Type6 反射波 | gridConfig.yMax=5 かつ画像ラベル ±5 | ✅ PASS |
| 2-6 | API: 波形なし | エラーまたは yMax=2 | ✅ PASS |

---

## 実装済み修正（テスト前に適用済み）

以下の修正は Claude Code（実装担当）が既に完了している。テスト専用エージェントはこれらを前提として動作検証を行うこと。

| 修正ファイル | 内容 |
|-------------|------|
| `api/validate.js` | `GridSpec` の `xMin`/`xMax`/`yMin`/`yMax` をすべて `optional()` に変更。部分指定（`yMax` のみ等）がバリデーションエラーになっていたバグを修正 |
| `api/serialize.js` | `buildResponse()` に `gridConfig` パラメータを追加し、レスポンス JSON に `gridConfig` フィールドを返すよう拡張（テスト検証・デバッグ用） |
| `api/bridge.js` | `buildResponse()` 呼び出し時に `gridConfig: state.gridConfig` を渡すよう修正 |
| `tests/auto_yrange_api_test.js` | Section 2 の自動テストスクリプトを新規作成。PNG 出力先を `tests/output/` に変更 |

### 修正前のバグの詳細

**[修正済み] API: GridSpec が部分指定を許容しない**
- `grid: {yMin: -10, yMax: 10}` や `grid: {yMax: 8}` など yMin/yMax のみ指定すると `xMin`/`xMax` が Required としてバリデーションエラーになっていた
- `translate.js` の `autoAdjustYRange()` は部分指定を想定した実装（`spec.grid.yMin !== undefined || spec.grid.yMax !== undefined`）だったが、バリデーション段階でエラーになるため到達不可能だった

---

## テスト実施記録

| 実施日 | 実施者 | 結果 | 備考 |
|--------|--------|------|------|
| 2025-07-14 | テスト専用エージェント | ✅ 15/15 PASS（0-1〜1-6 ブラウザ + 2-1〜2-6 API）| ユニットテスト 125 PASS を含む全テスト通過 |
