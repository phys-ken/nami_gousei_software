'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { buildSandbox } = require('./sandbox-stubs');
const { loadAllJsModules } = require('./loader');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(PROJECT_ROOT, 'js');

console.log('[smoke] Project root:', PROJECT_ROOT);
console.log('[smoke] Loading js/ modules into sandbox...');

const sandbox = buildSandbox();
loadAllJsModules(sandbox, JS_DIR);

const required = ['Wave', 'SeededRandom', 'STYLE_PRESETS', 'WaveRenderer', 'ProblemGenerator'];
for (const name of required) {
  if (!sandbox[name]) {
    console.error(`[smoke] MISSING global: ${name}`);
    process.exit(1);
  }
  console.log(`[smoke] OK ${name} (${typeof sandbox[name]})`);
}

console.log('\n[smoke] Building a simple Type1 problem...');
const { Wave, ProblemGenerator, STYLE_PRESETS } = sandbox;

const waveA = new Wave().fromJSON({
  vertices: [
    { x: 0, y: 0 },
    { x: 1, y: 0.5 },
    { x: 2, y: 1 },
    { x: 3, y: 0.5 },
    { x: 4, y: 0 },
  ],
  speed: 1,
  direction: 1,
  label: 'A',
});

const gen = new ProblemGenerator({
  gridConfig: {
    xMin: 0, xMax: 10, yMin: -2, yMax: 2,
    paddingLeft: 40, paddingRight: 20, paddingTop: 20, paddingBottom: 40,
  },
  styleConfig: STYLE_PRESETS.gray,
  cellSize: { w: null, h: null },
});

const result = gen.generateType1({ wave: waveA, answerT: 3 });
console.log('[smoke] questionText:', result.questionText);
console.log('[smoke] answerCanvases length:', result.answerCanvases.length);

const outDir = path.join(PROJECT_ROOT, 'api_output', 'smoke');
fs.mkdirSync(outDir, { recursive: true });
const png = result.answerCanvases[0].toBuffer('image/png');
const outPath = path.join(outDir, 'type1_t3.png');
fs.writeFileSync(outPath, png);
console.log('[smoke] Wrote:', outPath, `(${png.length} bytes)`);

console.log('\n[smoke] All Phase A/B checks passed.');

// ── 正弦波スモークテスト（Phase 7） ────────────────────────────────────
console.log('\n[smoke] Building SineWave Type1 problem (continuous)...');
if (!sandbox.SineWave) {
  console.error('[smoke] MISSING global: SineWave');
  process.exit(1);
}
console.log('[smoke] OK SineWave (${typeof sandbox.SineWave})'.replace('${typeof sandbox.SineWave}', typeof sandbox.SineWave));

const { SineWave } = sandbox;

const sineA = new SineWave().fromJSON({
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 0, waveType: 'continuous' },
  speed: 1, direction: 1, label: 'A',
});

const genSine = new ProblemGenerator({
  gridConfig: { xMin: 0, xMax: 10, yMin: -2, yMax: 2 },
  styleConfig: STYLE_PRESETS.gray,
  cellSize: { w: null, h: null },
});

const r1 = genSine.generateType1({ wave: sineA, answerT: 3 });
console.log('[smoke] SineWave Type1 questionText:', r1.questionText);
console.log('[smoke] SineWave Type1 answerCanvases:', r1.answerCanvases.length);
const p1 = path.join(outDir, 'sine_type1.png');
fs.writeFileSync(p1, r1.answerCanvases[0].toBuffer('image/png'));
console.log('[smoke] Wrote:', p1);

console.log('\n[smoke] Building SineWave Type4 problem (A+B sine)...');
const sineB = new SineWave().fromJSON({
  sineConfig: { amplitude: 1, wavelength: 4, phaseShift: 2, waveType: 'continuous' },
  speed: 1, direction: -1, label: 'B',
});
const r4 = genSine.generateType4({ waveA: sineA, waveB: sineB, answerT: 3 });
console.log('[smoke] SineWave Type4 answerCanvases:', r4.answerCanvases.length);
const p4 = path.join(outDir, 'sine_type4.png');
fs.writeFileSync(p4, r4.answerCanvases[0].toBuffer('image/png'));
console.log('[smoke] Wrote:', p4);

console.log('\n[smoke] All sine wave checks passed.');
