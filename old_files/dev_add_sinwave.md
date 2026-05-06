# dev_add_sinwave.md — 正弦波モード追加 開発計画書

> **対象エージェント**: 開発専用 LLM（コード編集・ブラウザ確認・Node.js 実行が可能）  
> **作成日**: 2026-05-06（初版） / 2026-05-06（改訂版・claude-opus-4-7）  
> **依頼主**: Kenya  
> **重要な前提**: この計画書は実装担当エージェントへの作業指示書。テスト最終判定はテスト専用エージェントが行う。

---

## 0. 大目標

波A・波Bを「頂点ベース（折れ線）」に加えて**正弦波**で定義できるモードを追加する。  
合成波・反射波・選択肢生成など既存の機能はすべて正弦波でも動作させる。  
実装は **ブラウザ UI → API** の順で進め、各フェーズでブラウザ動作を確認してから次へ進む。

### 機能要件（Kenya からの依頼内容）

1. 波 A・波 B それぞれを正弦波モードに切り替えられる（独立に）
2. 振幅 (amplitude) は整数指定
3. 波長 (wavelength) は整数指定
4. 平行移動 (phaseShift) は1マス単位
5. **2つのサブモード**:
   - **連続波 (continuous)**: グリッド全域に存在する真の正弦波
   - **先頭あり進行波 (progressive)**: サンプルコードのように先端を持ち、先端より先には到達していない波
6. **先頭ありモードのみ**:
   - 位相の上下反転 (invertPhase)
   - 始点 (x0): 先端の初期位置
   - 速さ (speed): 既存の `wave.speed` を利用
7. 合成波・反射波は既存ロジックを継承
8. 選択肢の distractor は元の波が正弦波なら正弦波で作図

---

## 1. Git ブランチ戦略 ＋ ロールバック方針

### ブランチ構成

```
main
└── feature/sinwave        ← 作業ブランチ（このブランチで全作業を行う）
```

### 運用ルール

| 操作 | タイミング | コマンド |
|------|-----------|---------|
| ブランチ作成 | 最初の作業開始前 | `git checkout -b feature/sinwave` |
| 各 Phase 完了時 | 機能単位で必ず | `git add <ファイル> && git commit -m "<msg>"` |
| リモート push | Phase 完了ごと | `git push origin feature/sinwave` |
| **main へのマージ** | **Kenya からの明示指示後のみ** | （禁止） |

### ロールバック方針（困ったときに巻き戻せる仕組み）

- **コミットは「論理的に最小単位」で**: 1 Phase = 1 コミットを基本にし、複雑な Phase は内部で 2〜3 コミットに分けてもよい
- **動かなくなったら直前のコミットへ戻る**:
  ```powershell
  git stash                  # 作業中の変更を退避
  git log --oneline -10      # 最新コミット履歴を確認
  git checkout <hash>        # 動いていたコミットに戻して動作確認
  ```
- **やり直しが必要なら revert**:
  ```powershell
  git revert <hash>          # 特定コミットを取り消す新しいコミット
  ```
- **`git reset --hard` は使わない**（push 済み履歴を破壊する可能性があるため）
- **ブラウザテストで NG が出たら即コミットせず**、原因を特定してから commit する

### マージ前の運用

> **Kenya が手動テストを完了し「マージしてよい」と明示するまで、`git merge` / `git push origin main` は絶対に行わない。**

Phase 8 完了時、開発エージェントは Kenya に以下を伝える:

```
全フェーズ完了しました。
TEST_SINWAVE.md の全項目をテスト専用エージェントに実施してもらってください。
そのうえで Kenya 自身がブラウザで最終確認を行い、問題なければ
「feature/sinwave を main にマージしてよい」と指示してください。
```

---

## 2. 作業開始前の必須読み込み

開発エージェントは作業開始前に以下を読むこと（すべて重要な背景）:

| ファイル | 目的 |
|----------|------|
| `CLAUDE.md` | プロジェクト全体の規約・アーキテクチャ |
| `js/wave.js` | `Wave` クラスの公開 API |
| `js/renderer.js` | `WaveRenderer.drawWave / renderFull` の使い方 |
| `js/problems.js` | `_renderSuperposition` / `_buildReflectedWave` の実装 |
| `js/app.js` | `App._computeMaxDisplacement` / `_buildChoicesSeedSource` |
| `js/editor.js` | `WaveEditor.render` の頂点マーカー描画 |
| `api/translate.js` | `buildWave` / `autoAdjustYRange` |
| `api/validate.js` | Zod スキーマ構造 |
| `sample_codes/generate_waves.py` | 正弦波の数式リファレンス |
| `TEST_AUTO_YRANGE.md` | 過去のテスト指示書のフォーマット参考 |

---

## 3. 技術設計

### 3-1. 正弦波の数式（速さ・向きを含む完全版）

#### 連続波 (continuous)

| 向き | 式 |
|------|----|
| 右向き (direction=1) | `y = A * sin(2π * (x - speed·t - phaseShift) / λ)` |
| 左向き (direction=-1) | `y = A * sin(2π * (x + speed·t - phaseShift) / λ)` |

- `phaseShift` の符号規約: **正の値 → 波形が x 軸正方向（右）へ平行移動**
- 連続波には先頭がないためグリッド全域に値を持つ
- `speed = 0` を許容（静止波 / distractor 用途）

#### 先頭あり進行波 (progressive)

