/**
 * STYLE_PRESETS - 描画スタイルプリセット定義
 *
 * gray   : ブラウザ閲覧最適（薄グレーグリッド・現状デフォルト）
 * bw     : 白黒印刷最適（グリッドも黒系、波線のコントラスト強め）
 * custom : ユーザーが各パラメータを個別設定
 *
 * 各要素のフィールド:
 *   color       : CSS 色文字列
 *   lineWidth   : 線幅（論理ピクセル）
 *   dashed      : true=破線, false=実線
 *   dashPattern : [実部, 空部, ...] — dashed=true のときのみ参照
 */
const STYLE_PRESETS = {
  gray: {
    grid:       { color: '#cccccc', lineWidth: 0.5, dashed: false, dashPattern: [4, 4] },
    waveA:      { color: '#000000', lineWidth: 1.5, dashed: true,  dashPattern: [10, 5] },
    waveB:      { color: '#000000', lineWidth: 1.5, dashed: true,  dashPattern: [4, 4] },
    waveSum:    { color: '#000000', lineWidth: 3,   dashed: false, dashPattern: [] },
    waveSingle: { color: '#000000', lineWidth: 2.5, dashed: false, dashPattern: [] },
  },
  bw: {
    grid:       { color: '#999999', lineWidth: 0.8, dashed: true,  dashPattern: [2, 3] },
    waveA:      { color: '#000000', lineWidth: 2,   dashed: true,  dashPattern: [14, 4] },
    waveB:      { color: '#000000', lineWidth: 2,   dashed: true,  dashPattern: [4, 4] },
    waveSum:    { color: '#000000', lineWidth: 3,   dashed: false, dashPattern: [] },
    waveSingle: { color: '#000000', lineWidth: 2.5, dashed: false, dashPattern: [] },
  },
};

/** プリセットをディープコピーして返す（直接変更防止） */
function cloneStylePreset(preset) {
  return JSON.parse(JSON.stringify(preset));
}
