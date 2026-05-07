# 波の重ね合わせ 設問作成ソフト

物理教員向けの波形設問（PNG / PDF / DOCX / ZIP 一括）自動生成ツールです。  
ブラウザ上で波形を手描きし、問題・解答・解説をワンクリックで出力できます。

## ブラウザで今すぐ使う（インストール不要）

**[▶ ツールを開く](https://phys-ken.github.io/nami_gousei_software/)**

インストール・サーバー起動不要。ブラウザだけで動作します。

---

## 主な機能

| 機能 | 説明 |
|------|------|
| 波形エディタ | グリッドをクリック／ドラッグして波形の頂点を設定（折れ線・正弦波の両モード対応） |
| 設問タイプ 1〜7 | y-x グラフ・数値解答・y-t グラフ・合成波・反射波など |
| 選択肢モード | Type 3/4/6 で誤答を登録し、選択問題に変換 |
| スタイル切替 | `gray`（スクリーン用）/ `bw`（白黒印刷用）/ カスタム |
| 出力形式 | 問題 PDF・解答 PDF・**DOCX（問題＋解答＋解説、Word で編集可）**・**ZIP 一括（PDF + DOCX + 全画像 + テキスト）** |

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

---

## ローカルで起動する場合

Python 3 が入っていれば Node.js 不要で起動できます。

```bash
python server.py
# → http://localhost:8000 が自動的にブラウザで開く
# 終了: Ctrl+C
```

---

## REST API（AI エージェント連携）

Node.js 18 以上が必要です。AI エージェントからプログラム的に問題を量産できます。

```bash
npm install
node api_server.js
```

- `http://localhost:8000` — ブラウザ UI
- `http://localhost:8001/api/health` — API 起動確認
- `http://localhost:8001/api/generate` — 問題生成エンドポイント（POST）

詳細なエンドポイント仕様・リクエスト例・トラブルシューティングは **[API.md](API.md)** を参照してください。

---

## テスト

```bash
# 波形ロジック・レンダラ・乱数（105 ケース）
npm test

# API バックエンド堅牢性テスト（74 ケース）
node --test tests/api.test.js
```

---

## ファイル構成

```
index.html              ブラウザ UI のエントリポイント
js/                     描画・物理・UI ロジック（ブラウザ専用）
  ├ wave.js / renderer.js / editor.js / problems.js
  ├ exporter.js         PNG / PDF / DOCX / ZIP 一括ダウンロード
  ├ random.js / styles.js / app.js
css/                    スタイルシート
api/                    REST API バックエンド（Node.js）
  ├ bridge.js           sync(generate) / async(generateFull) ブリッジ
  ├ serialize.js        PNG / DOCX / TXT / Bundle ZIP の書き出し
  ├ docx-writer.js      Node.js 用 DOCX バッファ生成
  ├ validate.js         Zod スキーマ
  └ ...
api_server.js           Express サーバー（静的:8000 + API:8001）
tests/                  Node.js ユニット・統合テスト
server.py               Python 簡易静的サーバー
API.md                  REST API 詳細仕様書
CLAUDE.md               Claude Code 向け開発ガイド
```

---

## ライセンス

MIT
