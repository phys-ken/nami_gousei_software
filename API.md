# 波の重ね合わせ問題生成 — REST API

AI エージェントから波の重ね合わせ問題を自動生成するためのローカル専用 REST API。1 リクエストにつき PNG 画像群・問題解答解説 DOCX・テキストファイル・全部入り Bundle ZIP を一括出力する。

既存のブラウザ UI（`http://localhost:8000`）はそのまま動作し続ける。同じ Node プロセスが両方を提供する。

---

## アーキテクチャ概要

```
┌──── Node プロセス（api_server.js）─────────────────┐
│                                                     │
│  Express :8000  ──→ 既存の静的サイト（index.html、 │
│                      js/、css/ をそのまま配信）     │
│                                                     │
│  Express :8001  ──→ REST API                       │
│         ├ /api/health                              │
│         ├ /api/schema                              │
│         ├ /api/generate                            │
│         └ /api/output/:session/:file               │
│           （.png / .pdf / .docx / .txt / .zip / .json）│
│                                                     │
│  バックエンドは vm モジュールで                    │
│  既存 js/wave.js etc. を読み込み、                 │
│  document.createElement('canvas') を node-canvas に │
│  橋渡しして同じ描画コードを Node 上で実行。        │
│                                                     │
│  生成パイプライン:                                  │
│   js/ で Canvas 群を生成 →                         │
│   serialize.js が PNG 保存・docx-writer.js が DOCX │
│   生成・JSZip で Bundle ZIP をパッキング           │
└──────────────────────────────────────────────────────┘
```

`js/*.js` には一切手を入れていない。ブラウザでもサーバーでも同じ描画ロジックが動く。DOCX・Bundle ZIP の生成は API 専用で、`api/docx-writer.js` および `api/serialize.js` 内で完結する。

---

## セットアップ（初回のみ）

```powershell
# 1. Node.js 18+ をインストール
node --version    # v18 以降であること

# 2. 依存関係をインストール（プロジェクトルートで実行）
cd /path/to/nami_gousei_software
npm install

# canvas パッケージのビルドが失敗する場合：
#   - 通常は npm がプリビルドバイナリを取得（Node 18/20/22/24 LTS の x64）
#   - 失敗時は Visual Studio Build Tools 2022（C++ workload）を入れて再試行
```

---

## 起動

```powershell
cd /path/to/nami_gousei_software
node api_server.js
```

起動メッセージ:

```
[static] http://localhost:8000/
[api]    http://localhost:8001/api/health
[api]    POST  http://localhost:8001/api/generate
[api]    GET   http://localhost:8001/api/schema
```

`Ctrl+C` で両方停止。

> **既存の `python server.py` も従来どおり使える**。Node を入れたくない時用。

### 環境変数

| 変数 | 既定 | 用途 |
|------|------|------|
| `WAVE_STATIC_PORT` | 8000 | 静的サイトのポート |
| `WAVE_API_PORT` | 8001 | API のポート |
| `WAVE_API_NODE_MODULES` | `./node_modules` | 依存関係の置き場所（Google Drive 同期外に置く場合に上書き） |

---

## API リファレンス

### `GET /api/health`

```bash
curl http://localhost:8001/api/health
```

```json
{
  "status": "ok",
  "version": "1.0.0",
  "sandboxReady": true,
  "projectRoot": "...",
  "defaultOutputDir": "..."
}
```

### `GET /api/schema`

全問題タイプとパラメータの自己記述ドキュメント（JSON）。AI に渡せばリクエストの作り方を理解できる。

### `POST /api/generate`

**リクエスト本文の最小例（Type 1）:**

```json
{
  "type": 1,
  "waveA": {
    "vertices": [{"x":0,"y":0},{"x":2,"y":1},{"x":4,"y":0}],
    "speed": 1, "direction": 1
  },
  "params": { "answerT": 3 }
}
```

**主要フィールド:**

| フィールド | 型 | 説明 |
|------------|----|----|
| `type` | int 1-7 | 問題タイプ（後述） |
| `grid` | object | 既定 `{xMin:0, xMax:10, yMin:-2, yMax:2}` |
| `cellSize` | `{w, h}` | 1目盛のピクセル指定。`null` で自動 |
| `style` | `"gray"` \| `"bw"` \| object | 描画プリセット。既定 `"gray"` |
| `waveA` | object | `vertices, speed, direction` |
| `waveB` | object\|null | Type 4, 5 で必須 |
| `params` | object | タイプ別パラメータ |
| `choices` | object | Type 3, 4, 6 で選択肢問題化（後述） |
| `outputDir` | string | 任意の出力先絶対パス |
| `filenamePrefix` | string | 出力ファイルの接頭辞。既定 `"q001"` |
| `inline` | bool | `true` で base64 dataURL 返却（ファイル保存しない） |

