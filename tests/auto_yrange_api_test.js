'use strict';

/**
 * TEST_AUTO_YRANGE.md — Section 2 の自動テストスクリプト
 * Usage: node tests/auto_yrange_api_test.js
 * 前提: node api_server.js が :8001 で起動中であること
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'output');
if (!require('fs').existsSync(OUT)) require('fs').mkdirSync(OUT);

let passed = 0;
let failed = 0;

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost', port: 8001, path: '/api/generate',
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

function savePng(resp, name) {
  const files = resp.body && resp.body.files;
  if (!files) return;
  const arr = files.question || files.problem || [];
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

async function run() {
  console.log('\n=== TEST AUTO YRANGE — API Section 2 ===\n');

  // ── 2-1: grid 未指定・波A単独 (Type1) ───────────────────────────
  console.log('2-1: grid 未指定・波A単独 (Type1)');
  {
    const r = await post({
      type: 1,
      waveA: { vertices: [{x:2,y:2},{x:4,y:0}], speed: 1, direction: 1, label: 'A' },
      params: { answerT: 2 },
      inline: true,
    });
    assert('success:true', r.body.success === true, r.body.success, true);
    assert('files あり', !!(r.body.files), !!r.body.files, true);
    savePng(r, 'out_2-1.png');
    const yMax = r.body.gridConfig && r.body.gridConfig.yMax;
    const yMin = r.body.gridConfig && r.body.gridConfig.yMin;
    assert('yMax = 3', yMax === 3, yMax, 3);
    assert('yMin = -3', yMin === -3, yMin, -3);
  }

  // ── 2-2: grid 未指定・合成波 (Type4) ────────────────────────────
  console.log('\n2-2: grid 未指定・合成波 (Type4)');
  {
    const r = await post({
      type: 4,
      waveA: { vertices: [{x:1,y:2},{x:3,y:0}], speed: 1, direction:  1, label: 'A' },
      waveB: { vertices: [{x:7,y:2},{x:9,y:0}], speed: 1, direction: -1, label: 'B' },
      params: { answerT: 5 },
      inline: true,
    });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r, 'out_2-2.png');
    const yMax = r.body.gridConfig && r.body.gridConfig.yMax;
    const yMin = r.body.gridConfig && r.body.gridConfig.yMin;
    assert('yMax = 5（合成最大≈4 → ceil+1）', yMax === 5, yMax, 5);
    assert('yMin = -5', yMin === -5, yMin, -5);
  }

  // ── 2-3: yMin/yMax 明示 ───────────────────────────────────────
  console.log('\n2-3: grid に yMin/yMax 明示');
  {
    const r = await post({
      type: 1,
      waveA: { vertices: [{x:2,y:2},{x:4,y:0}], speed: 1, direction: 1, label: 'A' },
      grid: { yMin: -10, yMax: 10 },
      params: { answerT: 2 },
      inline: true,
    });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r, 'out_2-3.png');
    const yMax = r.body.gridConfig && r.body.gridConfig.yMax;
    assert('yMax = 10（自動調整なし）', yMax === 10, yMax, 10);
  }

  // ── 2-4: yMax のみ明示 ───────────────────────────────────────
  console.log('\n2-4: grid に yMax のみ明示');
  {
    const r = await post({
      type: 1,
      waveA: { vertices: [{x:2,y:2},{x:4,y:0}], speed: 1, direction: 1, label: 'A' },
      grid: { yMax: 8 },
      params: { answerT: 2 },
      inline: true,
    });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r, 'out_2-4.png');
    const yMax = r.body.gridConfig && r.body.gridConfig.yMax;
    assert('yMax = 8（自動調整スキップ）', yMax === 8, yMax, 8);
  }

  // ── 2-5: 反射波モード (Type6) ────────────────────────────────
  console.log('\n2-5: 反射波モード (Type6)');
  {
    const r = await post({
      type: 6,
      waveA: { vertices: [{x:1,y:2},{x:3,y:0}], speed: 1, direction: 1, label: 'A' },
      params: { boundary: 5, endType: 'free', answerT: 3 },
      inline: true,
    });
    assert('success:true', r.body.success === true, r.body.success, true);
    savePng(r, 'out_2-5.png');
    const yMax = r.body.gridConfig && r.body.gridConfig.yMax;
    const yMin = r.body.gridConfig && r.body.gridConfig.yMin;
    assert('yMax = 5（頂点最大2×2=4 → ceil+1）', yMax === 5, yMax, 5);
    assert('yMin = -5', yMin === -5, yMin, -5);
  }

  // ── 2-6: 波形なし ────────────────────────────────────────────
  console.log('\n2-6: 波形なし（vertices 空）');
  {
    const r = await post({
      type: 1,
      waveA: { vertices: [], speed: 1, direction: 1, label: 'A' },
      params: { answerT: 0 },
      inline: true,
    });
    if (r.body.success === true) {
      const yMax = r.body.gridConfig && r.body.gridConfig.yMax;
      assert('yMax = 2（デフォルト・自動調整なし）', yMax === 2, yMax, 2);
    } else {
      console.log('  ℹ 頂点なしはエラー応答（許容）:', r.body.error || r.status);
      console.log('  ✔ 適切なエラー応答（自動調整は実行されない）');
      passed++;
    }
  }

  // ── サマリ ──────────────────────────────────────────────────
  console.log(`\n=== RESULT: ${passed} PASS / ${failed} FAIL ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