```
右向き (direction=1):
  先端位置:  x_front = x0 + speed * t
  定義域:    x ≤ x_front
  y(x, t) = (x ≤ x_front) ? amplitude * flipSign * sin(2π * (x_front - x) / λ) : 0

左向き (direction=-1):
  先端位置:  x_front = x0 - speed * t
  定義域:    x ≥ x_front
  y(x, t) = (x ≥ x_front) ? amplitude * flipSign * sin(2π * (x - x_front) / λ) : 0
```

- `x0` は **t=0 における先端の x 座標**（整数）
- `flipSign = invertPhase ? -1 : +1`
- 先端に立てば必ず `sin(0) = 0` になることを確認 ✓
- 連続波と異なり `phaseShift` は使わない（先端位置 `x0` がそれを兼ねる）

> **数式検算（Phase 1 のテスト用）**:  
> 連続波: `A=1, λ=4, speed=1, direction=1, phaseShift=0` で `y(x=0, t=1) = sin(2π*(0-1)/4) = sin(-π/2) = -1`  
> 先頭あり: `A=1, λ=4, speed=1, direction=1, x0=0` で `y(x=0, t=1) = sin(2π*(1-0)/4) = sin(π/2) = +1`（先端 x_front=1 が右にあり、x=0 は領域内）

### 3-2. SineWave クラスの公開 API

`js/wave.js` の末尾に `SineWave` クラスを追加。`Wave` と**互換のある公開 API** を持つ:

```javascript
// Wave と同じ「波としての」API
sineWave.getYAtTime(x, t)            // → number
sineWave.getSnapshot(xMin, xMax, t)  // → [{x, y}, ...] 高密度サンプル
sineWave.toJSON()                    // → { kind: 'sine', sineConfig, speed, direction, label }
SineWave.fromJSON(obj)               // → SineWave インスタンス
sineWave.clear()                     // → no-op or amplitude=0（仕様は要決定 → §5）

// 既存の Wave インスタンスで参照されているプロパティ（互換維持のため必須）
sineWave.speed                       // number
sineWave.direction                   // 1 | -1
sineWave.label                       // string
```

**注意**: `vertices` プロパティは **持たない**。代わりに「波としての中身があるか」「描画キー位置はどこか」を問う**新 API**（次節）を呼び出し側が使う。

#### sineConfig の構造

```javascript
{
  amplitude:   2,            // 整数 ≥ 1
  wavelength:  8,            // 整数 ≥ 2
  phaseShift:  0,            // 整数（連続波のみ意味を持つ）
  waveType:   'continuous',  // 'continuous' | 'progressive'
  // --- progressive のみ意味を持つ ---
  invertPhase: false,
  x0:          -4,           // 整数。連続波では未使用
}
```

### 3-3. 「波の中身」を抽象化する新 API（最重要）

現状、リポジトリ全体で `wave.vertices.length === 0` や `wave.vertices.forEach(v => xSet.add(v.x + shift))` などの**直接アクセス**が **30 箇所以上** ある（grep で確認済み）:

```
js/renderer.js:393          wave.vertices.length === 0
js/editor.js:144,147        wave.vertices.length, vertices.forEach(v => drawVertex)
js/problems.js:95,136,138,160,162,170,171,244,269,270,289,508-516,560,565,576-583,629
js/app.js:198,385,392,402,815,821,824,1001,1032,1039
api/translate.js:148,155,158
```

**これらすべてを SineWave でも動作させるため、以下の API を `Wave` と `SineWave` の両方に追加する**:

```javascript
// 共通 API（Wave/SineWave の両方が実装する）
wave.isEmpty()             // → boolean。「波として中身がないか」
                           //   Wave: vertices.length === 0
                           //   SineWave: false（常に値を持つ）or amplitude === 0
                           
wave.getKeyXs(t)           // → number[]。getSnapshot() に追加すべき「補強サンプル位置」
                           //   Wave: vertices.map(v => v.x + direction*speed*t)
                           //   SineWave: [] （高密度サンプリングで十分なため）
                           
wave.getMaxAmplitude()     // → number。最大変位の絶対値
                           //   Wave: max(|v.y|)
                           //   SineWave: amplitude

wave.reflect(boundary, endType)  // → 同型インスタンス（鏡像波）
                           //   Wave: 既存 _buildReflectedWave 相当
                           //   SineWave: 鏡像 SineWave を生成（§3-5 参照）
```

**置き換え対象の grep 結果は実装時に再 grep して網羅すること**。「万一あれば」ではなく「**確実に存在する**」ので、Phase 1.5 でまとめて refactor する。

### 3-4. SineWave.getSnapshot の点数

- **連続波**: `xMin` 〜 `xMax` の範囲を `step = 0.05` で線形サンプル → `(xMax - xMin) * 20 + 1` 点。1グリッドあたり 20 点で滑らかな曲線が描ける
- **先頭あり**: 連続波と同じステップでサンプリングし、先端の外側はスナップショットから除外（範囲を `[xMin, min(xMax, x_front)]` または `[max(xMin, x_front), xMax]` に絞る）
- **境界点を必ず含む**: 先端位置 `x_front` を最後の点として明示的に追加（`y=0` で正確に閉じるため）

### 3-5. 反射 SineWave の生成（重要）

`ProblemGenerator._buildReflectedWave()` は現在、`Wave` の頂点を `(2·boundary − v.x, ±v.y)` で写す方式。SineWave では新しい SineWave インスタンスを生成する必要がある。

