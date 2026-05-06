'use strict';

const GRID_DEFAULTS = {
  xMin: 0, xMax: 10, yMin: -2, yMax: 2,
  paddingLeft: 52, paddingRight: 52, paddingTop: 32, paddingBottom: 44,
};

function resolveStyle(style, STYLE_PRESETS) {
  if (!style) return STYLE_PRESETS.gray;
  if (typeof style === 'string') {
    if (!STYLE_PRESETS[style]) {
      throw new Error(`Unknown style preset: '${style}'. Available: ${Object.keys(STYLE_PRESETS).join(', ')}`);
    }
    return STYLE_PRESETS[style];
  }
  return style;
}

function buildState(spec, sandbox) {
  const grid = { ...GRID_DEFAULTS, ...(spec.grid || {}) };
  return {
    gridConfig: grid,
    styleConfig: resolveStyle(spec.style, sandbox.STYLE_PRESETS),
    cellSize: spec.cellSize || { w: null, h: null },
    hasChoices: !!(spec.choices && spec.choices.enabled),
  };
}

function buildWave(json, sandbox) {
  if (!json) return null;
  return new sandbox.Wave().fromJSON(json);
}

function callGenerator(gen, type, spec, sandbox) {
  const waveA = buildWave(spec.waveA, sandbox);
  const waveB = buildWave(spec.waveB, sandbox);
  const p = spec.params || {};

  switch (type) {
    case 1:
      return gen.generateType1({ wave: waveA, answerT: p.answerT });
    case 2:
      return gen.generateType2({ wave: waveA, x: p.x, t: p.t });
    case 3:
      return gen.generateType3({ wave: waveA, x: p.x, tMax: p.tMax });
    case 4:
      return gen.generateType4({ waveA, waveB, answerT: p.answerT });
    case 5:
      return gen.generateType5({ waveA, waveB, tStart: p.tStart, tEnd: p.tEnd });
    case 6: {
      const choicesConfig = buildType6ChoicesConfig(spec, sandbox);
      return gen.generateType6({
        waveA, boundary: p.boundary, endType: p.endType, answerT: p.answerT,
        choicesConfig,
      });
    }
    case 7:
      return gen.generateType7({
        waveA, boundary: p.boundary, endType: p.endType,
        tStart: p.tStart, tEnd: p.tEnd,
      });
    default:
      throw new Error(`Unknown problem type: ${type}`);
  }
}

function buildType6ChoicesConfig(spec, sandbox) {
  if (!spec.choices || !spec.choices.enabled) return null;
  const distractors = (spec.choices.distractors || []).map((d) => buildWave(d, sandbox));
  return {
    enabled: true,
    count: spec.choices.count,
    source: 'manual',
    distractors,
  };
}

// Build choices for Type3/Type4 (problems.js does NOT do it for these types).
// Mirrors App._buildChoices() in js/app.js.
function attachType3Or4Choices(result, gen, spec, sandbox) {
  if (!spec.choices || !spec.choices.enabled) return;
  const type = spec.type;
  const cfg = spec.choices;
  const items = [];

  let correctCanvas;
  if (type === 3) {
    correctCanvas = gen.renderType3CorrectCanvas(buildWave(spec.waveA, sandbox), spec.params.x, spec.params.tMax);
  } else if (type === 4) {
    correctCanvas = gen.renderType4CorrectCanvas(
      buildWave(spec.waveA, sandbox),
      buildWave(spec.waveB, sandbox),
      spec.params.answerT,
    );
  } else {
    return;
  }
  if (!correctCanvas) throw new Error('Failed to render correct-choice canvas');
  items.push({ canvas: correctCanvas, isCorrect: true });

  for (const dJson of cfg.distractors || []) {
    const dWave = buildWave(dJson, sandbox);
    let canvas;
    if (type === 3) canvas = gen.renderType3DistractorCanvas(dWave, spec.params.tMax);
    else            canvas = gen.renderType4DistractorCanvas(dWave, spec.params.answerT);
    items.push({ canvas, isCorrect: false });
  }

  const seedSource = buildSeedSource(type, spec);
  const seed = sandbox.SeededRandom.hashString(seedSource);
  result.choices = { items, correctIndex: 0, seed, count: cfg.count };
}

// Mirrors App._buildChoicesSeedSource() so that the same input → same shuffle.
function buildSeedSource(type, spec) {
  const cfg = spec.choices;
  const aJson = JSON.stringify(spec.waveA);
  if (type === 3) {
    return `t3|${aJson}|x=${spec.params.x}|tMax=${spec.params.tMax}|n=${cfg.count}`;
  }
  if (type === 4) {
    const bJson = JSON.stringify(spec.waveB);
    return `t4|A=${aJson}|B=${bJson}|t=${spec.params.answerT}|n=${cfg.count}`;
  }
  if (type === 6) {
    return `t6|A=${aJson}|b=${spec.params.boundary}|e=${spec.params.endType}|t=${spec.params.answerT}|n=${cfg.count}`;
  }
  return `default|${type}|${aJson}|n=${cfg.count}`;
}

// Apply seed to set choices.seed for Type6 (problems.js builds items, not seed).
function attachType6Seed(result, spec, sandbox) {
  if (result && result.choices) {
    result.choices.seed = sandbox.SeededRandom.hashString(buildSeedSource(6, spec));
  }
}

module.exports = {
  GRID_DEFAULTS,
  resolveStyle,
  buildState,
  buildWave,
  callGenerator,
  attachType3Or4Choices,
  attachType6Seed,
  buildSeedSource,
};
