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

  // ── 端部ランプ（Plan A: getSnapshot の視覚表示との整合）───────────────
  it('左端ランプ: [first.x-1, first.x) で 0→first.y に線形補間する', () => {
    // 頂点が x=2(y=2) から始まる波。x=1〜2 がランプ領域
    const w = makeWave([[2, 2], [4, 0]]);
    assert.equal(w.getY(1),   0);    // ランプ開始点 (x=first.x-1) → 0
    assert.equal(w.getY(1.5), 1);    // ランプ中点 → 1
    assert.equal(w.getY(2),   2);    // 頂点 → first.y
  });

  it('右端ランプ: (last.x, last.x+1] で last.y→0 に線形補間する', () => {
    // 頂点が x=2(y=0) 〜 x=4(y=2) で終わる波。x=4〜5 がランプ領域
    const w = makeWave([[2, 0], [4, 2]]);
    assert.equal(w.getY(4),   2);    // 最終頂点 → last.y
    assert.equal(w.getY(4.5), 1);    // ランプ中点 → 1
    assert.equal(w.getY(5),   0);    // ランプ終端 (x=last.x+1) → 0
  });

  it('ランプ範囲外はまだ 0 を返す', () => {
    const w = makeWave([[3, 1], [6, 1]]);
    assert.equal(w.getY(1), 0);  // x=1 < first.x-1=2
    assert.equal(w.getY(9), 0);  // x=9 > last.x+1=7
  });

  it('y-t グラフと y-x グラフの整合: 端部ランプにより急落が生じない', () => {
    // 頂点 x=2(y=2), x=4(y=0) の波が右向き速さ1で進む
    // 観測点 x=3 での y-t グラフ: getYAtTime(3,t) = getY(3-t)
    // t=1: getY(2)=2(ピーク), t=1.5: getY(1.5)=1(ランプ), t=2: getY(1)=0(ランプ終端)
    const w = makeWave([[2, 2], [4, 0]], 1, 1);
    assert.equal(w.getYAtTime(3, 1),   2);  // ピーク到達
    assert.equal(w.getYAtTime(3, 1.5), 1);  // ランプ（急落なし）
    assert.equal(w.getYAtTime(3, 2),   0);  // ランプ終端
    assert.equal(w.getYAtTime(3, 2.1), 0);  // 範囲外
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

  it('toJSON に kind: vertex が含まれる', () => {
    const w = makeWave([[1, 0], [3, 1]]);
    assert.equal(w.toJSON().kind, 'vertex');
  });

  it('kind フィールドなしの古いデータも fromJSON で復元できる（後方互換）', () => {
    const old = { vertices: [{ x: 1, y: 0.5 }], speed: 2, direction: -1, label: 'B' };
    const w = new Wave().fromJSON(old);
    assert.deepEqual(w.vertices, [{ x: 1, y: 0.5 }]);
    assert.equal(w.speed, 2);
  });
});

// ── Wave 抽象 API ──────────────────────────────────────────────────────
describe('Wave.isEmpty', () => {
  it('頂点なしは true', () => {
    assert.ok(new Wave().isEmpty());
  });

  it('頂点が 1 つあれば false', () => {
    assert.ok(!makeWave([[3, 1]]).isEmpty());
  });
});

describe('Wave.getMaxAmplitude', () => {
  it('頂点なしは 0', () => {
    assert.equal(new Wave().getMaxAmplitude(), 0);
  });

  it('複数頂点の最大 |y|', () => {
    const w = makeWave([[1, 0.5], [3, -2], [5, 1.5]]);
    assert.equal(w.getMaxAmplitude(), 2);
  });
});

describe('Wave.getKeyXs', () => {
  it('t=0 では頂点の x そのまま', () => {
    const w = makeWave([[2, 1], [5, -1]], 1, 1);
    assert.deepEqual(w.getKeyXs(0), [2, 5]);
  });

  it('右進み t=3 ではシフト後の位置', () => {
    const w = makeWave([[2, 1], [5, -1]], 2, 1); // speed=2, dir=+1
    assert.deepEqual(w.getKeyXs(3), [2 + 6, 5 + 6]);
  });

  it('左進み t=2 ではシフト後の位置', () => {
    const w = makeWave([[4, 1], [6, -1]], 1, -1);
    assert.deepEqual(w.getKeyXs(2), [4 - 2, 6 - 2]);
  });
});