**連続波の反射**:
- 入射: 右向き、`y = A * sin(2π*(x - speed·t - phaseShift)/λ)`
- 反射: 左向き、固定端なら符号反転
- 鏡像 SineWave の構築:
  ```javascript
  reflected = new SineWave({
    sineConfig: {
      ...sineConfig,
      phaseShift: 2*boundary - sineConfig.phaseShift,  // 鏡像の位相
      invertPhase: (endType === 'fixed') ? !invertPhase : invertPhase,
    },
    speed:     this.speed,
    direction: -this.direction,
  });
  ```
  > 連続波の場合 `invertPhase` フィールドは普段意味を持たないが、反射処理では符号管理のために使う設計にする。

**先頭あり進行波の反射**:
- 入射の先端が `t_hit = (boundary - x0) / speed` の時刻に境界に到達
- それ以前 (`t < t_hit`): 反射波は存在しない（空）
- それ以後: 鏡像進行波が境界から逆向きに伝播
  ```javascript
  reflected = new SineWave({
    sineConfig: {
      waveType: 'progressive',
      amplitude: amplitudeA,
      wavelength: wavelengthA,
      x0:         2*boundary - x0_A,    // 境界で反射した位置
      invertPhase: (endType === 'fixed') ? !invertPhase_A : invertPhase_A,
    },
    speed:     this.speed,
    direction: -this.direction,
  });
  ```

> **実装時の注意**: 反射処理の数式は数値検算してから採用する。Phase 1 の SineWave テストに反射ケースを 2〜3 件含めること。  
> **判断が難しいケース**: 反射ロジックの細部で迷ったら Kenya に質問する（§7 参照）。

### 3-6. App の状態変更

```javascript
// 既存
App.waveA, App.waveB        // Wave インスタンス（既存）

// 追加
App.waveAMode = 'vertex'    // 'vertex' | 'sine'  （既定 'vertex'）
App.waveBMode = 'vertex'
App.waveASine = null        // SineWave インスタンス（モード切替時に生成）
App.waveBSine = null

// アクセサヘルパー（必須）
App._activeWaveA()          // → waveAMode==='sine' ? waveASine : waveA
App._activeWaveB()          // → waveBMode==='sine' ? waveBSine : waveB
```

**localStorage キー**:
- `waveapp_waveAMode` (string)
- `waveapp_waveBMode` (string)
- `waveapp_waveASineConfig` (JSON)
- `waveapp_waveBSineConfig` (JSON)

**重要**: `App._activeWaveA()` を新設し、既存コードの `this.waveA` を順次これに置き換える。**全置換ではなく必要箇所だけ**置き換える（エディタ操作は元の `this.waveA` を直接触る必要がある）。

### 3-7. API スキーマ変更（要 Zod refine）

```javascript
const SineConfig = z.object({
  amplitude:   z.number().int().min(1),
  wavelength:  z.number().int().min(2),
  phaseShift:  z.number().int().default(0),
  waveType:    z.enum(['continuous', 'progressive']).default('continuous'),
  invertPhase: z.boolean().default(false),
  x0:          z.number().int().optional(),
}).refine(
  (s) => s.waveType !== 'progressive' || s.x0 !== undefined,
  { message: 'x0 is required when waveType is progressive' }
);

const WaveSpec = z.object({
  vertices:   z.array(Vertex).optional(),
  sineMode:   z.boolean().default(false),
  sineConfig: SineConfig.optional(),
  speed:      z.number().nonnegative().default(1),
  direction:  z.union([z.literal(1), z.literal(-1)]).default(1),
  label:      z.string().optional(),
}).refine(
  (w) => (w.sineMode && w.sineConfig) || (!w.sineMode && w.vertices),
  { message: 'must provide either vertices (vertex mode) or sineConfig (sine mode)' }
);
```

### 3-8. 後方互換性（localStorage / API リクエスト）

- 既存ユーザの `localStorage.waveapp_choicesConfig` には vertex ベースの distractor が保存されている
- 新コードは `obj.kind === 'sine' ? new SineWave().fromJSON(...) : new Wave().fromJSON(...)` で振り分け
- **既存データを壊さない**: 旧データには `kind` フィールドがないため `kind === 'sine'` 以外はすべて Wave として扱う
- API リクエストも `sineMode` 未指定時は従来挙動（vertex）

---

## 4. 開発フェーズ（ブラウザ優先・スモールステップ）

> **各 Phase 末で必ず**:
> 1. ブラウザテスト（指定された 1〜3 項目）を実施し OK を確認
> 2. `node --test tests/...` を実行し既存テスト退行がないこと確認
> 3. `git commit && git push origin feature/sinwave`
> 4. NG が出たらコミットせず原因解析、解決後にコミット

### Phase 0: ブランチ作成 ＋ 計画書共有

**作業**:
```powershell
git checkout main
git pull
git checkout -b feature/sinwave
git add dev_add_sinwave.md
git commit -m "docs: add development plan for sine wave mode"
git push -u origin feature/sinwave
```

**Phase 0 ブラウザテスト**: 既存機能の動作確認（折れ線で Type 1, 4, 6 を1回ずつ生成）

✔ **コミット**: `docs: add development plan for sine wave mode`

---

### Phase 1: SineWave クラス実装 ＋ ユニットテスト

**作業ファイル**: `js/wave.js`, `tests/wave.test.js`

