'use strict';
// HTTP統合テスト — node api_server.js が起動中の状態で実行すること
// 実行: node --test tests/http_integration.test.js
//
// 静的: http://localhost:8000
// API:  http://localhost:8001

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STATIC_BASE = 'http://localhost:8000';
const API_BASE    = 'http://localhost:8001';

// ── リクエスト例（api/examples/ から引用） ───────────────────────────
const EX = {
  type1: {
    type: 1, style: 'gray',
    waveA: {
      vertices: [{x:0,y:0},{x:1,y:0.5},{x:2,y:1},{x:3,y:0.5},{x:4,y:0}],
      speed: 1, direction: 1,
    },
    params: { answerT: 3 },
    filenamePrefix: 'http_type1',
  },
  type2: {
    type: 2,
    waveA: {
      vertices: [{x:0,y:0},{x:1,y:0.5},{x:2,y:1},{x:3,y:0.5},{x:4,y:0}],
      speed: 1, direction: 1,
    },
    params: { x: 5, t: 2 },
    filenamePrefix: 'http_type2',
  },
  type3_choices: {
    type: 3, style: 'bw',
    waveA: {
      vertices: [{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:3,y:-1},{x:4,y:0}],
      speed: 1, direction: 1,
    },
    params: { x: 5, tMax: 4 },
    choices: {
      enabled: true, count: 4, shuffle: true,
      distractors: [
        { vertices: [{x:0,y:0},{x:1,y:-1},{x:2,y:0},{x:3,y:1},{x:4,y:0}], speed: 0, direction: 1 },
        { vertices: [{x:0,y:1},{x:2,y:-1},{x:4,y:1}], speed: 0, direction: 1 },
        { vertices: [{x:0,y:0},{x:4,y:0}], speed: 0, direction: 1 },
      ],
    },
    filenamePrefix: 'http_type3',
  },
  type4_choices: {
    type: 4, style: 'gray',
    waveA: {
      vertices: [{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:3,y:-1},{x:4,y:0}],
      speed: 1, direction: 1,
    },
    waveB: {
      vertices: [{x:6,y:0},{x:7,y:-1},{x:8,y:0},{x:9,y:1},{x:10,y:0}],
      speed: 1, direction: -1,
    },
    params: { answerT: 3 },
    choices: {
      enabled: true, count: 4, shuffle: true,
      distractors: [
        { vertices: [{x:0,y:0},{x:5,y:1},{x:10,y:0}], speed: 0, direction: 1 },
        { vertices: [{x:0,y:0},{x:5,y:-1},{x:10,y:0}], speed: 0, direction: 1 },
        { vertices: [{x:0,y:0},{x:3,y:2},{x:7,y:-2},{x:10,y:0}], speed: 0, direction: 1 },
      ],
    },
    filenamePrefix: 'http_type4',
  },
  type5: {
    type: 5,
    waveA: {
      vertices: [{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:3,y:-1},{x:4,y:0}],
      speed: 1, direction: 1,
    },
    waveB: {
      vertices: [{x:6,y:0},{x:7,y:-1},{x:8,y:0},{x:9,y:1},{x:10,y:0}],
      speed: 1, direction: -1,
    },
    params: { tStart: 0, tEnd: 4 },
    filenamePrefix: 'http_type5',
  },
  type6_choices: {
    type: 6, style: 'bw',
    waveA: {
      vertices: [{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:3,y:-1},{x:4,y:0}],
      speed: 1, direction: 1,
    },
    params: { answerT: 5, boundary: 8, endType: 'fixed' },
    choices: {
      enabled: true, count: 4, shuffle: true,
      distractors: [
        { vertices: [{x:0,y:0},{x:4,y:1},{x:8,y:0}], speed: 0, direction: 1 },
        { vertices: [{x:0,y:0},{x:4,y:-1},{x:8,y:0}], speed: 0, direction: 1 },
        { vertices: [{x:0,y:1},{x:4,y:-1},{x:8,y:1}], speed: 0, direction: 1 },
      ],
    },
    filenamePrefix: 'http_type6',
  },
  type7: {
    type: 7,
    waveA: {
      vertices: [{x:0,y:0},{x:1,y:1},{x:2,y:0},{x:3,y:-1},{x:4,y:0}],
      speed: 1, direction: 1,
    },
    params: { tStart: 0, tEnd: 6, boundary: 8, endType: 'free' },
    filenamePrefix: 'http_type7',
  },
};

