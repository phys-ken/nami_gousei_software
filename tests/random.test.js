'use strict';
// 実行: node --test tests/random.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('fs');
const { join } = require('path');
const vm = require('node:vm');

vm.runInThisContext(readFileSync(join(__dirname, '..', 'js', 'random.js'), 'utf8'));

// ── hashString ─────────────────────────────────────────────────────────
describe('SeededRandom.hashString', () => {
  it('同じ文字列は同じ値を返す（決定論的）', () => {
    const a = SeededRandom.hashString('hello');
    const b = SeededRandom.hashString('hello');
    assert.equal(a, b);
  });

  it('異なる文字列は異なる値を返す', () => {
    const a = SeededRandom.hashString('hello');
    const b = SeededRandom.hashString('world');
    assert.notEqual(a, b);
  });

  it('空文字列でも例外を出さない', () => {
    assert.doesNotThrow(() => SeededRandom.hashString(''));
  });

  it('結果は 32bit 符号なし整数（負にならない）', () => {
    const inputs = ['abc', 'long string with many chars', '日本語テスト', '!@#$%^&*()'];
    inputs.forEach(s => {
      const h = SeededRandom.hashString(s);
      assert.ok(h >= 0, `${s}: ${h} は負`);
      assert.ok(h <= 0xFFFFFFFF, `${s}: ${h} は 32bit を超える`);
      assert.ok(Number.isInteger(h), `${s}: ${h} は整数でない`);
    });
  });
});

// ── mulberry32 ─────────────────────────────────────────────────────────
describe('SeededRandom.mulberry32', () => {
  it('同じシードは同じ系列を生成する', () => {
    const r1 = SeededRandom.mulberry32(12345);
    const r2 = SeededRandom.mulberry32(12345);
    for (let i = 0; i < 10; i++) {
      assert.equal(r1(), r2());
    }
  });

  it('異なるシードは異なる系列を生成する', () => {
    const r1 = SeededRandom.mulberry32(1);
    const r2 = SeededRandom.mulberry32(2);
    let allSame = true;
    for (let i = 0; i < 10; i++) {
      if (r1() !== r2()) { allSame = false; break; }
    }
    assert.ok(!allSame, '異なるシードで同じ系列が出た');
  });

  it('値は [0, 1) の範囲', () => {
    const r = SeededRandom.mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1, `範囲外: ${v}`);
    }
  });
});

// ── seededShuffle ──────────────────────────────────────────────────────
describe('SeededRandom.seededShuffle', () => {
  it('同じ配列・同じシードで同じ結果', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const a = SeededRandom.seededShuffle(arr, 7);
    const b = SeededRandom.seededShuffle(arr, 7);
    assert.deepEqual(a, b);
  });

  it('異なるシードで（ほぼ）異なる結果', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = SeededRandom.seededShuffle(arr, 1);
    const b = SeededRandom.seededShuffle(arr, 99);
    assert.notDeepEqual(a, b);
  });

  it('要素は保たれる（並び替えのみ）', () => {
    const arr = [10, 20, 30, 40, 50];
    const shuffled = SeededRandom.seededShuffle(arr, 42);
    assert.deepEqual(shuffled.slice().sort((a, b) => a - b), arr);
  });

  it('元の配列を変更しない（純粋関数）', () => {
    const arr = [1, 2, 3, 4, 5];
    const original = arr.slice();
    SeededRandom.seededShuffle(arr, 42);
    assert.deepEqual(arr, original);
  });

  it('長さ 1 の配列はそのまま', () => {
    assert.deepEqual(SeededRandom.seededShuffle(['a'], 42), ['a']);
  });

  it('空配列も問題なし', () => {
    assert.deepEqual(SeededRandom.seededShuffle([], 42), []);
  });
});

// ── seededShuffleIndices ───────────────────────────────────────────────
describe('SeededRandom.seededShuffleIndices', () => {
  it('指定長さの順列が返る', () => {
    const idx = SeededRandom.seededShuffleIndices(6, 12345);
    assert.equal(idx.length, 6);
    assert.deepEqual(idx.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  });

  it('同じシード・同じ長さで再現する', () => {
    const a = SeededRandom.seededShuffleIndices(8, 999);
    const b = SeededRandom.seededShuffleIndices(8, 999);
    assert.deepEqual(a, b);
  });

  it('長さが変わると順列も変わる（同じシードでも）', () => {
    const a = SeededRandom.seededShuffleIndices(6, 100);
    const b = SeededRandom.seededShuffleIndices(8, 100);
    assert.notDeepEqual(a, b.slice(0, 6));  // 必ず違うとは限らないが普通は違う
  });
});

// ── 実用シナリオ: 問題波形のJSONからシード生成 ─────────────────────────
describe('実用シナリオ: 問題波形 → シード → シャッフル', () => {
  it('同じ波形JSON + 同じ選択肢数 → 同じシャッフル順', () => {
    const waveJson = JSON.stringify([{x:1,y:0}, {x:2,y:1}, {x:3,y:0}]);
    const count = 6;

    const seed1 = SeededRandom.hashString(waveJson + '|' + count);
    const seed2 = SeededRandom.hashString(waveJson + '|' + count);
    assert.equal(seed1, seed2);

    const items = ['正答', '不正解1', '不正解2', '不正解3', '不正解4', '不正解5'];
    const shuffled1 = SeededRandom.seededShuffle(items, seed1);
    const shuffled2 = SeededRandom.seededShuffle(items, seed2);
    assert.deepEqual(shuffled1, shuffled2);
  });

  it('選択肢数を変えるとシャッフル順も変わる', () => {
    const waveJson = JSON.stringify([{x:1,y:0}, {x:2,y:1}]);
    const seed6 = SeededRandom.hashString(waveJson + '|6');
    const seed4 = SeededRandom.hashString(waveJson + '|4');
    assert.notEqual(seed6, seed4);
  });
});