**実装**:
1. `SineWave` クラスを `js/wave.js` の末尾に追加
2. 公開 API: `getYAtTime / getSnapshot / toJSON / fromJSON / clear / speed / direction / label`
3. **新共通 API も Wave/SineWave 両方に同時実装**: `isEmpty / getKeyXs / getMaxAmplitude / reflect`
   - Wave 側の追加メソッドは既存ロジックの薄いラッパー
4. `toJSON()` の出力に `kind: 'vertex' | 'sine'` を含める（後方互換用ディスパッチに使う）

**ユニットテスト** (`tests/wave.test.js`):

| カテゴリ | テストケース | 期待値 |
|---------|-------------|--------|
| Wave 退行 | 既存テスト全件 | 全 PASS |
| Wave 新 API | `isEmpty()` 空時 true / 頂点 1 個で false | ok |
| Wave 新 API | `getMaxAmplitude()` = max(\|v.y\|) | ok |
| Wave 新 API | `reflect(5, 'fixed')` で頂点が 2*5-x へ写り y 反転 | ok |
| SineWave 数式 | `connect`, `A=1,λ=4,speed=1,dir=1,phase=0` で `y(0,1) = -1` | 誤差 1e-9 以内 |
| SineWave 数式 | 連続波 `phaseShift=2` で右に 2 ずれる | ok |
| SineWave 数式 | 連続波 `direction=-1` で左進行 | ok |
| SineWave 先端 | `x_front` で `y = 0`、外側で `y = 0` | 厳密に 0 |
| SineWave 反転 | `invertPhase=true` で値が反転 | ok |
| SineWave snapshot | 連続波 `(xMax-xMin)*20+1` 点以上を返す | ok |
| SineWave 反射 | 連続波の反射: 鏡像 SineWave が `direction=-1` | ok |
| SineWave 反射 | 進行波の反射: t < t_hit で `getYAtTime = 0` | ok |
| toJSON 往復 | SineWave の `fromJSON(toJSON())` が同値 | ok |
| 後方互換 | `Wave().fromJSON({vertices:[...]})` は `kind` がなくても動く | ok |

```powershell
node --test tests/wave.test.js
```

**Phase 1 ブラウザテスト**: なし（ロジック層のみ）

✔ **コミット**: `feat: add SineWave class with shared abstract Wave API`

---

### Phase 1.5: 既存コードの抽象化リファクタ（最重要・要慎重）

> **このフェーズが計画の山場**。既存の `wave.vertices.length` / `wave.vertices.forEach` を `wave.isEmpty()` / `wave.getKeyXs(t)` に置き換える。

**作業ファイル**: `js/renderer.js`, `js/editor.js`, `js/problems.js`, `js/app.js`, `api/translate.js`

**方針**:
1. `grep -n "\.vertices" js/ api/` で全箇所を再列挙（テストファイル除く）
2. 各箇所を以下の規則で置換:

| 旧 | 新 |
|----|----|
| `wave.vertices.length === 0` | `wave.isEmpty()` |
| `wave.vertices.length > 0` | `!wave.isEmpty()` |
| `wave.vertices.forEach(v => xSet.add(v.x + shift))` | `wave.getKeyXs(t).forEach(x => xSet.add(x))` |
| `Math.max(...wave.vertices.map(v => Math.abs(v.y)))` | `wave.getMaxAmplitude()` |
| `_buildReflectedWave(wave, b, e)` の中身 | `wave.reflect(b, e)` を呼ぶラッパーに変更 |

3. `WaveEditor.render()` の `vertices.forEach(v => drawVertex)` は **Wave 専用処理**として残す（SineWave の場合は別経路で render するため、§Phase 2 で対応）
4. `_loadChoicesConfig()` の `new Wave().fromJSON(json)` は **kind ディスパッチ**に置き換え:
   ```javascript
   const ctor = (json.kind === 'sine') ? SineWave : Wave;
   const wave = new ctor().fromJSON(json);
   ```

**Phase 1.5 ブラウザテスト**（退行確認・全部スキップしないこと）:
- [ ] 折れ線モード Type 1 生成（波A 三角波）
- [ ] 折れ線モード Type 4 生成（波A + 波B）
- [ ] 折れ線モード Type 6 生成（反射波・自由端 / 固定端）
- [ ] 選択肢モード Type 4（波形がある distractor で）
- [ ] エディタ操作（クリック・ドラッグ・右クリック削除）
- [ ] localStorage に保存された選択肢が正しく復元される（リロード後）

**Phase 1.5 ユニットテスト**:
```powershell
node --test tests/wave.test.js tests/renderer.test.js tests/random.test.js tests/api.test.js
```
→ **125 件全 PASS** が必須（リファクタで何も壊れていない証拠）

✔ **コミット**: `refactor: introduce abstract wave API (isEmpty/getKeyXs/getMaxAmplitude/reflect)`

> **NG が出たら Phase 1.5 を中断して Kenya に報告**。リファクタ範囲が広すぎる場合は Phase を細分化する判断を仰ぐ。

---

### Phase 2: ブラウザ UI — モード切り替えパネル

**作業ファイル**: `index.html`, `css/style.css`, `js/app.js`

**実装**:
1. `index.html` の波 A セクション（`<aside class="settings-panel">` 内 `id="waveASection"` 相当）にモード切り替えトグル追加:
   ```html
   <div class="setting-row">
     <label>入力方式</label>
     <div class="dir-group">
       <button id="waveAModeVertex" class="dir-btn active" onclick="App.setWaveMode('A','vertex')">折れ線</button>
       <button id="waveAModeSine"   class="dir-btn"        onclick="App.setWaveMode('A','sine')">正弦波</button>
     </div>
   </div>
   ```