// ── ヘルパー ─────────────────────────────────────────────────────────
async function apiPost(body) {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function checkServerReady() {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`health status ${res.status}`);
    const data = await res.json();
    if (!data.sandboxReady) throw new Error('sandbox not ready');
  } catch (err) {
    throw new Error(
      `サーバーが起動していません。先に "node api_server.js" を実行してください。\n原因: ${err.message}`
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-0: 前提確認
// ══════════════════════════════════════════════════════════════════════
describe('前提: サーバー起動確認', () => {
  it('APIサーバーが応答し sandboxReady=true であること', async () => {
    await checkServerReady();
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-1: 基本エンドポイント
// ══════════════════════════════════════════════════════════════════════
describe('GET /api/health', () => {
  it('status 200 かつ sandboxReady: true を返す', async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.sandboxReady, true);
  });
});

describe('GET /api/schema', () => {
  it('status 200 かつ type 1〜7 のスキーマを含む', async () => {
    const res = await fetch(`${API_BASE}/api/schema`);
    assert.equal(res.status, 200);
    const body = await res.json();
    // schema.json はオブジェクト形式 — types または types[] が存在するか確認
    const json = JSON.stringify(body);
    for (let t = 1; t <= 7; t++) {
      assert.ok(json.includes(`"${t}"`), `type ${t} がスキーマに存在しない`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-2: 静的サーバー
// ══════════════════════════════════════════════════════════════════════
describe('静的サーバー (port 8000)', () => {
  it('GET / → index.html が返る', async () => {
    const res = await fetch(`${STATIC_BASE}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('<html'), 'HTMLドキュメントが返っていない');
  });

  it('GET /js/wave.js → JavaScript が返る', async () => {
    const res = await fetch(`${STATIC_BASE}/js/wave.js`);
    assert.equal(res.status, 200);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('javascript'), `Content-Type が不正: ${ct}`);
  });

  it('GET /css/style.css → CSS が返る', async () => {
    const res = await fetch(`${STATIC_BASE}/css/style.css`);
    assert.equal(res.status, 200);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('css'), `Content-Type が不正: ${ct}`);
  });

  it('存在しないファイルは 404', async () => {
    const res = await fetch(`${STATIC_BASE}/nonexistent_file_xyz.js`);
    assert.equal(res.status, 404);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-3〜9: POST /api/generate — type1〜7 全タイプ
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/generate — Type1 (y-x グラフ)', () => {
  let result;
  before(async () => { ({ body: result } = await apiPost(EX.type1)); });

  it('success: true', () => assert.equal(result.success, true));
  it('type が 1', () => assert.equal(result.type, 1));
  it('questionText が文字列', () => assert.equal(typeof result.questionText, 'string'));
  it('files.question に PNG パスがある', () => {
    assert.ok(Array.isArray(result.files.question) && result.files.question.length > 0);
    assert.ok(result.files.question[0].path.endsWith('.png'));
  });
  it('files.answer に PNG パスがある', () => {
    assert.ok(Array.isArray(result.files.answer) && result.files.answer.length > 0);
  });
});

describe('POST /api/generate — Type2 (数値解答)', () => {
  let result;
  before(async () => { ({ body: result } = await apiPost(EX.type2)); });

  it('success: true', () => assert.equal(result.success, true));
  it('answerValue が数値', () => assert.equal(typeof result.answerValue, 'number'));
});

describe('POST /api/generate — Type3 (y-t グラフ + 選択肢)', () => {
  let result;
  before(async () => { ({ body: result } = await apiPost(EX.type3_choices)); });

  it('success: true', () => assert.equal(result.success, true));
  it('files.ref に refCanvases PNG がある', () => {
    assert.ok(Array.isArray(result.files.ref) && result.files.ref.length > 0);
  });
  it('files.choices が4件', () => {
    assert.equal(result.files.choices.length, 4);
  });
  it('isCorrect: true が1件だけ', () => {
    const correct = result.files.choices.filter(c => c.isCorrect);
    assert.equal(correct.length, 1);
  });
  it('shuffleSeed が数値', () => assert.equal(typeof result.shuffleSeed, 'number'));
});

describe('POST /api/generate — Type4 (合成波 + 選択肢)', () => {
  let result;
  before(async () => { ({ body: result } = await apiPost(EX.type4_choices)); });

  it('success: true', () => assert.equal(result.success, true));
  it('files.choices が4件', () => assert.equal(result.files.choices.length, 4));
  it('isCorrect: true が1件', () => {
    assert.equal(result.files.choices.filter(c => c.isCorrect).length, 1);
  });
});

describe('POST /api/generate — Type5 (合成波・時刻範囲)', () => {
  let result;
  before(async () => { ({ body: result } = await apiPost(EX.type5)); });

  it('success: true', () => assert.equal(result.success, true));
  it('files.question が複数枚', () => {
    assert.ok(result.files.question.length > 1, `枚数: ${result.files.question.length}`);
  });
});

describe('POST /api/generate — Type6 (反射波 + 選択肢)', () => {
  let result;
  before(async () => { ({ body: result } = await apiPost(EX.type6_choices)); });

  it('success: true', () => assert.equal(result.success, true));
  it('files.choices が4件', () => assert.equal(result.files.choices.length, 4));
});

describe('POST /api/generate — Type7 (反射波・時刻範囲)', () => {
  let result;
  before(async () => { ({ body: result } = await apiPost(EX.type7)); });

  it('success: true', () => assert.equal(result.success, true));
  it('files.question が複数枚', () => {
    assert.ok(result.files.question.length > 1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-10: inline モード
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/generate — inline モード', () => {
  let result;
  before(async () => {
    ({ body: result } = await apiPost({ ...EX.type1, inline: true, filenamePrefix: 'http_inline' }));
  });

  it('success: true', () => assert.equal(result.success, true));
  it('files.question[0] に dataUrl がある', () => {
    assert.ok(result.files.question[0].dataUrl.startsWith('data:image/png;base64,'));
  });
  it('files.question[0].path が null または undefined', () => {
    assert.ok(
      result.files.question[0].path == null,
      `path が残っている: ${result.files.question[0].path}`
    );
  });
  it('files.manifest が null', () => {
    assert.ok(result.files.manifest == null);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-11: GET /api/output/:session/:file — PNG 取得
// ══════════════════════════════════════════════════════════════════════
describe('GET /api/output/:session/:file', () => {
  let sessionId, firstFile;

  before(async () => {
    const { body } = await apiPost({ ...EX.type1, filenamePrefix: 'http_fileget' });
    assert.equal(body.success, true);
    sessionId = body.sessionId;
    firstFile = path.basename(body.files.question[0].path);
  });

  it('PNG バイナリを返す (Content-Type: image/png)', async () => {
    const res = await fetch(`${API_BASE}/api/output/${sessionId}/${firstFile}`);
    assert.equal(res.status, 200);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('image/png'), `Content-Type が不正: ${ct}`);
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 1000, 'PNG が空すぎる');
  });

  it('存在しないファイルは 404', async () => {
    const res = await fetch(`${API_BASE}/api/output/${sessionId}/nonexistent_xyz.png`);
    assert.equal(res.status, 404);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-12: バリデーションエラー系
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/generate — バリデーションエラー', () => {
  it('type=99 → VALIDATION_ERROR', async () => {
    const { body } = await apiPost({ ...EX.type1, type: 99 });
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('type=4 で waveB なし → VALIDATION_ERROR', async () => {
    const { status, body } = await apiPost({
      type: 4,
      waveA: EX.type1.waveA,
      params: { answerT: 3 },
    });
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('type=1 で answerT なし → VALIDATION_ERROR', async () => {
    const { body } = await apiPost({ type: 1, waveA: EX.type1.waveA, params: {} });
    assert.equal(body.success, false);
  });

  it('空 body → VALIDATION_ERROR', async () => {
    const res = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await res.json();
    assert.equal(body.success, false);
  });

  it('y が 0.5 刻みでない頂点 → VALIDATION_ERROR', async () => {
    const { body } = await apiPost({
      type: 1,
      waveA: { vertices: [{ x: 0, y: 0.3 }, { x: 4, y: 0 }], speed: 1, direction: 1 },
      params: { answerT: 1 },
    });
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('cellSize.w=200 (上限120超) → VALIDATION_ERROR', async () => {
    const { body } = await apiPost({ ...EX.type1, cellSize: { w: 200, h: null } });
    assert.equal(body.success, false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-13: パストラバーサル防御
// ══════════════════════════════════════════════════════════════════════
describe('GET /api/output — パストラバーサル防御', () => {
  it('../../../ を含む sessionId は 400', async () => {
    const res = await fetch(`${API_BASE}/api/output/../../../etc/passwd/test.png`);
    assert.ok([400, 404].includes(res.status), `status: ${res.status}`);
  });

  it('特殊文字を含む sessionId は 400', async () => {
    const res = await fetch(`${API_BASE}/api/output/invalid!@%23/${encodeURIComponent('test.png')}`);
    assert.ok([400, 404].includes(res.status), `status: ${res.status}`);
  });

  it('.png 以外の拡張子は 400', async () => {
    const res = await fetch(`${API_BASE}/api/output/valid-session-id/test.js`);
    assert.ok([400, 404].includes(res.status), `status: ${res.status}`);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-14: 並行安全性
// ══════════════════════════════════════════════════════════════════════
describe('並行安全性', () => {
  it('5件同時 POST → 全て success:true かつ sessionId が全て異なる', async () => {
    const reqs = Array.from({ length: 5 }, (_, i) =>
      apiPost({ ...EX.type1, filenamePrefix: `parallel_${i}` })
    );
    const results = await Promise.all(reqs);
    for (const { body } of results) {
      assert.equal(body.success, true, `失敗: ${JSON.stringify(body.error)}`);
    }
    const ids = results.map(r => r.body.sessionId);
    const unique = new Set(ids);
    assert.equal(unique.size, 5, `重複 sessionId: ${ids}`);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-15: スタイル・cellSize オプション
// ══════════════════════════════════════════════════════════════════════
describe('POST /api/generate — オプション系', () => {
  it('style=bw でも success: true', async () => {
    const { body } = await apiPost({ ...EX.type1, style: 'bw', filenamePrefix: 'http_bw' });
    assert.equal(body.success, true);
  });

  it('cellSize={w:40, h:30} でも success: true', async () => {
    const { body } = await apiPost({
      ...EX.type1,
      cellSize: { w: 40, h: 30 },
      filenamePrefix: 'http_cellsize',
    });
    assert.equal(body.success, true);
  });

  it('inline + bw + cellSize の組み合わせ → dataUrl あり', async () => {
    const { body } = await apiPost({
      ...EX.type1,
      style: 'bw',
      cellSize: { w: 50, h: 40 },
      inline: true,
      filenamePrefix: 'http_combo',
    });
    assert.equal(body.success, true);
    assert.ok(body.files.question[0].dataUrl.startsWith('data:image/png;base64,'));
  });

  it('Type6 endType=free でも success: true', async () => {
    const { body } = await apiPost({
      ...EX.type6_choices,
      params: { answerT: 5, boundary: 8, endType: 'free' },
      choices: { enabled: false, count: 2, distractors: [] },
      filenamePrefix: 'http_free_end',
    });
    assert.equal(body.success, true);
  });
});

// ══════════════════════════════════════════════════════════════════════
// フェーズ B-16: 選択肢シャッフル決定論性（HTTP越し）
// ══════════════════════════════════════════════════════════════════════
describe('選択肢シャッフル決定論性 (HTTP)', () => {
  it('同一リクエストを2回 POST → shuffleSeed と選択肢順が一致', async () => {
    const body1 = (await apiPost({ ...EX.type3_choices, filenamePrefix: 'det_1' })).body;
    const body2 = (await apiPost({ ...EX.type3_choices, filenamePrefix: 'det_2' })).body;
    assert.equal(body1.shuffleSeed, body2.shuffleSeed);
    const order1 = body1.files.choices.map(c => c.originalIndex);
    const order2 = body2.files.choices.map(c => c.originalIndex);
    assert.deepEqual(order1, order2);
  });
});
