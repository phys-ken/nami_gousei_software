'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_URL = 'http://localhost:8001/api/generate';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'api_output', 'test_fonts');

const waveA = {
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
};

const waveB = {
  vertices: [
    { x: 6, y: 0 },
    { x: 7, y: -0.5 },
    { x: 8, y: -1 },
    { x: 9, y: -0.5 },
    { x: 10, y: 0 },
  ],
  speed: 1,
  direction: -1,
  label: 'B',
};

// Type 3のdistractor
const distractorsType3 = [
  { vertices: [{x:0, y:0}, {x:2, y:1}, {x:4, y:0}, {x:6, y:-1}], speed: 0, direction: 1 },
  { vertices: [{x:0, y:0}, {x:2, y:-1}, {x:4, y:0}, {x:6, y:1}], speed: 0, direction: 1 },
  { vertices: [{x:0, y:-1}, {x:2, y:0}, {x:4, y:1}, {x:6, y:0}], speed: 0, direction: 1 },
];

async function generate(spec, label) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(`[Error] Failed to generate ${label}:`, err);
      return;
    }

    const data = await res.json();
    if (data.success && data.files) {
      // 質問画像と選択肢（存在すれば）を保存
      if (data.files.question && data.files.question.length > 0) {
        saveImage(data.files.question[0].dataUrl, `${label}_question.png`);
      }
      if (data.files.choices && Array.isArray(data.files.choices)) {
        data.files.choices.forEach((choice, idx) => {
          saveImage(choice.dataUrl, `${label}_choice_${idx + 1}_correct_${choice.isCorrect}.png`);
        });
      }
      if (data.files.answer && data.files.answer.length > 0) {
        saveImage(data.files.answer[0].dataUrl, `${label}_answer.png`);
      }
      console.log(`[Success] Generated: ${label}`);
    } else {
      console.error(`[Error] No files returned for ${label}`, data);
    }
  } catch (e) {
    console.error(`[Error] Request failed for ${label}:`, e.message);
  }
}

function saveImage(dataUrl, filename) {
  const base64 = dataUrl.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');
  const outPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outPath, buffer);
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('--- Font Size API test runner ---');

  const fontSizes = [8, 12, 24];

  for (const size of fontSizes) {
    console.log(`\nGenerating tests for fontSize: ${size}px`);

    // 1. Type 1 (Single wave at t)
    await generate({
      type: 1,
      grid: { xMin: 0, xMax: 10, yMin: -2, yMax: 2, fontSize: size },
      cellSize: { w: null, h: null },
      style: 'gray',
      waveA,
      params: { answerT: 3 },
      inline: true
    }, `Type1_${size}px`);

    // 2. Type 3 (y-t graph at x) with choices
    await generate({
      type: 3,
      grid: { xMin: 0, xMax: 10, yMin: -2, yMax: 2, fontSize: size },
      cellSize: { w: null, h: null },
      style: 'gray',
      waveA,
      params: { x: 3, tMax: 6 },
      choices: {
        enabled: true,
        count: 4,
        distractors: distractorsType3,
      },
      inline: true
    }, `Type3_${size}px`);

    // 3. Type 4 (Superposition wave at t)
    await generate({
      type: 4,
      grid: { xMin: 0, xMax: 10, yMin: -2, yMax: 2, fontSize: size },
      cellSize: { w: null, h: null },
      style: 'gray',
      waveA,
      waveB,
      params: { answerT: 2 },
      inline: true
    }, `Type4_${size}px`);

    // 4. Type 6 (Reflection wave at t, choices)
    await generate({
      type: 6,
      grid: { xMin: 0, xMax: 10, yMin: -2, yMax: 2, fontSize: size },
      cellSize: { w: null, h: null },
      style: 'gray',
      waveA,
      params: { answerT: 3, boundary: 6, endType: 'fixed' },
      choices: {
        enabled: true,
        count: 4,
        distractors: distractorsType3, // ダミー
      },
      inline: true
    }, `Type6_${size}px`);
  }

  console.log('\n--- Generating qualitative preset tests ---');
  // 5. Type 3 Qualitative (no ticks, no units, no timeLabel)
  await generate({
    type: 3,
    grid: {
      xMin: 0, xMax: 10, yMin: -2, yMax: 2, fontSize: 12,
      showGrid: false,
      showAxes: true,
      showZeroLine: true,
      showTicksY: false,
      showTicksX: false,
      showUnitY: false,
      showUnitX: false,
      showTimeLabel: false
    },
    cellSize: { w: null, h: null },
    style: 'gray',
    waveA,
    params: { x: 3, tMax: 6 },
    choices: {
      enabled: true,
      count: 4,
      distractors: distractorsType3,
    },
    inline: true
  }, 'Type3_Qualitative');

  // 6. Type 3 Qualitative with Grid
  await generate({
    type: 3,
    grid: {
      xMin: 0, xMax: 10, yMin: -2, yMax: 2, fontSize: 12,
      showGrid: true,
      showAxes: true,
      showZeroLine: true,
      showTicksY: false,
      showTicksX: false,
      showUnitY: false,
      showUnitX: false,
      showTimeLabel: false
    },
    cellSize: { w: null, h: null },
    style: 'gray',
    waveA,
    params: { x: 3, tMax: 6 },
    choices: {
      enabled: true,
      count: 4,
      distractors: distractorsType3,
    },
    inline: true
  }, 'Type3_QualitativeGrid');

  console.log('\n--- All generations finished. Please check api_output/test_fonts/ ---');
}

run();