2. 正弦波モード時のみ表示する `<div id="waveASineParams">` を追加:
   - 振幅 / 波長 / 平行移動 (phaseShift) の整数 input
   - サブモード radio: 連続波 / 先頭あり進行波
   - 先頭ありのみ表示: 始点 (x0) input ＋ 上下反転 checkbox
   - **入力ラベルに符号規約を明記**: 「平行移動 (右が正)」「始点 x0 (整数)」
3. 波 B セクションも同様の UI（`waveB...` を反復）
4. `App.setWaveMode(name, mode)` ハンドラ:
   - 旧エディタ Canvas を hide / 新パラメータ UI を show
   - localStorage に永続化
5. `App._loadSineConfigs()` で起動時復元（initで呼ぶ）
6. **エディタ Canvas は hide のままにせず**、サイン波モードでも `id="editorCanvasA"` を再利用してプレビュー描画する（Phase 3 で実装）

**Phase 2 ブラウザテスト**:
- [ ] 波 A の「折れ線/正弦波」ボタンが表示され、切替で UI が交代する
- [ ] 正弦波モードで振幅・波長・phaseShift の入力欄が出る
- [ ] 連続波 ↔ 先頭あり 切り替えで `x0` / 上下反転の表示が切り替わる
- [ ] ページリロードで設定が復元される
- [ ] 折れ線モードに戻したとき、元の頂点が保持される
- [ ] 波 B 側も同様に動作する
- [ ] 折れ線モードで設問を1件生成（Type 1）して既存機能が壊れていないことを確認

✔ **コミット**: `feat: add sine wave mode toggle UI and parameter inputs`

---

### Phase 3: プレビュー描画（編集タブ ＋ 進行波プレビュータブ）

**作業ファイル**: `js/app.js`, `js/editor.js`

**実装**:
1. `App._setupEditorA()` を拡張:
   - 正弦波モード時は `WaveEditor` を生成せず、Canvas に WaveRenderer で `getSnapshot(xMin, xMax, 0)` を直接描画する read-only プレビューに切り替える
   - `App._renderSineWavePreview('A')` のような専用メソッドを新設
2. パラメータ入力欄に `change` イベントを bind し、変更で再描画
3. 「進行波プレビュー」タブの `App.renderPreview()` は既存ロジックで動作するはず（`_activeWaveA()` を使うように1行修正）
4. `WaveEditor.render()` は折れ線モード時のみ動く（Phase 1.5 で対応済みのはず）

**Phase 3 ブラウザテスト**:
- [ ] 正弦波モード（連続波）で振幅・波長を変えると編集タブのプレビューが追従する
- [ ] phaseShift 入力で波形が左右にずれる
- [ ] 連続波・右向きと左向きで正しく表示（phaseShift=0 のとき t=0 で同形）
- [ ] 先頭あり進行波で t=0 のとき先端より先には波がない
- [ ] 上下反転チェックで波形が反転する
- [ ] 進行波プレビュータブで t=0,1,2,... と進行する様子が見える
- [ ] 速さを 0.5 に変えると進行が遅くなる
- [ ] 折れ線モードに戻して既存エディタが動作する（退行確認）

✔ **コミット**: `feat: render sine wave preview in editor and preview tabs`

---

### Phase 4: 設問生成（Type 1〜7）

**作業ファイル**: `js/app.js`, `js/problems.js`

**実装**:
1. `App.generateProblem()` の各 Type 分岐で `this.waveA.vertices.length` を使っている箇所を `this._activeWaveA().isEmpty()` に変更
2. ProblemGenerator に渡す `waveA` / `waveB` を `_activeWaveA()` / `_activeWaveB()` から取得
3. `_computeMaxDisplacement` の反射ケース `Math.max(...waveA.vertices.map(...))` を `wave.getMaxAmplitude() * 2` に変更（Phase 1.5 で済んでいなければここで）
4. 反射波の `_buildReflectedWave()` は SineWave なら `wave.reflect()` を呼ぶラッパーに変更（Phase 1.5 で済んでいるはず）
5. **混在モード**を確認: 波 A=正弦波, 波 B=折れ線（およびその逆）も Type 4/5 で動くこと

**Phase 4 ブラウザテスト**:
- [ ] **Type 1**: 正弦波 A（連続）→ y-x グラフが滑らかに描画される
- [ ] **Type 1**: 正弦波 A（先頭あり）→ 先端のカットが正しい
- [ ] **Type 2**: 正弦波 A → 数値解答が正しい
- [ ] **Type 3**: 正弦波 A → y-t グラフが滑らかな正弦曲線（fixed x で時間変化）
- [ ] **Type 4**: 正弦波 A + 正弦波 B → 合成波が滑らかに描画
- [ ] **Type 4 (混在)**: 正弦波 A + 折れ線 B → 合成波が描画される
- [ ] **Type 5**: 正弦波 A + 正弦波 B、t=1〜5 の連続フレーム
- [ ] **Type 6**: 正弦波 A（連続）+ 反射（自由端 / 固定端）→ 鏡像合成波
- [ ] **Type 6**: 正弦波 A（先頭あり）+ 反射 → t < t_hit で反射波が見えない
- [ ] **Type 7**: 正弦波 A + 反射、複数時刻
- [ ] y 軸自動調整: 振幅 3 の正弦波で yMax が 4 以上になる
- [ ] 折れ線モードで全タイプを1回ずつ生成（退行確認）

