# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開発サーバーの起動

### ブラウザ UI のみ（Python）

```bash
python server.py
# → http://localhost:8000 が自動的にブラウザで開く
# 終了: Ctrl+C
```

静的ファイルのみで動作するため、ビルドステップ・依存インストールは不要。CDN ライブラリ（jsPDF・JSZip）はブラウザ起動時にインターネット経由で読み込まれる。

### ブラウザ UI ＋ REST API（Node.js）

```powershell
# 初回のみ：Drive 外に依存関係をインストール
cd C:\Users\croma\.node_caches\wave-problem-api
npm install

# 起動（静的:8000 + API:8001 の両方）
cd "g:\マイドライブ\...\000_重ね合わせ設問作成ソフト"
node api_server.js
```

詳細は `API.md` を参照。

## ブラウザテスト

`TEST_CHOICES.md` が現行のテスト指示書（波 B 制限 + Type3/4 選択肢モード + 既存退行確認の統合版）。
旧テスト書は `old_files/` に保存。

## ロジックのユニットテスト（Node.js）

```bash
# 波形ロジック・レンダラ・乱数（68 ケース）
node --test tests/wave.test.js tests/renderer.test.js tests/random.test.js

# API バックエンド堅牢性・安全性テスト（57 ケース）
node --test tests/api.test.js

# 全テスト一括
node --test tests/wave.test.js tests/renderer.test.js tests/random.test.js tests/api.test.js

# API スモークテスト（サーバー起動中に実行）
node api/smoke.js
```

- `wave.js`: 34 ケース（setVertex / getY / getYAtTime / getSnapshot / clear / toJSON / fromJSON）
- `renderer.js`: 16 ケース（`computeCanvasSize`）
- `random.js`: 18 ケース（djb2 ハッシュ・mulberry32 PRNG・seededShuffle の決定論性）
- `api.test.js`: 57 ケース（バリデーション・Type1〜7 生成・選択肢・シャッフル決定論性・inline モード・パストラバーサル防御・並行安全性・エッジケース）
- `problems.js`・`editor.js`・`exporter.js`・`app.js` はブラウザ Canvas/DOM に依存するためブラウザでのみ動作確認可能

## アーキテクチャ

### データフロー

```
WaveEditor（格子点クリック）
    ↓ setVertex()
Wave（物理エンジン）
    ↓ getSnapshot(xMin, xMax, t)
WaveRenderer（Canvas描画）
    ↓ canvas.toDataURL()
ProblemGenerator → Exporter（PDF/PNG/ZIP）
App（コントローラ・UI状態）
```

REST API 経由の場合:

```
POST /api/generate (JSON)
    ↓ api/validate.js（Zod スキーマ）
    ↓ api/translate.js（API 仕様 → ProblemGenerator 状態）
    ↓ api/bridge.js（Node.js vm サンドボックスで js/ を実行）
    ↓ api/serialize.js（Canvas → PNG → JSON レスポンス）
GET /api/output/:session/:file
```

### 各モジュールの役割

| ファイル | 役割 |
|----------|------|
| `js/wave.js` | `Wave` クラス。頂点リスト（整数x・0.5刻みy）を管理し、時刻tでの波形を線形補間で計算。`getYAtTime(x, t)` が中心メソッド |
| `js/renderer.js` | `WaveRenderer` クラス。Canvas 2D API でグリッド・軸・波形を描画。`pixelRatio: 2` で2x高解像度出力対応。論理座標↔ピクセルの変換は `toPixel()`/`toWorld()` |
| `js/editor.js` | `WaveEditor` クラス。クリックした x 列を固定し、ドラッグで y 値を調整する UX。`activeX` プロパティで列ロック |
| `js/problems.js` | `ProblemGenerator` クラス。Type1〜7 の設問・解答 Canvas を生成。出力は常に `pixelRatio: 2`（1160×400px → `style.width: 580px` で表示） |
| `js/exporter.js` | `Exporter` 静的クラス。`downloadCanvasPNG`・`generatePDF`（jsPDF）・`generateZIP`（JSZip）・`shuffleChoicesWithSeed`・PDFの選択肢2列タイル描画 |
| `js/styles.js` | `STYLE_PRESETS` オブジェクト。`gray`（デフォルト・薄いグリッド）と `bw`（印刷用・濃いグリッド・破線）の2プリセット。各要素は `{ color, lineWidth, dashed, dashPattern }` |
| `js/random.js` | `SeededRandom` オブジェクト。djb2 文字列ハッシュ・mulberry32 シード可能 PRNG・Fisher-Yates シード再現可能シャッフル |
| `js/app.js` | `App` オブジェクト。UI状態（waveA/waveB/gridConfig/cellSize/choicesConfig/reflectionConfig/currentProblem）を管理。`DOMContentLoaded` で `App.init()` が呼ばれる |