describe('Wave.reflect', () => {
  it('固定端: 頂点が 2*boundary-x に写り y が反転する', () => {
    const w = makeWave([[2, 1], [4, -1], [6, 0.5]], 1, 1);
    const r = w.reflect(8, 'fixed');
    // 元の x: 2,4,6 → 反射後: 14,12,10
    const xs = r.vertices.map(v => v.x);
    assert.deepEqual(xs.sort((a, b) => a - b), [10, 12, 14]);
    const atX14 = r.vertices.find(v => v.x === 14);
    assert.equal(atX14.y, -1); // y=1 → -1
  });

  it('自由端: 頂点が 2*boundary-x に写り y は不変', () => {
    const w = makeWave([[3, 2], [7, -1]], 1, 1);
    const r = w.reflect(10, 'free');
    const atX17 = r.vertices.find(v => v.x === 17);
    assert.equal(atX17.y, 2);
  });

  it('反射波の direction が反転する', () => {
    const w = makeWave([[1, 1]], 2, 1);
    const r = w.reflect(5, 'fixed');
    assert.equal(r.direction, -1);
    assert.equal(r.speed, 2);
  });

  it('固定端 boundary=5 で getYAtTime と一致（_buildReflectedWave と同等）', () => {
    // _buildReflectedWave の既存実装と同じ結果であることを確認
    const w = makeWave([[2, 1], [4, 2], [6, 0]], 1, 1);
    const r = w.reflect(8, 'fixed');
    // x=2→14 y=1→-1, x=4→12 y=2→-2, x=6→10 y=0→0
    assert.equal(r.vertices.find(v => v.x === 14)?.y, -1);
    assert.equal(r.vertices.find(v => v.x === 12)?.y, -2);
    assert.ok(Math.abs(r.vertices.find(v => v.x === 10)?.y) < 1e-9); // 0 or -0
  });
});

// ── SineWave ヘルパー ──────────────────────────────────────────────────
function makeSine({
  amplitude = 1, wavelength = 4, phaseShift = 0,
  waveType = 'continuous', invertPhase = false, x0 = 0,
  speed = 1, direction = 1,
} = {}) {
  return new SineWave({
    sineConfig: { amplitude, wavelength, phaseShift, waveType, invertPhase, x0 },
    speed,
    direction,
  });
}

// ── SineWave 数式検証（連続波）────────────────────────────────────────
describe('SineWave.getYAtTime (continuous)', () => {
  it('A=1,λ=4,speed=1,dir=+1,phase=0: y(0,1) = -1', () => {
    const s = makeSine({ amplitude: 1, wavelength: 4, speed: 1, direction: 1 });
    assert.ok(Math.abs(s.getYAtTime(0, 1) - (-1)) < 1e-9);
  });

  it('phaseShift=2 で右に 2 ずれる（位相 sin(2π*(x-2)/λ)）', () => {
    const s0 = makeSine({ phaseShift: 0 });
    const s2 = makeSine({ phaseShift: 2 });
    // s2 の y(x,0) は s0 の y(x-2, 0) と一致
    for (let x = 0; x <= 8; x++) {
      assert.ok(Math.abs(s2.getYAtTime(x, 0) - s0.getYAtTime(x - 2, 0)) < 1e-9,
        `x=${x}`);
    }
  });

  it('direction=-1 で左進行（t 増加で零点が左に移動）', () => {
    const s = makeSine({ wavelength: 4, speed: 1, direction: -1 });
    // t=0 で y(0,0) = sin(0) = 0
    assert.ok(Math.abs(s.getYAtTime(0, 0)) < 1e-9);
    // t=1 で zero crossing が x=-1 に移動している
    assert.ok(Math.abs(s.getYAtTime(-1, 1)) < 1e-9);
  });

  it('invertPhase=true で全点の値が反転する', () => {
    const s  = makeSine({ amplitude: 2, wavelength: 6 });
    const si = makeSine({ amplitude: 2, wavelength: 6, invertPhase: true });
    for (let x = 0; x <= 10; x += 0.5) {
      assert.ok(Math.abs(si.getYAtTime(x, 0) + s.getYAtTime(x, 0)) < 1e-9,
        `x=${x}`);
    }
  });
});

