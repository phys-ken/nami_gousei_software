# 波の重ね合わせ 設問作成ソフト

物理教員向けの波形設問（PNG / PDF / ZIP）自動生成ツールです。  
ブラウザ上で波形を手描きし、問題・解答画像を即座に出力できます。  
さらにローカル REST API を起動すると、AI エージェントからプログラム的に問題を量産できます。

---

## 使い方（ブラウザ UI）

Node.js 不要。Python 3 が入っていれば即座に起動できます。

```powershell
python server.py
```

ブラウザが自動的に `http://localhost:8000` を開きます。  
Ctrl+C で停止。

### 主な機能

| 機能 | 説明 |
|------|------|
| 波形エディタ | グリッドをクリック／ドラッグして波形の頂点を設定 |
| 設問タイプ 1〜7 | y-x グラフ・数値解答・y-t グラフ・合成波・反射波など |
| 選択肢モード | Type3/4/6 で誤答を登録し、4択等の選択問題に変換 |
| スタイル切替 | `gray`（スクリーン用）/ `bw`（白黒印刷用） |
| 出力形式 | PNG 個別ダウンロード・PDF・ZIP 一括 |

---

## REST API（AI エージェント連携）

### 必要環境

- Node.js 18 以上

### セットアップ（初回のみ）

Google Drive 同期フォルダ内では `npm install` が失敗するため、Drive 外にインストールします。

```powershell
cd C:\Users\croma\.node_caches\wave-problem-api
npm install
```

### 起動

```powershell
node api_server.js
```

- `http://localhost:8000` — ブラウザ UI（既存と同じ）
- `http://localhost:8001/api/health` — API 起動確認
- `http://localhost:8001/api/generate` — 問題生成エンドポイント（POST）

詳細なエンドポイント仕様・リクエスト例・トラブルシューティングは **`API.md`** を参照してください。

---

## テスト

```powershell
# 波形ロジック・レンダラ・乱数（68 ケース）
node --test tests/wave.test.js tests/renderer.test.js tests/random.test.js

# API バックエンド（57 ケース）
node --test tests/api.test.js
```

---

## ファイル構成

```
index.html              ブラウザ UI のエントリポイント
js/                     描画・物理・UI ロジック（ブラウザ専用）
  wave.js               Wave クラス（波形の物理計算）
  renderer.js           WaveRenderer（Canvas 描画）
  problems.js           ProblemGenerator（設問・解答 Canvas 生成）
  random.js             SeededRandom（決定論的シャッフル）
  styles.js             STYLE_PRESETS（gray / bw）
  editor.js             WaveEditor（マウス操作）
  exporter.js           Exporter（PDF・ZIP 出力）
  app.js                App（UI コントローラ）
css/                    スタイルシート
api/                    REST API バックエンド（Node.js）
  bridge.js             サンドボックス + 生成パイプライン
  validate.js           リクエストバリデーション（Zod）
  translate.js          API spec → ProblemGenerator 変換
  serialize.js          Canvas → PNG 保存・レスポンス構築
  sandbox-stubs.js      node-canvas ブリッジ
  loader.js             vm モジュールで js/ をロード
  schema.json           /api/schema 用自己記述ドキュメント
  examples/             サンプルリクエスト JSON（type1〜type7）
api_server.js           Express サーバー（静的:8000 + API:8001）
tests/                  Node.js ユニット・統合テスト
server.py               Python 簡易静的サーバー（Node 不要な場合）
API.md                  REST API 詳細仕様書
```

---

## 設問タイプ一覧

| Type | 内容 | 必要な波 | 選択肢対応 |
|------|------|----------|-----------|
| 1 | 指定時刻の y-x グラフ | 波A | ✗ |
| 2 | 指定 (x, t) での変位（数値） | 波A | ✗ |
| 3 | 指定地点の y-t グラフ | 波A | ✓ |
| 4 | 重ね合わせ・指定時刻 | 波A + 波B | ✓ |
| 5 | 重ね合わせ・時刻範囲（複数枚） | 波A + 波B | ✗ |
| 6 | 反射波・指定時刻 | 波A | ✓ |
| 7 | 反射波・時刻範囲（複数枚） | 波A | ✗ |
