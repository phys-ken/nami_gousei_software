'use strict';
// 実行: node --test tests/wave.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');
const { join } = require('path');
const vm = require('node:vm');

// wave.js をロード（DOM 非依存のため Node.js でそのまま評価できる）
// strict mode 下では eval がスコープに漏れないため vm.runInThisContext を使用
vm.runInThisContext(readFileSync(join(__dirname, '..', 'js', 'wave.js'), 'utf8'));

// ── ヘルパー ───────────────────────────────────────────────────────────
function makeWave(vertices = [], speed = 1, direction = 1) {
  const w = new Wave();
  w.speed     = speed;
  w.direction = direction;
  vertices.forEach(([x, y]) => w.setVertex(x, y));
  return w;
}

// ── setVertex ──────────────────────────────────────────────────────────
describe('Wave.setVertex', () => {
  it('x を整数に丸める', () => {
    const w = makeWave();
    w.setVertex(3.7, 0);
    assert.equal(w.vertices[0].x, 4);
  });

  it('y を 0.5 刻みに丸める', () => {
    const w = makeWave();
    w.setVertex(1, 1.3);
    assert.equal(w.vertices[0].y, 1.5);
    w.setVertex(2, -0.7);
    assert.equal(w.getVertex(2), -0.5);
  });

  it('同じ x への再セットで y を更新し頂点数が増えない', () => {
    const w = makeWave();
    w.setVertex(3, 1);
    w.setVertex(3, 2);
    assert.equal(w.vertices.length, 1);
    assert.equal(w.getVertex(3), 2);
  });

  it('複数頂点を x 昇順で保持する', () => {
    const w = makeWave([[5, 1], [2, 0.5], [8, -1]]);
    const xs = w.vertices.map(v => v.x);
    assert.deepEqual(xs, [2, 5, 8]);
  });
});

// ── getVertex ──────────────────────────────────────────────────────────
describe('Wave.getVertex', () => {
  it('存在する x は y を返す', () => {
    const w = makeWave([[4, 1.5]]);
    assert.equal(w.getVertex(4), 1.5);
  });

  it('存在しない x は null を返す', () => {
    const w = makeWave([[4, 1.5]]);
    assert.equal(w.getVertex(7), null);
  });
});

// ── removeVertex ───────────────────────────────────────────────────────
describe('Wave.removeVertex', () => {
  it('指定 x の頂点を削除する', () => {
    const w = makeWave([[3, 1], [5, 2]]);
    w.removeVertex(3);
    assert.equal(w.vertices.length, 1);
    assert.equal(w.vertices[0].x, 5);
  });

  it('存在しない x でも例外を出さない', () => {
    const w = makeWave([[3, 1]]);
    assert.doesNotThrow(() => w.removeVertex(99));
    assert.equal(w.vertices.length, 1);
  });
});

// ── getY ───────────────────────────────────────────────────────────────
describe('Wave.getY', () => {
  it('頂点なしは 0 を返す', () => {
    assert.equal(makeWave().getY(5), 0);
  });

  it('範囲外（左）は 0', () => {
    const w = makeWave([[3, 1], [6, 1]]);
    assert.equal(w.getY(1), 0);
  });

  it('範囲外（右）は 0', () => {
    const w = makeWave([[3, 1], [6, 1]]);
    assert.equal(w.getY(9), 0);
  });

  it('左端の頂点を正確に返す', () => {
    const w = makeWave([[2, 1.5], [6, -1]]);
    assert.equal(w.getY(2), 1.5);
  });

  it('右端の頂点を正確に返す', () => {
    const w = makeWave([[2, 1.5], [6, -1]]);
    assert.equal(w.getY(6), -1);
  });

  it('中間の頂点を正確に返す', () => {
    const w = makeWave([[1, 0], [3, 2], [5, 0]]);
    assert.equal(w.getY(3), 2);
  });

  it('2頂点間を線形補間する（中点）', () => {
    const w = makeWave([[2, 0], [4, 2]]);
    assert.equal(w.getY(3), 1);   // 中点 → 1
  });

  it('三角波の斜面を正確に補間する', () => {
    // (0,0)-(4,2)-(8,0) の三角パルス
    const w = makeWave([[0, 0], [4, 2], [8, 0]]);
    assert.equal(w.getY(2), 1);    // 上昇斜面の中点
    assert.equal(w.getY(6), 1);    // 下降斜面の中点
  });
});