✔ **コミット**: `feat: integrate sine waves into problem generation (Types 1-7)`

---

### Phase 5: 選択肢モード（Type 3 / 4 / 6）の正弦波対応

**作業ファイル**: `js/app.js`, `js/problems.js`, `index.html`, `css/style.css`

**設計上の判断ポイント**: 
- **問題波形が正弦波のとき、distractor も正弦波で入力させる**（Kenya の依頼）
- distractor の入力 UI は **正弦波パラメータ欄**（振幅・波長・phaseShift・waveType・invertPhase・x0）
- distractor の WaveEditor インスタンス化はスキップし、SineWave を直接構築

**実装**:
1. `App._renderChoicesList(type)` で問題波形のモードを判定:
   - 折れ線モードなら従来どおり WaveEditor で distractor を編集
   - 正弦波モードなら SineWave のパラメータ欄を distractor 数だけ生成
2. 各 distractor の SineWave インスタンスを `cfg.distractors[i]` に格納（`new SineWave().fromJSON(...)`）
3. `_buildChoices` / `renderType3DistractorCanvas` / `renderType4DistractorCanvas` / `renderType6DistractorCanvas` は SineWave インスタンスでも動くこと（Phase 1.5 で抽象化済み）
4. **Type 3 distractor の特殊性**: distractor は (t, y) 空間で描画される。SineWave を Type 3 distractor に使う場合、SineWave のパラメータは (t, y) 空間における周期波として扱う（時間が増えると y が振動する曲線）。  
   → **判断が必要なら Kenya に質問**: 「Type 3 distractor を正弦波で入れる場合、何を入力させるべきか？（例: 「振幅と周期 T のみ、x0=0 固定」）」
5. シャッフル決定論性: `_buildChoicesSeedSource(type)` は `JSON.stringify(this._activeWaveA().toJSON())` を使うため自動的に sineConfig を含むので変更不要

**Phase 5 ブラウザテスト**:
- [ ] 折れ線モード × 選択肢 ON で従来どおり動く（退行確認）
- [ ] 正弦波モード × Type 4 × 選択肢 ON で distractor 入力欄が現れる
- [ ] distractor のパラメータを変えると選択肢プレビューが更新される
- [ ] 選択肢 PDF をエクスポートして全選択肢が描画される
- [ ] ZIP エクスポートで `choice_*.png` が生成される
- [ ] 同じ条件で2回生成→シャッフル順が同じ（決定論性）
- [ ] Type 3 と Type 6 でも同様

✔ **コミット**: `feat: sine wave distractor support for choices mode`

---

### Phase 6: API 対応（validate / translate）

> **前提**: Phase 5 までブラウザ動作が完全に確定していること。  
> Phase 5 で行った UI 仕様が API スキーマの根拠になる。

**作業ファイル**: `api/validate.js`, `api/translate.js`, `api/schema.json`, `tests/api.test.js`

**実装**:
1. `api/validate.js`: `SineConfig` と `WaveSpec.sineMode` を §3-7 のとおり追加
2. `api/translate.js`:
   - `buildWave(json, sandbox)` を kind ディスパッチに変更:
     ```javascript
     function buildWave(json, sandbox) {
       if (!json) return null;
       if (json.sineMode) return new sandbox.SineWave().fromJSON(json);
       return new sandbox.Wave().fromJSON(json);
     }
     ```
   - `autoAdjustYRange()` の `vertices.length === 0` / `vertices.map(v => Math.abs(v.y))` を新 API に置き換え
3. `api/loader.js`: `'wave.js'` の `expose` に `'SineWave'` を追加
4. `api/schema.json`: `wave` セクションに `sineMode` / `sineConfig` の説明を追加。`types[3,4,6].distractor-shape` に正弦波対応を追記
5. **API ユニットテスト追加** (`tests/api.test.js`):

| テストケース | 確認 |
|-------------|------|
| Type 1 + waveA sineMode=true（連続波） | success:true、画像生成 |
| Type 1 + waveA sineMode=true（先頭あり） | success:true |
| Type 4 + waveA/B 両方 sineMode | success:true、合成波生成 |
| Type 4 + waveA sine、waveB vertex | success:true（混在動作） |
| Type 6 + waveA sineMode + 反射 | success:true |
| sineMode=true なのに sineConfig なし | バリデーションエラー |
| sineConfig.waveType='progressive' で x0 なし | バリデーションエラー |
| amplitude=0 / wavelength=0 などの無効値 | バリデーションエラー |
| gridConfig.yMax 自動調整 | sineMode 振幅 3 で yMax ≥ 4 |
| Type 4 選択肢 + sineMode distractor | success:true、選択肢に正弦波 |

```powershell
node --test tests/api.test.js
```

✔ **コミット**: `feat: API support for sine wave mode (validate + translate + tests)`

---

### Phase 7: API 例示ファイル ＋ スモークテスト

**作業ファイル**: `api/examples/`, `api/smoke.js`

1. `api/examples/type1_sine.json` — 連続波 A の Type 1
2. `api/examples/type1_sine_progressive.json` — 先頭あり A の Type 1
3. `api/examples/type4_sine.json` — 正弦波 A + 正弦波 B の Type 4
4. `api/examples/type6_sine.json` — 正弦波 A + 反射の Type 6
5. `api/smoke.js` に正弦波ケースを 1〜2 件追加
6. `tests/sinwave_api_test.js` を新設（`tests/auto_yrange_api_test.js` の構造を踏襲）。サーバー起動中に走らせる E2E スクリプト

