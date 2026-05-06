'use strict';
// 実行: node --test tests/api.test.js
// API バックエンド（validate.js + bridge.js）の堅牢性・安全性テスト

// ── NODE_PATH 注入（api_server.js と同じロジック） ─────────────────────
const path = require('node:path');
const RUNTIME_NODE_MODULES = process.env.WAVE_API_NODE_MODULES
  || path.join(__dirname, '..', 'node_modules');
require('node:module').Module.globalPaths.push(RUNTIME_NODE_MODULES);
process.env.NODE_PATH = process.env.NODE_PATH
  ? `${process.env.NODE_PATH}${path.delimiter}${RUNTIME_NODE_MODULES}`
  : RUNTIME_NODE_MODULES;
require('node:module').Module._initPaths();

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');

const { validateRequest } = require('../api/validate');
const { Bridge } = require('../api/bridge');

const PROJECT_ROOT = path.join(__dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-api-test-'));

// Shared bridge instance (lazy-initialized once by before())
let bridge;

// ── ヘルパー ────────────────────────────────────────────────────────────
const WAVE_A_TRIANGLE = {
  vertices: [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 0 }],
  speed: 1,
  direction: 1,
};
const WAVE_B_TRIANGLE = {
  vertices: [{ x: 6, y: 0 }, { x: 8, y: -1 }, { x: 10, y: 0 }],
  speed: 1,
  direction: -1,
};
const THREE_DISTRACTORS = [
  { vertices: [{ x: 0, y: 0 }, { x: 4, y: 1 }, { x: 8, y: 0 }], speed: 0, direction: 1 },
  { vertices: [{ x: 0, y: 0 }, { x: 4, y: -1 }, { x: 8, y: 0 }], speed: 0, direction: 1 },
  { vertices: [{ x: 0, y: 1 }, { x: 4, y: -1 }, { x: 8, y: 1 }], speed: 0, direction: 1 },
];