// ── SineWave 数式検証（先頭あり進行波）───────────────────────────────
describe('SineWave.getYAtTime (progressive)', () => {
  it('先端 x_front では y=0', () => {
    // 右向き: x_front = 0 + 1*2 = 2
    const s = makeSine({ waveType: 'progressive', x0: 0, speed: 1, direction: 1 });
    assert.strictEqual(s.getYAtTime(2, 2), 0);
  });

  it('先端より外側（右向きで x > x_front）は y=0', () => {
    const s = makeSine({ waveType: 'progressive', x0: 0, speed: 1, direction: 1 });
    assert.strictEqual(s.getYAtTime(5, 2), 0); // x_front=2, x=5
  });

  it('左向き先端 x_front=1-t で x < x_front は y=0', () => {
    const s = makeSine({ waveType: 'progressive', x0: 1, speed: 1, direction: -1 });
    // t=2 → x_front = 1-2 = -1; x=-2 < -1
    assert.strictEqual(s.getYAtTime(-2, 2), 0);
  });

  it('x0=0,λ=4,speed=1,dir=+1: y(0,1) = sin(π/2) = 1', () => {
    // x_front=1, y(0,1) = sin(2π*(1-0)/4) = sin(π/2) = 1
    const s = makeSine({
      amplitude: 1, wavelength: 4, waveType: 'progressive',
      x0: 0, speed: 1, direction: 1,
    });
    assert.ok(Math.abs(s.getYAtTime(0, 1) - 1) < 1e-9);
  });

  it('invertPhase=true で値が反転する', () => {
    const s  = makeSine({ amplitude: 2, wavelength: 4, waveType: 'progressive', x0: 0 });
    const si = makeSine({ amplitude: 2, wavelength: 4, waveType: 'progressive', x0: 0, invertPhase: true });
    for (let x = 0; x <= 3; x += 0.5) {
      assert.ok(Math.abs(si.getYAtTime(x, 4) + s.getYAtTime(x, 4)) < 1e-9, `x=${x}`);
    }
  });
});

// ── SineWave.getSnapshot ───────────────────────────────────────────────
describe('SineWave.getSnapshot', () => {
  it('連続波: (xMax-xMin)*20+1 点以上返す', () => {
    const s = makeSine();
    const snap = s.getSnapshot(0, 10, 0);
    assert.ok(snap.length >= 10 * 20 + 1, `実際の点数: ${snap.length}`);
  });

  it('連続波: 全点が y = getYAtTime(x, t) と一致する', () => {
    const s = makeSine({ amplitude: 2, wavelength: 6 });
    const snap = s.getSnapshot(0, 6, 1);
    for (const p of snap) {
      assert.ok(Math.abs(p.y - s.getYAtTime(p.x, 1)) < 1e-9, `x=${p.x}`);
    }
  });

  it('先頭あり進行波: 先端より外側の点を含まない（右向き）', () => {
    const s = makeSine({ waveType: 'progressive', x0: 0, speed: 1, direction: 1 });
    // t=3 → x_front=3; xMin=0, xMax=10 → snapshot は [0, 3]
    const snap = s.getSnapshot(0, 10, 3);
    assert.ok(snap.every(p => p.x <= 3 + 1e-9));
  });

  it('先頭あり: 先端がグリッド外（未到達）なら空配列', () => {
    // 右向き, x0=-5, t=0 → x_front=-5 < xMin=0
    const s = makeSine({ waveType: 'progressive', x0: -5, speed: 1, direction: 1 });
    const snap = s.getSnapshot(0, 10, 0);
    assert.equal(snap.length, 0);
  });
});

// ── SineWave isEmpty / getKeyXs / getMaxAmplitude ─────────────────────
describe('SineWave 抽象 API', () => {
  it('isEmpty は常に false', () => {
    assert.ok(!makeSine().isEmpty());
  });

  it('getKeyXs は空配列', () => {
    assert.deepEqual(makeSine().getKeyXs(5), []);
  });

  it('getMaxAmplitude は amplitude を返す', () => {
    assert.equal(makeSine({ amplitude: 3 }).getMaxAmplitude(), 3);
  });
});