**タイプ別の必須 `params`:**

| Type | 内容 | params | waveB |
|------|------|--------|-------|
| 1 | 単一波・指定時刻の y-x | `answerT` | ✗ |
| 2 | 指定地点・指定時刻の変位（数値） | `x`, `t` | ✗ |
| 3 | 指定地点の y-t グラフ | `x`, `tMax` | ✗ |
| 4 | 重ね合わせ・指定時刻 | `answerT` | ✓ |
| 5 | 重ね合わせ・時刻範囲 | `tStart`, `tEnd` | ✓ |
| 6 | 反射波・指定時刻 | `answerT`, `boundary`, `endType` | ✗ |
| 7 | 反射波・時刻範囲 | `tStart`, `tEnd`, `boundary`, `endType` | ✗ |

`endType`: `"fixed"` (固定端) | `"free"` (自由端)

**選択肢（Type 3, 4, 6 のみ）:**

```json
{
  "choices": {
    "enabled": true,
    "count": 4,
    "shuffle": true,
    "distractors": [
      { "vertices": [...], "speed": 0, "direction": 1 },
      { "vertices": [...], "speed": 0, "direction": 1 },
      { "vertices": [...], "speed": 0, "direction": 1 }
    ]
  }
}
```

- 正答は API 側が自動生成
- `distractors.length` は必ず `count - 1`
- `shuffle: true` 時はシード（waveA + パラメータ + count のハッシュ）で決定論的にシャッフル。同じ入力 → 同じ並び順

**レスポンス:**

```json
{
  "success": true,
  "type": 4,
  "sessionId": "20260506_130000_a1b2c3",
  "outputDir": "g:/.../api_output/20260506_130000_a1b2c3/",
  "questionText": "...",
  "answerText": "...",
  "answerValue": null,
  "files": {
    "question": [{"path": "...q001_question_1.png"}, ...],
    "answer":   [{"path": "...q001_answer_1.png"}, ...],
    "ref":      [{"path": "...q001_ref_1.png"}, ...],
    "choices": [
      {"path": "...q001_choice_1_correct.png", "isCorrect": true,  "label": "①", "originalIndex": 0},
      {"path": "...q001_choice_2.png",         "isCorrect": false, "label": "②", "originalIndex": 2}
    ],
    "questionTxt":   "...q001_question.txt",
    "answerTxt":     "...q001_answer.txt",
    "commentaryTxt": "...q001_commentary.txt",
    "docx":          "...q001_problem.docx",
    "bundle":        "...q001_bundle.zip",
    "manifest":      "...manifest.json"
  },
  "shuffleSeed": 1234567,
  "warnings": []
}
```

- `files.docx` — 問題・選択肢・解答・解説を含む Word 文書（テキストはネイティブ段落、画像は埋め込み PNG として配置）
- `files.bundle` — 全 PNG ＋ DOCX ＋ TXT ファイルをまとめた ZIP
- `files.questionTxt` / `answerTxt` / `commentaryTxt` — 問題文・解答情報・解説のプレーンテキスト（UTF-8）
- `originalIndex: 0` が常に正答（シャッフル前順）。`label` は表示順の丸数字（①②③…）。
- `inline: true` 時は `path` の代わりに `dataUrl` フィールドが入り、`docx`・`bundle`・`questionTxt`・`answerTxt`・`commentaryTxt`・`manifest` は `undefined`（ディスク書き出しを行わない）。

**エラー時:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { "...": "..." }
  }
}
```

エラーコード: `VALIDATION_ERROR` (400) / `GENERATE_ERROR` (500) / `NOT_FOUND` (404)

---

## 出力ファイル構成

```
api_output/
  20260506_130000_a1b2c3/
    manifest.json                ← リクエスト + レスポンス（再現用）
    q001_question_1.png
    q001_question_2.png  ...
    q001_answer_1.png  ...
    q001_choice_1_correct.png
    q001_choice_2.png  ...
    q001_ref_1.png  ...           （Type3 / 6 のみ：解説用スナップショット）
    q001_question.txt             問題文プレーンテキスト
    q001_answer.txt               解答情報（選択肢問題なら "正答: 選択肢 ①" 形式）
    q001_commentary.txt           解説（refSectionTitle / refSectionNote が存在する Type3/6 のみ）
    q001_problem.docx             問題＋選択肢＋解答＋解説の Word 文書
    q001_bundle.zip               上記すべてを内部ファイル名のままパッキングした全部入り ZIP