function outputDir(name) {
  const d = path.join(TMP_DIR, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function gen(spec, name) {
  return bridge.generate({ outputDir: outputDir(name), filenamePrefix: 'q', ...spec });
}

// ═══════════════════════════════════════════════════════════════════════
// 1. バリデーション（validate.js）
// ═══════════════════════════════════════════════════════════════════════
describe('validate.js — バリデーション', () => {
  it('正常な Type1 リクエストを受け入れる', () => {
    const r = validateRequest({
      type: 1,
      waveA: WAVE_A_TRIANGLE,
      params: { answerT: 3 },
    });
    assert.ok(r.success);
  });

  it('type が未指定なら失敗', () => {
    const r = validateRequest({ waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } });
    assert.ok(!r.success);
  });

  it('type = 0 は範囲外で失敗', () => {
    const r = validateRequest({ type: 0, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } });
    assert.ok(!r.success);
  });

  it('type = 8 は範囲外で失敗', () => {
    const r = validateRequest({ type: 8, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } });
    assert.ok(!r.success);
  });

  it('Type1 で answerT 未指定なら失敗', () => {
    const r = validateRequest({ type: 1, waveA: WAVE_A_TRIANGLE, params: {} });
    assert.ok(!r.success);
    const msgs = JSON.stringify(r.error.format());
    assert.ok(msgs.includes('answerT'));
  });

  it('Type2 で x, t 未指定なら失敗', () => {
    const r = validateRequest({ type: 2, waveA: WAVE_A_TRIANGLE, params: {} });
    assert.ok(!r.success);
  });

  it('Type4 で waveB がないと失敗', () => {
    const r = validateRequest({ type: 4, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } });
    assert.ok(!r.success);
    const msgs = JSON.stringify(r.error.format());
    assert.ok(msgs.includes('waveB'));
  });

  it('Type6 で boundary, endType 未指定なら失敗', () => {
    const r = validateRequest({ type: 6, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } });
    assert.ok(!r.success);
  });

  it('Type1 に choices を付けると失敗（types 3,4,6 のみ対応）', () => {
    const r = validateRequest({
      type: 1,
      waveA: WAVE_A_TRIANGLE,
      params: { answerT: 3 },
      choices: { enabled: true, count: 4, distractors: THREE_DISTRACTORS },
    });
    assert.ok(!r.success);
  });

  it('distractors.length !== count-1 なら失敗', () => {
    const r = validateRequest({
      type: 4,
      waveA: WAVE_A_TRIANGLE,
      waveB: WAVE_B_TRIANGLE,
      params: { answerT: 3 },
      choices: { enabled: true, count: 4, distractors: [THREE_DISTRACTORS[0]] }, // 1 != 3
    });
    assert.ok(!r.success);
    const msgs = JSON.stringify(r.error.format());
    assert.ok(msgs.includes('distractors'));
  });

  it('y が 0.5 刻みでない頂点は失敗', () => {
    const r = validateRequest({
      type: 1,
      waveA: { vertices: [{ x: 0, y: 0 }, { x: 2, y: 0.3 }, { x: 4, y: 0 }], speed: 1, direction: 1 },
      params: { answerT: 3 },
    });
    assert.ok(!r.success);
  });

  it('cellSize.w が 15未満なら失敗', () => {
    const r = validateRequest({
      type: 1,
      waveA: WAVE_A_TRIANGLE,
      params: { answerT: 3 },
      cellSize: { w: 10 },
    });
    assert.ok(!r.success);
  });

  it('cellSize.w が 120超なら失敗', () => {
    const r = validateRequest({
      type: 1,
      waveA: WAVE_A_TRIANGLE,
      params: { answerT: 3 },
      cellSize: { w: 121 },
    });
    assert.ok(!r.success);
  });

  it('grid.xMin >= xMax なら失敗', () => {
    const r = validateRequest({
      type: 1,
      waveA: WAVE_A_TRIANGLE,
      params: { answerT: 3 },
      grid: { xMin: 10, xMax: 10, yMin: -2, yMax: 2 },
    });
    assert.ok(!r.success);
  });

  it('filenamePrefix が 64文字超なら失敗', () => {
    const r = validateRequest({
      type: 1,
      waveA: WAVE_A_TRIANGLE,
      params: { answerT: 3 },
      filenamePrefix: 'a'.repeat(65),
    });
    assert.ok(!r.success);
  });

  it('choices.enabled = false なら distractors の長さチェックをスキップ', () => {
    const r = validateRequest({
      type: 3,
      waveA: WAVE_A_TRIANGLE,
      params: { x: 2, tMax: 6 },
      choices: { enabled: false, count: 4, distractors: [] },
    });
    assert.ok(r.success);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Bridge — 初期化
// ═══════════════════════════════════════════════════════════════════════
describe('Bridge — 初期化', () => {
  before(() => {
    bridge = new Bridge({ projectRoot: PROJECT_ROOT, defaultOutputDir: TMP_DIR });
    bridge.init();
  });

  it('sandbox に Wave が公開される', () => {
    assert.ok(typeof bridge.sandbox.Wave === 'function' || typeof bridge.sandbox.Wave === 'object');
  });

  it('sandbox に SeededRandom が公開される', () => {
    assert.ok(bridge.sandbox.SeededRandom);
  });

  it('sandbox に ProblemGenerator が公開される', () => {
    assert.ok(bridge.sandbox.ProblemGenerator);
  });

  it('sandbox に WaveRenderer が公開される', () => {
    assert.ok(bridge.sandbox.WaveRenderer);
  });

  it('init() を2回呼んでも例外なし（冪等）', () => {
    assert.doesNotThrow(() => bridge.init());
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Bridge.generate — 全タイプ基本動作
// ═══════════════════════════════════════════════════════════════════════
describe('Bridge.generate — Type1（単一波・y-x グラフ）', () => {
  it('success:true を返す', () => {
    const r = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } }, 't1');
    assert.ok(r.success);
  });

  it('question PNG が生成される', () => {
    const r = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 0 } }, 't1b');
    assert.ok(r.files.question.length > 0);
    assert.ok(fs.existsSync(r.files.question[0].path));
  });

  it('answer PNG が生成される', () => {
    const r = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 5 } }, 't1c');
    assert.ok(r.files.answer.length > 0);
    assert.ok(fs.existsSync(r.files.answer[0].path));
  });

  it('manifest.json が保存される', () => {
    const r = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 2 } }, 't1d');
    assert.ok(fs.existsSync(r.files.manifest));
    const m = JSON.parse(fs.readFileSync(r.files.manifest, 'utf8'));
    assert.ok(m.request);
    assert.ok(m.response);
  });
});

describe('Bridge.generate — Type2（数値解答）', () => {
  it('answerValue が数値を返す', () => {
    const r = gen({ type: 2, waveA: WAVE_A_TRIANGLE, params: { x: 2, t: 0 } }, 't2');
    assert.ok(r.success);
    assert.ok(typeof r.answerValue === 'number');
  });
});