**Phase 7 動作確認**:
```powershell
# 別ターミナルで
node api_server.js

# テスト実行
node api/smoke.js
node tests/sinwave_api_test.js
```

✔ **コミット**: `docs: add sine wave API examples and smoke tests`

---

### Phase 8: テスト指示書 `TEST_SINWAVE.md` の作成

**作業ファイル**: `TEST_SINWAVE.md`

`TEST_AUTO_YRANGE.md` の構造を踏襲し、以下のセクションを含める:

```
0. 退行確認（全ユニットテスト・既存ブラウザ機能）
1. ブラウザ: モード切り替え UI（Phase 2 のテスト項目）
2. ブラウザ: プレビュー描画（Phase 3）
3. ブラウザ: 設問生成 Type 1〜7（Phase 4）
4. ブラウザ: 選択肢モード（Phase 5）
5. API: ユニットテスト（Phase 6）
6. API: 自動テストスクリプト + 例示ファイル（Phase 7）
チェックリスト まとめ（全項目を ⬜ 未実施 で）
実装済み修正の一覧
```

**重要**: 冒頭に以下を明記:

> **このチェックリストを埋めてよいのはテスト専用エージェントのみです。**  
> 開発担当エージェントが事前確認したとしても、それは予備確認。  
> 最終 PASS / FAIL の判定はテスト専用エージェントが実施し、Kenya がその結果をもって手動確認に進む。

✔ **コミット**: `docs: add TEST_SINWAVE.md for test-dedicated agent`

---

### Phase 9: 完了報告 ＋ Kenya への引き継ぎ

開発エージェントは Kenya に以下を報告:

```
正弦波モード機能の全 Phase（0〜8）を完了し feature/sinwave に push しました。

次のステップ:
1. テスト専用エージェントに TEST_SINWAVE.md の実施を依頼
2. テストエージェントから結果が返ってきたら確認
3. Kenya 自身がブラウザで最終確認
4. 問題なければ Kenya が「main にマージしてよい」と指示
5. 開発エージェントが指示を受けて feature/sinwave を main にマージ

主な変更点:
- 新規: SineWave クラス（連続波・先頭あり進行波）
- 新規: 抽象 Wave API（isEmpty / getKeyXs / getMaxAmplitude / reflect）
- 拡張: ブラウザ UI に「折れ線/正弦波」モードトグル追加
- 拡張: API スキーマに sineMode / sineConfig を追加
- 計 N コミット、合計 ±M 行
```

> **マージ実行は Kenya からの指示があるまで待機**。

---

## 5. 仕様の判断保留事項（実装中に Kenya に問い合わせるかもしれない項目）

| 項目 | 検討の必要性 |
|------|--------------|
| `SineWave.clear()` の意味 | 折れ線の clear() は頂点削除だが、正弦波には削除する内部状態がない。何もしない / amplitude=0 にする / モードを vertex に戻す のどれにするか |
| Type 3 distractor を正弦波で書くときの (t, y) 空間扱い | 振幅と周期 T を入力させる別 UI が必要か、SineWave をそのまま流用するか |
| `phaseShift` の許容範囲 | -λ < phaseShift ≤ λ に正規化するか、無制限に許容するか |
| 連続波で波の振幅を `localStorage` でゼロ復元できないようにするか | UI バリデーションで amplitude ≥ 1 を強制 |

これらは実装中に必要になったタイミングで Kenya に質問する。**先回りして判断しない**。

---

## 6. 既存機能への影響を最小化する原則

| 原則 | 補足 |
|------|------|
| `Wave` クラスの既存 API を変更しない | `setVertex / removeVertex / getY / getYAtTime / getSnapshot / clear / toJSON / fromJSON / vertices / speed / direction / label` は触らない |
| 抽象 API（`isEmpty / getKeyXs / getMaxAmplitude / reflect`）は **追加** のみ | 既存呼び出し側を順次置換するが、Wave 側の旧プロパティ（`vertices`）は残す |
| `WaveEditor` は折れ線モード専用 | 正弦波モードでは別経路（パラメータ入力 UI + 静的プレビュー）で代替 |
| `localStorage` キーは新規追加のみ | 既存キーの構造を変えない（後方互換維持） |
| API リクエストの既存フォーマットは受け付ける | `sineMode` 未指定 → vertex モードとして動作 |

---

## 7. 計画からの逸脱時のフロー

開発エージェントが以下のような状況に陥ったら、**作業を一時停止して Kenya に質問する**。場当たり的な回避策（ハック）は行わない。

### 質問が必要な状況の例

1. **アーキテクチャ上の想定外問題**: 例えば `_buildReflectedWave` をリファクタしたら他に副作用がある場合
2. **数式・物理的な解釈の不確実性**: 例えば反射時の符号規約が文献によって異なる場合
3. **UX 設計の判断**: 例えば distractor 入力欄のレイアウト
4. **テストでの判定ミス**: 既存テストが落ちて、それが正当な仕様変更によるものか退行か判別不能
5. **Phase 1.5 のリファクタ範囲が広すぎて1コミットに収まらない**

### 質問のフォーマット

```
[判断が必要] <状況の簡潔な説明>

文脈:
- <この判断が必要になった経緯>

選択肢:
A. <方法A> — メリット: ... デメリット: ...
B. <方法B> — メリット: ... デメリット: ...
（C. <方法C> — ...）

推奨: <A/B/C のどれか>（理由: ...）

どの方針で進めますか？
```

