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
  if (json.sineMode) return new sandbox.SineWave().fromJSON(json);
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
    case 3: {
      const params3 = { wave: waveA, x: p.x, tMax: p.tMax };
      if (waveB && !waveB.isEmpty()) params3.waveB = waveB;
      if (p.boundary !== undefined && p.endType !== undefined) {
        params3.boundary = p.boundary;
        params3.endType = p.endType;
      }
      return gen.generateType3(params3);
    }
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
    const opts3 = {};
    if (spec.waveB) {
      const wB3 = buildWave(spec.waveB, sandbox);
      if (wB3 && !wB3.isEmpty()) opts3.waveB = wB3;
    }
    if (spec.params.boundary !== undefined) opts3.boundary = spec.params.boundary;
    if (spec.params.endType !== undefined) opts3.endType = spec.params.endType;
    correctCanvas = gen.renderType3CorrectCanvas(buildWave(spec.waveA, sandbox), spec.params.x, spec.params.tMax, opts3);
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
    const bJson3 = spec.waveB ? JSON.stringify(spec.waveB) : '';
    const bStr3 = bJson3 ? `|B=${bJson3}` : '';
    const rStr3 = (spec.params.boundary !== undefined) ? `|b=${spec.params.boundary}|e=${spec.params.endType}` : '';
    return `t3|${aJson}|x=${spec.params.x}|tMax=${spec.params.tMax}|n=${cfg.count}${bStr3}${rStr3}`;
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

/**
 * y 軸範囲を自動調整する。
 * spec.grid に yMin / yMax が明示されていない場合のみ実行し、
 * 合成波の最大変位 + 1 を対称な上下限として state.gridConfig を上書きする。
 */
function autoAdjustYRange(spec, state, sandbox) {
  // yMin または yMax が明示指定されていたらスキップ
  if (spec.grid && (spec.grid.yMin !== undefined || spec.grid.yMax !== undefined)) return;

  const waveA = buildWave(spec.waveA, sandbox);
  if (!waveA || waveA.isEmpty()) return;

  const { xMin, xMax } = state.gridConfig;
  let maxY;

  if (spec.type === 6 || spec.type === 7) {
    // 反射波モード: 頂点最大振幅 × 2（構成的干渉の最悪ケース）
    maxY = waveA.getMaxAmplitude() * 2;
  } else {
    const waveB = spec.waveB ? buildWave(spec.waveB, sandbox) : null;
    const hasB  = waveB && !waveB.isEmpty();
    const tMax  = (xMax - xMin) * 2;
    const tStep = 0.25;
    const xStep = 0.25;
    maxY = 0;

    for (let t = 0; t <= tMax; t += tStep) {
      for (let x = xMin; x <= xMax; x += xStep) {
        const yA  = waveA.getYAtTime(x, t);
        const yB  = hasB ? waveB.getYAtTime(x, t) : 0;
        const abs = Math.abs(yA + yB);
        if (abs > maxY) maxY = abs;
      }
    }
  }

  if (maxY === 0) return;
  const newBound = Math.ceil(maxY) + 1;
  state.gridConfig.yMin = -newBound;
  state.gridConfig.yMax =  newBound;
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
  autoAdjustYRange,
};
