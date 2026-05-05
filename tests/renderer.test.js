'use strict';
// 実行: node --test tests/renderer.test.js
//
// WaveRenderer の純粋ロジック（computeCanvasSize 等）をテストする。
// drawXxx 系は Canvas API に依存するため対象外。
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');
const { join } = require('path');
const vm = require('node:vm');

// renderer.js は document に依存するメソッドを含むが、
// クラス定義 + 静的メソッドの評価はブラウザAPI非依存で可能。
// constructor は Canvas を要求するため使用しない。
vm.runInThisContext(readFileSync(join(__dirname, '..', 'js', 'renderer.js'), 'utf8'));

// ── 定数の存在確認 ─────────────────────────────────────────────────────
describe('WaveRenderer 定数', () => {
  it('DEFAULT_DISP_W = 580', () => {
    assert.equal(WaveRenderer.DEFAULT_DISP_W, 580);
  });
  it('DEFAULT_DISP_H = 200', () => {
    assert.equal(WaveRenderer.DEFAULT_DISP_H, 200);
  });
  it('DEFAULT_PADDING の値', () => {
    assert.deepEqual(WaveRenderer.DEFAULT_PADDING, {
      left: 52, right: 52, top: 32, bottom: 44,
    });
  });
  it('CELL_PX_MIN / CELL_PX_MAX の範囲', () => {
    assert.equal(WaveRenderer.CELL_PX_MIN, 15);
    assert.equal(WaveRenderer.CELL_PX_MAX, 120);
  });
});

// ── computeCanvasSize ──────────────────────────────────────────────────
describe('WaveRenderer.computeCanvasSize', () => {
  const grid = { xMin: 0, xMax: 10, yMin: -2, yMax: 2 };

  it('cellSize 未指定 → デフォルト 580×200', () => {
    const s = WaveRenderer.computeCanvasSize(grid);
    assert.deepEqual(s, { width: 580, height: 200 });
  });

  it('cellSize = {} → デフォルト 580×200', () => {
    const s = WaveRenderer.computeCanvasSize(grid, {});
    assert.deepEqual(s, { width: 580, height: 200 });
  });

  it('cellSize = { w: null, h: null } → デフォルト', () => {
    const s = WaveRenderer.computeCanvasSize(grid, { w: null, h: null });
    assert.deepEqual(s, { width: 580, height: 200 });
  });

  it('cellSize.w = 0 → デフォルト幅にフォールバック（w のみ）', () => {
    const s = WaveRenderer.computeCanvasSize(grid, { w: 0, h: null });
    assert.equal(s.width, 580);
  });

  it('cellSize.w = 30 → 10*30 + 52+52 = 404', () => {
    const s = WaveRenderer.computeCanvasSize(grid, { w: 30, h: null });
    assert.equal(s.width, 404);
    assert.equal(s.height, 200);  // h は自動のまま
  });

  it('cellSize.h = 50 → 4*50 + 32+44 = 276', () => {
    const s = WaveRenderer.computeCanvasSize(grid, { w: null, h: 50 });
    assert.equal(s.width, 580);   // w は自動のまま
    assert.equal(s.height, 276);
  });

  it('cellSize.w = 30, h = 50 → 両方反映', () => {
    const s = WaveRenderer.computeCanvasSize(grid, { w: 30, h: 50 });
    assert.equal(s.width,  10 * 30 + 104);  // 404
    assert.equal(s.height, 4  * 50 + 76);   // 276
  });

  it('xMax-xMin = 20 のグリッドで cellW=30 → 20*30 + 104 = 704', () => {
    const big = { xMin: 0, xMax: 20, yMin: -2, yMax: 2 };
    const s = WaveRenderer.computeCanvasSize(big, { w: 30, h: null });
    assert.equal(s.width, 704);
  });

  it('yMin が負の場合の高さ計算（範囲は yMax-yMin）', () => {
    const g = { xMin: 0, xMax: 10, yMin: -3, yMax: 3 };
    const s = WaveRenderer.computeCanvasSize(g, { w: null, h: 25 });
    assert.equal(s.height, 6 * 25 + 76);  // 226
  });

  it('カスタムパディングを反映する', () => {
    const s = WaveRenderer.computeCanvasSize(
      grid,
      { w: 30, h: 50 },
      { left: 10, right: 10, top: 10, bottom: 10 }
    );
    assert.equal(s.width,  10 * 30 + 20);  // 320
    assert.equal(s.height, 4  * 50 + 20);  // 220
  });

  it('小数を含む cellSize は丸める', () => {
    const s = WaveRenderer.computeCanvasSize(grid, { w: 30.4, h: null });
    // 10 * 30.4 + 104 = 408 → Math.round で 408
    assert.equal(s.width, 408);
  });

  it('cellSize.w 指定でも h を指定しなければ h はデフォルト 200', () => {
    const s = WaveRenderer.computeCanvasSize(grid, { w: 60 });
    assert.equal(s.width, 10 * 60 + 104);  // 704
    assert.equal(s.height, 200);
  });
});