### 計画からの「許容される逸脱」

逐一質問しなくてよい程度の小さな判断（変数名・コメントの言い回し・既存スタイルとの整合）は開発エージェントの裁量で OK。判断基準: **「main にマージされる完成形」を Kenya が見たときに「あれ？」と思わない範囲**。

---

## 8. チェックリスト（開発エージェント用の進捗管理）

| Phase | 内容 | ステータス |
|-------|------|-----------|
| 0 | ブランチ作成 + 計画書 push | ⬜ |
| 1 | SineWave クラス + 抽象 API + ユニットテスト | ⬜ |
| 1.5 | 既存コードの抽象化リファクタ | ⬜ |
| 2 | ブラウザ UI（モード切り替えパネル） | ⬜ |
| 3 | プレビュー描画（編集 + 進行波プレビュー） | ⬜ |
| 4 | 設問生成 Type 1〜7 | ⬜ |
| 5 | 選択肢モード正弦波対応 | ⬜ |
| 6 | API 対応（validate + translate + tests） | ⬜ |
| 7 | API 例示ファイル・スモークテスト | ⬜ |
| 8 | TEST_SINWAVE.md 作成 | ⬜ |
| 9 | Kenya への完了報告 | ⬜ |
| — | テスト専用エージェントによる検証 | ⬜（テストエージェント担当） |
| — | Kenya 手動テスト・マージ承認 | ⬜（Kenya のみ） |

---

## 9. 参考情報

### 9-1. 現行のファイル構成（主要・grep 確認済み）

```
js/
  wave.js        ← Wave クラス。SineWave を末尾追加。新抽象 API を Wave にも追加
  renderer.js    ← drawWave / renderFull。L393 に vertices 直接アクセスあり
  problems.js    ← ProblemGenerator。約 15 箇所で vertices に直接アクセス
  app.js         ← App。約 10 箇所で vertices 直接アクセス
  editor.js      ← WaveEditor（折れ線専用）。L144,147 で頂点マーカー描画
  styles.js      ← STYLE_PRESETS（変更なし）
  random.js      ← SeededRandom（変更なし）
  exporter.js    ← Exporter（変更なし、duck-typing で動作する想定）
api/
  validate.js    ← Zod スキーマ拡張
  translate.js   ← buildWave 拡張、autoAdjustYRange 改修
  bridge.js      ← 変更なし
  serialize.js   ← 変更なし
  loader.js      ← SineWave を expose に追加
  sandbox-stubs.js ← 変更なし（Math.sin は標準で利用可）
  schema.json    ← sineMode / sineConfig を追記
tests/
  wave.test.js   ← SineWave のテスト追加
  api.test.js    ← 正弦波 API テスト追加
  sinwave_api_test.js  ← 新規（Phase 7）
```

### 9-2. サンプルコードの数式（参考）

`sample_codes/generate_waves.py` より:

```python
# 右向き A波（先頭あり、先端 x = t-1 で sin=0）
yA = AMP * sin(2π * (t - 1 - x) / λ)  # x ≤ t-1

# 左向き B波（先頭あり、先端 x = 1-t で sin=0）
yB = AMP * sin(2π * (x + t - 1) / λ)  # x ≥ 1-t

# 逆位相: yB = -yB
```

JavaScript への変換（一般化版）:

```javascript
// 右向き（direction=1）、先端 x_front = x0 + speed*t
function progressiveRight(x, t, A, lam, x0, speed, flipSign) {
  const xFront = x0 + speed * t;
  if (x > xFront) return 0;
  return A * flipSign * Math.sin(2 * Math.PI * (xFront - x) / lam);
}
```

### 9-3. 開発環境の起動

```powershell
# ブラウザ UI のみ
python server.py
# → http://localhost:8000 が開く

# REST API も含める場合
node api_server.js
# → :8000（静的）+ :8001（API）

# ポート 8000 が使用中の場合
$env:WAVE_STATIC_PORT=8888; node api_server.js
```

### 9-4. ブラウザ動作確認のコツ

- 修正後は **Ctrl+F5**（強制リロード）で確実にキャッシュを破棄する
- DevTools の Console に `app.js` のエラーがないか毎回確認
- `localStorage.clear()` でクリーンな初期状態テストもできる
- Google Drive 同期エラーで JS ファイルが古いままになる場合がある（CLAUDE.md 参照）

### 9-5. テスト実行コマンド一覧

```powershell
# Wave / SineWave のロジックテスト
node --test tests/wave.test.js

# レンダラ・乱数のテスト
node --test tests/renderer.test.js tests/random.test.js

# API バックエンドテスト
node --test tests/api.test.js

# 全テスト
node --test tests/wave.test.js tests/renderer.test.js tests/random.test.js tests/api.test.js

# API スモークテスト（サーバー起動中に実行）
node api/smoke.js
node tests/sinwave_api_test.js   # Phase 7 で追加
```

---

## 10. 改訂履歴

| 版 | 日付 | 改訂者 | 主な変更 |
|----|------|--------|---------|
| 初版 | 2026-05-06 | claude-sonnet-4-6 | 全体設計・8 フェーズ案 |
| 改訂版 | 2026-05-06 | claude-opus-4-7 | リポジトリ全体 grep に基づき、`vertices` 直接アクセス箇所を網羅。Phase 1.5（抽象化リファクタ）を新設。反射 SineWave の数式を明記。後方互換性・ロールバック方針・必須読み込みファイル・判断保留事項などを追加。 |