// ── SineWave.reflect ───────────────────────────────────────────────────
describe('SineWave.reflect (continuous)', () => {
  it('反射波の direction が反転する', () => {
    const s = makeSine({ direction: 1 });
    const r = s.reflect(5, 'fixed');
    assert.equal(r.direction, -1);
  });

  it('固定端: 境界での変位合計がゼロ（y_i + y_r = 0）', () => {
    const s = makeSine({ amplitude: 1, wavelength: 4, speed: 1, direction: 1, phaseShift: 0 });
    const r = s.reflect(5, 'fixed');
    for (let t = 0; t <= 4; t += 0.5) {
      const total = s.getYAtTime(5, t) + r.getYAtTime(5, t);
      assert.ok(Math.abs(total) < 1e-9, `t=${t}: y_total=${total}`);
    }
  });

  it('自由端: 境界での傾き合計がゼロ（連続近似）', () => {
    const s = makeSine({ amplitude: 1, wavelength: 4, speed: 1, direction: 1, phaseShift: 0 });
    const r = s.reflect(5, 'free');
    const EPS = 1e-5;
    for (let t = 0; t <= 4; t += 0.5) {
      // ∂y/∂x|_B ≈ (y(B+ε) - y(B-ε)) / (2ε)
      const B = 5;
      const dyi = (s.getYAtTime(B + EPS, t) - s.getYAtTime(B - EPS, t)) / (2 * EPS);
      const dyr = (r.getYAtTime(B + EPS, t) - r.getYAtTime(B - EPS, t)) / (2 * EPS);
      assert.ok(Math.abs(dyi + dyr) < 1e-4, `t=${t}: ∂y/∂x total=${dyi + dyr}`);
    }
  });
});

describe('SineWave.reflect (progressive)', () => {
  it('反射波の方向が逆', () => {
    const s = makeSine({ waveType: 'progressive', x0: 0, speed: 1, direction: 1 });
    const r = s.reflect(10, 'fixed');
    assert.equal(r.direction, -1);
  });

  it('t < t_hit では反射波の値がゼロ', () => {
    // x0=0, speed=1, boundary=5 → t_hit=5
    const s = makeSine({ waveType: 'progressive', x0: 0, speed: 1, direction: 1, wavelength: 4, amplitude: 1 });
    const r = s.reflect(5, 'fixed');
    // t=3 < t_hit=5: 反射波の先端 x_front_r = (2*5 - 0) - 1*3 = 7 > 5
    // → x < 5 の範囲には反射波が存在しない
    for (let x = 0; x <= 4; x++) {
      assert.strictEqual(r.getYAtTime(x, 3), 0, `x=${x}`);
    }
  });

  it('t = t_hit で反射波の先端が境界に到達', () => {
    const s = makeSine({ waveType: 'progressive', x0: 0, speed: 1, direction: 1, wavelength: 4, amplitude: 1 });
    const r = s.reflect(5, 'fixed');
    // t=5: x_front_r = 10 - 5 = 5 (boundary)
    assert.strictEqual(r.sineConfig.x0, 10); // 2*5 - 0 = 10
  });
});

// ── SineWave.toJSON / fromJSON ─────────────────────────────────────────
describe('SineWave.toJSON / fromJSON', () => {
  it('ラウンドトリップでデータが復元される', () => {
    const s = makeSine({
      amplitude: 3, wavelength: 8, phaseShift: 2,
      waveType: 'progressive', invertPhase: true, x0: -4,
      speed: 2, direction: -1,
    });
    s.label = 'B';
    const json = s.toJSON();
    const s2 = new SineWave().fromJSON(json);

    assert.equal(s2.sineConfig.amplitude, 3);
    assert.equal(s2.sineConfig.wavelength, 8);
    assert.equal(s2.sineConfig.phaseShift, 2);
    assert.equal(s2.sineConfig.waveType, 'progressive');
    assert.equal(s2.sineConfig.invertPhase, true);
    assert.equal(s2.sineConfig.x0, -4);
    assert.equal(s2.speed, 2);
    assert.equal(s2.direction, -1);
    assert.equal(s2.label, 'B');
  });

  it('toJSON の kind は "sine"', () => {
    assert.equal(makeSine().toJSON().kind, 'sine');
  });
});