### API モジュール（`api/` ディレクトリ）

REST API バックエンド専用。`api_server.js` から require される。

| ファイル | 役割 |
|----------|------|
| `api/bridge.js` | `Bridge` クラス。Node.js `vm` モジュールで `js/` 全ファイルをサンドボックス実行し、`generate()` で ProblemGenerator を呼び出す |
| `api/validate.js` | Zod スキーマによるリクエストバリデーション。頂点・グリッド・cellSize・選択肢・タイプ別パラメータを検証 |
| `api/translate.js` | API 仕様をブラウザ側の状態形式に変換。`buildState()` → `callGenerator()` → 選択肢/シード付与 |
| `api/serialize.js` | Canvas を PNG Buffer に変換し JSON レスポンスを構築。`newSessionId()` でセッションごとにファイルを分離 |
| `api/sandbox-stubs.js` | Node.js 環境で `document.createElement('canvas')` を node-canvas に差し替えるスタブ |
| `api/loader.js` | `js/` ファイルを読み込んで vm コンテキストで評価し、クラスをサンドボックスにグローバル公開 |
| `api/schema.json` | `/api/schema` エンドポイントが返す自己記述仕様（全タイプ・パラメータ・サンプル） |
| `api/examples/` | `type1.json`〜`type7.json`。curl テストや動作確認用のサンプルリクエスト |

### 設問タイプ

| Type | 内容 | 必要な波 |
|------|------|----------|
| 1 | t=○秒の y-x グラフ | 波A |
| 2 | (t, x) での変位（数値答え） | 波A |
| 3 | x=○での y-t グラフ（解説に y-x スナップショット列付き） | 波A |
| 4 | t=○秒の合成波 | 波A + 波B |
| 5 | t=○〜○秒の合成波（複数枚） | 波A + 波B |
| 6 | t=○秒の反射波（固定端/自由端・境界線あり） | 波A |
| 7 | t=○〜○秒の反射波（複数枚） | 波A |

### 非自明な実装上の注意点

**pixelRatio=2 の設計**
`WaveRenderer` と `ProblemGenerator` は Canvas の物理ピクセルを2倍にして `ctx.scale(2,2)` を適用する。描画コードは論理座標（580×200）で書けばよく、高解像度は透過的に処理される。`style.width/height` を論理サイズに設定して CSS で縮小表示する。

**合成波の精度**
`getSnapshot()` は両波のすべての頂点 x 座標と整数グリッド点を `Set` で収集してから計算する。これにより、ピーク同士が重なる位置でのサンプリング漏れを防ぐ。

**反射波の実装（Type 6 / Type 7）**
`ProblemGenerator._buildReflectedWave()` が入射波を境界位置で折り返した「鏡像波」を生成する。固定端は y を符号反転、自由端はそのまま。反射波は境界より外側の領域のみ描画する（`drawBoundaryLine()` で境界を可視化）。`App.reflectionConfig = { boundary, endType }` を `localStorage` キー `waveapp_reflectionConfig` で永続化。

**カスタムスタイルの保存**
`App._customStyleConfig` は `localStorage` に `waveapp_customStyleConfig` キーで別途保存する。プリセット切り替え時に上書きされないよう意図的に分離している（`waveapp_styleMode`・`waveapp_styleConfig` とは別）。

**PDF 内の日本語テキスト**
jsPDF はフォント埋め込みが複雑なため、`Exporter._textCanvas()` でテキストを Canvas に描画してから PNG として埋め込む方式を採用している。

**Type 3 の解説セクション**
`ProblemGenerator.generateType3()` は `result.refCanvases` に y-x スナップショット列を返す。`App._renderProblemOutput()` がこれを検出して【解説】セクションを追加レンダリングする。他の Type には `refCanvases` がない。