describe('Bridge.generate — Type3（y-t グラフ）', () => {
  it('success:true を返す', () => {
    const r = gen({ type: 3, waveA: WAVE_A_TRIANGLE, params: { x: 2, tMax: 6 } }, 't3');
    assert.ok(r.success);
  });

  it('ref PNG (スナップショット列) が生成される', () => {
    const r = gen({ type: 3, waveA: WAVE_A_TRIANGLE, params: { x: 2, tMax: 6 } }, 't3b');
    assert.ok(r.files.ref.length > 0);
    assert.ok(fs.existsSync(r.files.ref[0].path));
  });

  it('選択肢あり（count=4）で4つの choices が返る', () => {
    const r = gen({
      type: 3, waveA: WAVE_A_TRIANGLE, params: { x: 2, tMax: 6 },
      choices: { enabled: true, count: 4, shuffle: false, distractors: THREE_DISTRACTORS },
    }, 't3c');
    assert.ok(r.success);
    assert.equal(r.files.choices.length, 4);
  });

  it('正答は isCorrect:true', () => {
    const r = gen({
      type: 3, waveA: WAVE_A_TRIANGLE, params: { x: 2, tMax: 6 },
      choices: { enabled: true, count: 4, shuffle: false, distractors: THREE_DISTRACTORS },
    }, 't3d');
    const correct = r.files.choices.filter(c => c.isCorrect);
    assert.equal(correct.length, 1);
  });
});

describe('Bridge.generate — Type4（合成波）', () => {
  it('success:true を返す', () => {
    const r = gen({ type: 4, waveA: WAVE_A_TRIANGLE, waveB: WAVE_B_TRIANGLE, params: { answerT: 3 } }, 't4');
    assert.ok(r.success);
  });

  it('選択肢あり（count=4）で4つの choices が返る', () => {
    const r = gen({
      type: 4, waveA: WAVE_A_TRIANGLE, waveB: WAVE_B_TRIANGLE, params: { answerT: 3 },
      choices: { enabled: true, count: 4, shuffle: false, distractors: THREE_DISTRACTORS },
    }, 't4c');
    assert.ok(r.success);
    assert.equal(r.files.choices.length, 4);
  });
});

describe('Bridge.generate — Type5（合成波・時刻範囲）', () => {
  it('success:true を返す', () => {
    const r = gen({ type: 5, waveA: WAVE_A_TRIANGLE, waveB: WAVE_B_TRIANGLE, params: { tStart: 0, tEnd: 4 } }, 't5');
    assert.ok(r.success);
  });

  it('question PNG が複数枚生成される', () => {
    const r = gen({ type: 5, waveA: WAVE_A_TRIANGLE, waveB: WAVE_B_TRIANGLE, params: { tStart: 0, tEnd: 4 } }, 't5b');
    assert.ok(r.files.question.length > 1, `question count: ${r.files.question.length}`);
  });
});

describe('Bridge.generate — Type6（固定端反射）', () => {
  it('success:true を返す', () => {
    const r = gen({
      type: 6, waveA: WAVE_A_TRIANGLE,
      params: { answerT: 5, boundary: 8, endType: 'fixed' },
    }, 't6');
    assert.ok(r.success);
  });

  it('自由端でも success:true を返す', () => {
    const r = gen({
      type: 6, waveA: WAVE_A_TRIANGLE,
      params: { answerT: 5, boundary: 8, endType: 'free' },
    }, 't6free');
    assert.ok(r.success);
  });

  it('選択肢あり（count=4）で4つの choices が返る', () => {
    const r = gen({
      type: 6, waveA: WAVE_A_TRIANGLE,
      params: { answerT: 5, boundary: 8, endType: 'fixed' },
      choices: { enabled: true, count: 4, shuffle: false, distractors: THREE_DISTRACTORS },
    }, 't6c');
    assert.ok(r.success);
    assert.equal(r.files.choices.length, 4);
  });
});