// ── getYAtTime ─────────────────────────────────────────────────────────
describe('Wave.getYAtTime', () => {
  it('t=0 は getY と同じ', () => {
    const w = makeWave([[2, 0], [5, 1.5], [8, 0]], 2, 1);
    for (let x = 0; x <= 10; x++) {
      assert.equal(w.getYAtTime(x, 0), w.getY(x));
    }
  });

  it('右進み（direction=+1）: t=2 で波が右へ speed*t 分シフト', () => {
    // (0,0)-(2,2)-(4,0) が速さ1で右進み → t=2 後は (2,0)-(4,2)-(6,0)
    const w = makeWave([[0, 0], [2, 2], [4, 0]], 1, 1);
    assert.equal(w.getYAtTime(4, 2), 2);   // ピークが x=2→4 に移動
    assert.equal(w.getYAtTime(3, 2), 1);   // (2,0)-(4,2) の中点 → 1
    assert.equal(w.getYAtTime(0, 2), 0);   // 範囲外に出た
  });

  it('左進み（direction=-1）: t=2 で波が左へ speed*t 分シフト', () => {
    // (2,0)-(5,2)-(8,0) が速さ1で左進み → t=2 後は (0,0)-(3,2)-(6,0)
    const w = makeWave([[2, 0], [5, 2], [8, 0]], 1, -1);
    assert.equal(w.getYAtTime(3, 2), 2);   // 旧ピーク(5)→新ピーク(3)
    assert.equal(w.getYAtTime(8, 2), 0);   // 元の右端が範囲外
  });

  it('speed=2 で 2 倍速の移動', () => {
    // (0,0)-(4,2)-(8,0) が速さ2で右進み → t=2 で (4,0)-(8,2)-(12,0)
    const w = makeWave([[0, 0], [4, 2], [8, 0]], 2, 1);
    assert.equal(w.getYAtTime(8, 2), 2);
    assert.equal(w.getYAtTime(0, 2), 0);
  });
});

// ── getSnapshot ────────────────────────────────────────────────────────
describe('Wave.getSnapshot', () => {
  it('範囲内の整数 x を全て含む', () => {
    const w = makeWave([[0, 0], [4, 1], [8, 0]]);
    const snap = w.getSnapshot(0, 8, 0);
    const xs = snap.map(p => p.x);
    for (let x = 0; x <= 8; x++) {
      assert.ok(xs.includes(x), `x=${x} が含まれていない`);
    }
  });

  it('シフト後の頂点位置を含む（折れ点が正確に描画される）', () => {
    // ピーク x=4 が t=1 で x=5 へ移動
    const w = makeWave([[2, 0], [4, 2], [6, 0]], 1, 1);
    const snap = w.getSnapshot(0, 10, 1);
    const xs = snap.map(p => p.x);
    assert.ok(xs.includes(5), '移動後のピーク位置 x=5 が含まれていない');
  });

  it('xMin より小さい点は含まない', () => {
    const w = makeWave([[0, 0], [10, 0]]);
    const snap = w.getSnapshot(3, 7, 0);
    assert.ok(snap.every(p => p.x >= 3));
  });

  it('xMax より大きい点は含まない', () => {
    const w = makeWave([[0, 0], [10, 0]]);
    const snap = w.getSnapshot(3, 7, 0);
    assert.ok(snap.every(p => p.x <= 7));
  });

  it('x 昇順にソートされている', () => {
    const w = makeWave([[0, 0], [4, 2], [8, 0]]);
    const snap = w.getSnapshot(0, 8, 0);
    for (let i = 1; i < snap.length; i++) {
      assert.ok(snap[i].x >= snap[i - 1].x);
    }
  });

  it('y 値が getYAtTime と一致している', () => {
    const w = makeWave([[1, 0], [4, 1.5], [7, 0]], 1, 1);
    const t  = 2;
    const snap = w.getSnapshot(0, 10, t);
    for (const p of snap) {
      assert.equal(p.y, w.getYAtTime(p.x, t));
    }
  });
});

// ── clear ──────────────────────────────────────────────────────────────
describe('Wave.clear', () => {
  it('クリア後は頂点なし', () => {
    const w = makeWave([[1, 1], [3, 2], [5, 0]]);
    w.clear();
    assert.equal(w.vertices.length, 0);
    assert.equal(w.getY(3), 0);
  });
});

// ── toJSON / fromJSON ──────────────────────────────────────────────────
describe('Wave.toJSON / fromJSON', () => {
  it('ラウンドトリップでデータが復元される', () => {
    const w = makeWave([[1, 0], [4, 2], [7, 0]], 3, -1);
    w.label = 'B';
    const json = w.toJSON();
    const w2   = new Wave().fromJSON(json);

    assert.deepEqual(w2.vertices, w.vertices);
    assert.equal(w2.speed,     3);
    assert.equal(w2.direction, -1);
    assert.equal(w2.label,     'B');
  });

  it('空の vertices でもエラーなし', () => {
    const w  = new Wave();
    const w2 = new Wave().fromJSON(w.toJSON());
    assert.deepEqual(w2.vertices, []);
  });

  it('fromJSON でデフォルト値が補完される', () => {
    const w = new Wave().fromJSON({});
    assert.equal(w.speed,     1);
    assert.equal(w.direction, 1);
    assert.equal(w.label,     'A');
    assert.deepEqual(w.vertices, []);
  });
});