**入力値のパース**
`App._int(id, def)` / `_float(id, def)` は `isNaN()` でチェックし、`0` を有効値として扱う（`|| default` パターンは不使用）。

**vm サンドボックスの制約**
`api/bridge.js` は `js/` ファイルを Node.js `vm` で実行する。ブラウザ API（`window`・`localStorage`・`Image` など）はすべて `api/sandbox-stubs.js` でスタブを提供するか省略される。`js/` に新しいブラウザ API を追加した場合はスタブも更新が必要。

### 描画スタイル（白黒印刷対応）

- 波A（単独）: 実線 2.5px
- 波A（重ね合わせ時）: 破線 `[10,5]` 1.5px
- 波B（重ね合わせ時）: 破線 `[4,4]` 1.5px
- 合成波: 実線 3px
- 凡例: グラフ下余白（`paddingBottom`）に描画（波形との重なり防止）

### グリッド設定

デフォルト: `xMin=0, xMax=10, yMin=-2, yMax=2`。`App.gridConfig` で管理し、「適用」ボタンで `WaveRenderer` を再生成する（DOM操作なし・レンダラ差し替えのみ）。

### 設問タイプの利用条件

- **波 B なし**: Type1/2/3/6/7 が有効（Type4/5 は disabled）
- **波 B あり**: Type4/5 が有効（Type1/2/3/6/7 は disabled）

`App.toggleWaveB()` で disabled を切り替え。現在選択中の Type が利用不可になる場合は自動で利用可能な Type に切り替える。

### 選択肢モード（Type 3 / Type 4 のみ対象）

`App.choicesConfig.{type3, type4} = { enabled, count, source, distractors[] }`。`localStorage` キー `waveapp_choicesConfig` で永続化。

- **OFF が既定**: 何も設定しなければ従来通り記述式（解答画像表示）
- 選択肢数: 2〜10（デフォルト 6）。`distractors[].length === count - 1`（正答は別途自動生成）
- **画面表示は固定順**（① 正答 ② ③ … 不正解）／**PDF・ZIP 出力時のみシャッフル**
- シード = `hashString(問題波形JSON + パラメータ + 選択肢数)` → 同じ条件で再生成すれば同じ順序
- **PDF は2列タイルレイアウト**（`Exporter._renderChoicesGridToPdf`）
- ZIP ファイル名: `choice_1.png` 〜、正答は `_correct` サフィックス
- **Type4 の選択肢は合成波のみ表示**（波A・波B は描画しない）
- distractor は `Wave` インスタンスで管理（伝播しないため `getYAtTime` ではなく `getSnapshot(_, _, 0)` で描画）
- トグルボタン形式（チェックボックスではない）：`confirm()` ダイアログとの整合のため。波形がある状態で OFF 化しようとすると確認
- **将来の自動生成への布石**: `source: 'manual' | 'auto'` フィールドを残してある（現在は `'manual'` のみ）

### 1目盛サイズ（cellSize）— 任意指定オプション

`App.cellSize = { w, h }`（各々 `null`=自動）。`localStorage` キー `waveapp_cellSize` で永続化。

- **未指定時の挙動を保全することが最優先**: cellSize 未設定なら全 Canvas が 580×200（論理px）になる
- 寸法計算は `WaveRenderer.computeCanvasSize(gridConfig, cellSize)` に集約
  - 指定時: `width = (xMax-xMin)*cellW + paddingLeft + paddingRight`
  - 未指定時: `width = WaveRenderer.DEFAULT_DISP_W` (=580)
- バリデーション: `15 ≤ cellPx ≤ 120`（`WaveRenderer.CELL_PX_MIN/MAX`）
- **Type 3 の y-t グラフは特殊扱い**: 横は固定 580px、縦のみ `cellSize.h` を反映する（時間軸の物理意味が y-x グラフと異なるため `cellSize.w` は流用しない）
- 影響箇所: エディタCanvas（`_setupEditorA/B`）／プレビューCanvas（`renderPreview`）／設問Canvas（`ProblemGenerator._makeCanvas`）の3系統が同じ計算式を共有

## Google Drive 同期について

このフォルダは Google Drive で同期されている。同期エラーでファイルが開けない場合がある。編集後は Drive の同期完了を確認してからブラウザリロードすること。