describe('Bridge.generate — Type7（反射波・時刻範囲）', () => {
  it('success:true を返す', () => {
    const r = gen({
      type: 7, waveA: WAVE_A_TRIANGLE,
      params: { tStart: 0, tEnd: 6, boundary: 8, endType: 'free' },
    }, 't7');
    assert.ok(r.success);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. 選択肢シャッフルの決定論性
// ═══════════════════════════════════════════════════════════════════════
describe('選択肢シャッフルの決定論性', () => {
  const spec = {
    type: 4, waveA: WAVE_A_TRIANGLE, waveB: WAVE_B_TRIANGLE, params: { answerT: 3 },
    choices: { enabled: true, count: 4, shuffle: true, distractors: THREE_DISTRACTORS },
  };

  it('同じ入力から同じ choices 順序が得られる（2回生成）', () => {
    const r1 = gen(spec, 'det1');
    const r2 = gen(spec, 'det2');
    const order1 = r1.files.choices.map(c => c.isCorrect);
    const order2 = r2.files.choices.map(c => c.isCorrect);
    assert.deepEqual(order1, order2);
  });

  it('shuffleSeed が一致する', () => {
    const r1 = gen(spec, 'seed1');
    const r2 = gen(spec, 'seed2');
    assert.equal(r1.shuffleSeed, r2.shuffleSeed);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. inline モード（ファイル保存しない）
// ═══════════════════════════════════════════════════════════════════════
describe('inline モード', () => {
  it('inline:true で dataUrl フィールドが返る', () => {
    const r = bridge.generate({
      inline: true,
      type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 },
    });
    assert.ok(r.success);
    assert.ok(r.files.question[0].dataUrl?.startsWith('data:image/png;base64,'));
  });

  it('inline:true では path フィールドがない', () => {
    const r = bridge.generate({
      inline: true,
      type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 },
    });
    assert.equal(r.files.question[0].path, undefined);
  });

  it('inline:true では manifest が保存されない', () => {
    const r = bridge.generate({
      inline: true,
      type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 },
    });
    assert.equal(r.files.manifest, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. パストラバーサル防御（/api/output のパスチェック）
// ═══════════════════════════════════════════════════════════════════════
describe('パストラバーサル防御', () => {
  const SESSION_RE = /^[\w.\-]+$/;
  const FILE_RE = /^[\w.\-]+\.png$/;

  it('正常な session ID を通す', () => {
    assert.ok(SESSION_RE.test('20260506_130000_a1b2c3'));
  });

  it('.. を含む session ID を弾く', () => {
    assert.ok(!SESSION_RE.test('../etc'));
  });

  it('/ を含む session ID を弾く', () => {
    assert.ok(!SESSION_RE.test('a/b'));
  });

  it('正常なファイル名を通す', () => {
    assert.ok(FILE_RE.test('q001_question_1.png'));
  });

  it('.png 以外の拡張子を弾く', () => {
    assert.ok(!FILE_RE.test('q001.js'));
    assert.ok(!FILE_RE.test('q001.png.js'));
  });

  it('.. を含むファイル名を弾く', () => {
    assert.ok(!FILE_RE.test('../secret.png'));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. 並行安全性（同時リクエスト）
// ═══════════════════════════════════════════════════════════════════════
describe('並行安全性', () => {
  it('5件を同時実行しても全件 success:true', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      Promise.resolve(gen(
        { type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: i } },
        `concurrent_${i}`,
      )),
    );
    const results = await Promise.all(tasks);
    for (const r of results) {
      assert.ok(r.success, `success should be true, got: ${JSON.stringify(r).slice(0, 200)}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. エッジケース
// ═══════════════════════════════════════════════════════════════════════
describe('エッジケース', () => {
  it('vertices が空配列でも Type1 を生成できる（ゼロ波形）', () => {
    const r = gen({
      type: 1,
      waveA: { vertices: [], speed: 1, direction: 1 },
      params: { answerT: 3 },
    }, 'empty_wave');
    assert.ok(r.success);
  });

  it('answerT = 0 でも生成できる', () => {
    const r = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 0 } }, 't0');
    assert.ok(r.success);
  });

  it('style:"bw" でも生成できる', () => {
    const r = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 }, style: 'bw' }, 'bw');
    assert.ok(r.success);
  });

  it('style:"gray" でも生成できる', () => {
    const r = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 }, style: 'gray' }, 'gray');
    assert.ok(r.success);
  });

  it('filenamePrefix が 64文字ちょうどでも生成できる', () => {
    const r = gen({
      type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 },
      filenamePrefix: 'a'.repeat(64), outputDir: outputDir('longprefix'),
    }, 'longprefix');
    assert.ok(r.success);
  });

  it('cellSize.w = 30 を指定しても生成できる', () => {
    const r = gen({
      type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 },
      cellSize: { w: 30 },
    }, 'cellsize');
    assert.ok(r.success);
  });

  it('sessionId が毎回異なる', () => {
    const r1 = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } }, 'sid1');
    const r2 = gen({ type: 1, waveA: WAVE_A_TRIANGLE, params: { answerT: 3 } }, 'sid2');
    assert.notEqual(r1.sessionId, r2.sessionId);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 正弦波モード（Phase 6）
// ═══════════════════════════════════════════════════════════════════════

const WAVE_A_SINE = {
  sineMode: true,
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 0, waveType: 'continuous' },
  speed: 1,
  direction: 1,
};
const WAVE_A_SINE_PROG = {
  sineMode: true,
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 0, waveType: 'progressive', x0: 0 },
  speed: 1,
  direction: 1,
};
const WAVE_B_SINE = {
  sineMode: true,
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 2, waveType: 'continuous' },
  speed: 1,
  direction: -1,
};

describe('正弦波モード — バリデーション', () => {
  it('sineMode=true なのに sineConfig なし → バリデーションエラー', () => {
    const r = validateRequest({ type: 1, waveA: { sineMode: true, speed: 1, direction: 1 }, params: { answerT: 3 } });
    assert.ok(!r.success);
    assert.ok(r.error.issues.some(i => i.message.includes('sineConfig')));
  });

  it('sineConfig.waveType="progressive" で x0 なし → バリデーションエラー', () => {
    const r = validateRequest({
      type: 1,
      waveA: { sineMode: true, sineConfig: { amplitude: 1, wavelength: 4, waveType: 'progressive' }, speed: 1, direction: 1 },
      params: { answerT: 3 },
    });
    assert.ok(!r.success);
    assert.ok(r.error.issues.some(i => i.message.includes('x0')));
  });

  it('amplitude=0 → バリデーションエラー', () => {
    const r = validateRequest({
      type: 1,
      waveA: { sineMode: true, sineConfig: { amplitude: 0, wavelength: 4 }, speed: 1, direction: 1 },
      params: { answerT: 3 },
    });
    assert.ok(!r.success);
  });

  it('wavelength=1 → バリデーションエラー（min=2）', () => {
    const r = validateRequest({
      type: 1,
      waveA: { sineMode: true, sineConfig: { amplitude: 1, wavelength: 1 }, speed: 1, direction: 1 },
      params: { answerT: 3 },
    });
    assert.ok(!r.success);
  });
});

describe('正弦波モード — Bridge.generate', () => {
  it('Type 1 + 連続正弦波 → success:true, 画像生成', () => {
    const r = gen({ type: 1, waveA: WAVE_A_SINE, params: { answerT: 3 } }, 'sine_type1_cont');
    assert.ok(r.success, r.error);
    assert.ok(Array.isArray(r.files.question) && r.files.question.length > 0);
  });

  it('Type 1 + 先頭あり正弦波 → success:true', () => {
    const r = gen({ type: 1, waveA: WAVE_A_SINE_PROG, params: { answerT: 3 } }, 'sine_type1_prog');
    assert.ok(r.success, r.error);
  });

  it('Type 4 + waveA/B 両方正弦波 → success:true, 合成波生成', () => {
    const r = gen({ type: 4, waveA: WAVE_A_SINE, waveB: WAVE_B_SINE, params: { answerT: 3 } }, 'sine_type4_both');
    assert.ok(r.success, r.error);
  });

  it('Type 4 + waveA 正弦波、waveB 折れ線（混在） → success:true', () => {
    const r = gen({ type: 4, waveA: WAVE_A_SINE, waveB: WAVE_B_TRIANGLE, params: { answerT: 3 } }, 'sine_type4_mixed');
    assert.ok(r.success, r.error);
  });

  it('Type 6 + waveA 正弦波 + 反射 → success:true', () => {
    const r = gen({
      type: 6, waveA: WAVE_A_SINE,
      params: { answerT: 3, boundary: 8, endType: 'fixed' },
    }, 'sine_type6');
    assert.ok(r.success, r.error);
  });

  it('gridConfig.yMax 自動調整: 振幅3の正弦波 → yMax >= 4', () => {
    const sineAmp3 = {
      sineMode: true,
      sineConfig: { amplitude: 3, wavelength: 4, phaseShift: 0, waveType: 'continuous' },
      speed: 1, direction: 1,
    };
    const r = gen({ type: 1, waveA: sineAmp3, params: { answerT: 3 } }, 'sine_yrange');
    assert.ok(r.success, r.error);
    assert.ok(r.gridConfig.yMax >= 4, `yMax=${r.gridConfig.yMax} should be >= 4`);
  });

  it('Type 4 選択肢 + sineMode distractor → success:true', () => {
    const sineDist = {
      sineMode: true,
      sineConfig: { amplitude: 1, wavelength: 6, phaseShift: 1, waveType: 'continuous' },
      speed: 0, direction: 1,
    };
    const r = gen({
      type: 4, waveA: WAVE_A_SINE, waveB: WAVE_B_SINE,
      params: { answerT: 3 },
      choices: { enabled: true, count: 4, distractors: [sineDist, sineDist, sineDist] },
    }, 'sine_type4_choices');
    assert.ok(r.success, r.error);
    assert.ok(r.files.choices && r.files.choices.length === 4);
  });
});
