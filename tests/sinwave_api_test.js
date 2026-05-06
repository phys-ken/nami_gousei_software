'use strict';

/**
 * 正弦波モード E2E API テストスクリプト（Phase 7）
 * Usage: node tests/sinwave_api_test.js
 * 前提: node api_server.js が :8001 で起動中であること
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'output');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const API_PORT = parseInt(process.env.WAVE_API_PORT || '8001', 10);

let passed = 0;
let failed = 0;

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: API_PORT, path: '/api/generate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { reject(new Error('JSON parse error: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function savePng(body, name) {
  const files = body && body.files;
  if (!files) return;
  const arr = files.question || files.answer || [];
  const first = Array.isArray(arr) ? arr[0] : arr;
  if (first && first.dataUrl) {
    const b64 = first.dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(path.join(OUT, name), Buffer.from(b64, 'base64'));
    console.log(`  → ${name} saved`);
  }
}

function assert(label, cond, actual, expected) {
  if (cond) {
    console.log(`  ✔ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}  (got: ${JSON.stringify(actual)}, expected: ${JSON.stringify(expected)})`);
    failed++;
  }
}

const SINE_A = {
  sineMode: true,
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 0, waveType: 'continuous' },
  speed: 1, direction: 1, label: 'A',
};
const SINE_A_PROG = {
  sineMode: true,
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 0, waveType: 'progressive', x0: 0 },
  speed: 1, direction: 1, label: 'A',
};
const SINE_B = {
  sineMode: true,
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 2, waveType: 'continuous' },
  speed: 1, direction: -1, label: 'B',
};

async function run() {
  console.log('\n=== SINE WAVE API E2E TESTS ===\n');

  // ── S-1: Type 1 + 連続正弦波 ──────────────────────────────────────
  console.log('S-1: Type 1 + 連続正弦波 (continuous)');
  {
    const r = await post({ type: 1, waveA: SINE_A, params: { answerT: 3 }, inline: true });
    assert('success:true', r.body.success === true, r.body.success, true);
    assert('statusCode 200', r.status === 200, r.status, 200);
    assert('files.question あり', !!(r.body.files && r.body.files.question), true, true);
    savePng(r.body, 'sine_s1_type1_cont.png');
  }

  // ── S-2: Type 1 + 先頭あり正弦波 ─────────────────────────────────
  console.log('\nS-2: Type 1 + 先頭あり正弦波 (progressive)');
  {
    const r = await post({ type: 1, waveA: SINE_A_PROG, params: { answerT: 3 }, inline: true });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r.body, 'sine_s2_type1_prog.png');
  }

  // ── S-3: Type 4 + waveA/B 両方正弦波 ─────────────────────────────
  console.log('\nS-3: Type 4 + waveA/B 両方正弦波');
  {
    const r = await post({ type: 4, waveA: SINE_A, waveB: SINE_B, params: { answerT: 3 }, inline: true });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r.body, 'sine_s3_type4_both.png');
  }

  // ── S-4: Type 4 + waveA 正弦波、waveB 折れ線（混在） ────────────
  console.log('\nS-4: Type 4 + waveA 正弦波 + waveB 折れ線（混在）');
  {
    const VERTEX_B = { vertices: [{ x: 6, y: 0 }, { x: 8, y: -1 }, { x: 10, y: 0 }], speed: 1, direction: -1 };
    const r = await post({ type: 4, waveA: SINE_A, waveB: VERTEX_B, params: { answerT: 3 }, inline: true });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r.body, 'sine_s4_type4_mixed.png');
  }

  // ── S-5: Type 6 + 正弦波 + 固定端反射 ────────────────────────────
  console.log('\nS-5: Type 6 + 正弦波 + 固定端反射');
  {
    const r = await post({ type: 6, waveA: SINE_A, params: { answerT: 3, boundary: 8, endType: 'fixed' }, inline: true });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r.body, 'sine_s5_type6_fixed.png');
  }

  // ── S-6: yMax 自動調整（振幅3の正弦波 → yMax >= 4） ──────────────
  console.log('\nS-6: yMax 自動調整（振幅3）');
  {
    const SINE_AMP3 = {
      sineMode: true,
      sineConfig: { amplitude: 3, wavelength: 4, phaseShift: 0, waveType: 'continuous' },
      speed: 1, direction: 1,
    };
    const r = await post({ type: 1, waveA: SINE_AMP3, params: { answerT: 3 }, inline: true });
    assert('success:true', r.body.success === true, r.body.success, true);
    const yMax = r.body.gridConfig && r.body.gridConfig.yMax;
    assert('yMax >= 4', yMax >= 4, yMax, '>= 4');
  }

  // ── S-7: sineMode=true で sineConfig なし → バリデーションエラー ──
  console.log('\nS-7: sineMode=true で sineConfig なし → 400');
  {
    const r = await post({ type: 1, waveA: { sineMode: true, speed: 1, direction: 1 }, params: { answerT: 3 } });
    assert('statusCode 400', r.status === 400, r.status, 400);
    assert('error あり', !!(r.body.error), !!r.body.error, true);
  }

  // ── 結果 ────────────────────────────────────────────────────────
  console.log(`\n=== 結果: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch(err => { console.error('[FATAL]', err); process.exit(2); });