```

`manifest.json` には実行したリクエストとレスポンスが丸ごと保存される。同じ JSON を再投入すれば同じ画像が再生される。

**Bundle ZIP の中身**（ファイル名は `q001_` プレフィックスなしのクリーン名）:

```
question_1.png, question_2.png, ...
answer_1.png, ...           （Type3/6 では先頭1枚のみ。残りは ref_*.png 側に配置されている）
ref_1.png, ...              （Type3/6）
choice_1.png, choice_2_correct.png, ...   （選択肢ありのとき）
question.txt / answer.txt / commentary.txt
wave_problem.docx
```

---

## サンプルクライアント

### curl

```bash
curl -X POST http://localhost:8001/api/generate \
  -H "Content-Type: application/json" \
  -d @api/examples/type4_with_choices.json
```

### Python (requests)

```python
import json, requests
spec = json.load(open("api/examples/type4_with_choices.json"))
r = requests.post("http://localhost:8001/api/generate", json=spec)
r.raise_for_status()
data = r.json()
assert data["success"]
print("質問:", data["questionText"])
for c in data["files"]["choices"]:
    print(c["label"], "正答" if c["isCorrect"] else "誤答", "→", c["path"])
```

### Node.js (fetch)

```js
const spec = require('./api/examples/type1.json');
const r = await fetch('http://localhost:8001/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(spec),
});
const data = await r.json();
console.log(data.files.question.map(f => f.path));
```

### AI エージェント（Claude API）連携の例

```python
# AI に問題状況を考えさせ、API でレンダリングさせる例
import anthropic, json, requests

client = anthropic.Anthropic()
schema = requests.get("http://localhost:8001/api/schema").json()

prompt = f"""次のスキーマで /api/generate に渡す JSON を 1 つ作って。
スキーマ: {json.dumps(schema, ensure_ascii=False)}
波A は速さ 1、右向き、頂点は山が一つの三角波。
Type 1、t = 3 秒の問題にして。"""

resp = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}],
)
spec = json.loads(resp.content[0].text)
result = requests.post("http://localhost:8001/api/generate", json=spec).json()
print("生成された画像:", result["files"]["question"][0]["path"])
```

---

## サンプル JSON（`api/examples/`）

| ファイル | 内容 |
|----------|------|
| `type1.json` | 単一波の最小例 |
| `type1_sine.json` | 連続正弦波での Type1 |
| `type1_sine_progressive.json` | 先頭付き進行正弦波での Type1 |
| `type2.json` | 数値解答の例 |
| `type3_with_choices.json` | y-t グラフ + 4選択肢 |
| `type3_superposition.json` | y-t グラフ（重ね合わせ） |
| `type3_reflection_fixed.json` | y-t グラフ（固定端反射波） |
| `type3_reflection_free.json` | y-t グラフ（自由端反射波） |
| `type4_with_choices.json` | 合成波 + 4選択肢 |
| `type4_sine.json` | 合成波（正弦波 A/B） |
| `type5.json` | 重ね合わせの時間連続 |
| `type6_with_choices.json` | 固定端反射 + 4選択肢 |
| `type6_sine.json` | 反射波（正弦波 A） |
| `type7.json` | 自由端反射の時間連続 |

---

## トラブルシューティング

### canvas のビルドエラー

`npm install` 時 `node-pre-gyp ERR!` 等で失敗する場合：

1. Node のバージョン確認: `node --version` が 18 以上
2. 依存関係を Drive 外（既定の `C:\Users\croma\.node_caches\wave-problem-api\`）に置く
3. それでも失敗するなら Visual Studio Build Tools 2022 (C++ workload) を入れて `npm rebuild canvas`

### Google Drive がファイルをロックする

`api_output/` を Drive 同期から除外することを推奨：
1. Google Drive for desktop → 設定 → Google Drive → 「フォルダ設定」
2. `api_output/` を「同期しない」に追加

### ポートが既に使われている

```powershell
$env:WAVE_API_PORT = 8101
$env:WAVE_STATIC_PORT = 8100
node api_server.js
```

### 既存ブラウザ UI が動かなくなった

`js/` 配下は API 追加・DOCX/ZIP 拡張のいずれでも変更していない。次を確認:
1. `npm test` が 105/105 通過するか（波形ロジック・レンダラ・乱数）
2. `node --test tests/api.test.js` が 74/74 通過するか（API バックエンド）
3. `python server.py` 単独で `http://localhost:8000` を開いて再現するか

---

## 関連ファイル

- バックエンド実装: `api/` 配下
  - `bridge.js` — `generate()`（同期、PNG のみ）と `generateFull()`（非同期、DOCX / TXT / Bundle ZIP も生成）の二系統
  - `serialize.js` — Canvas → PNG 書き出し、レスポンス組み立て、`buildResponse`（sync）/`buildResponseFull`（async）
  - `docx-writer.js` — `docx` npm パッケージで Word 文書 Buffer を生成
  - `validate.js` — Zod スキーマ
- 共通描画ロジック: `js/` 配下（無変更・共有）
