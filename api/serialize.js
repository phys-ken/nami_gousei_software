'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CIRCLED_DIGITS = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];

function newSessionId(now = new Date()) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_` +
             `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = crypto.randomBytes(3).toString('hex');
  return `${ts}_${rand}`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function saveCanvasPng(canvas, outPath) {
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buf);
  return { path: outPath, bytes: buf.length };
}

function canvasToDataUrl(canvas) {
  return canvas.toDataURL('image/png');
}

function applyShuffle(items, seed, sandbox) {
  const indices = sandbox.SeededRandom.seededShuffleIndices(items.length, seed);
  const shuffled = indices.map((origIdx) => ({ ...items[origIdx], originalIndex: origIdx }));
  return { shuffled, indices };
}

/**
 * Convert a generator result + spec into the API response shape.
 * Writes PNG files (or returns dataURLs when inline=true) and returns the JSON-safe response.
 */
function buildResponse({ result, spec, sandbox, sessionDir, sessionId, prefix, inline, gridConfig }) {
  const writeOrInline = (canvas, basename) => {
    if (inline) {
      return { dataUrl: canvasToDataUrl(canvas) };
    }
    const outPath = path.join(sessionDir, `${prefix}${basename}.png`);
    saveCanvasPng(canvas, outPath);
    return { path: outPath };
  };

  const questionFiles = (result.questionCanvases || []).map((c, i) => writeOrInline(c, `_question_${i + 1}`));
  const answerFiles   = (result.answerCanvases   || []).map((c, i) => writeOrInline(c, `_answer_${i + 1}`));
  const refFiles      = (result.refCanvases      || []).map((c, i) => writeOrInline(c, `_ref_${i + 1}`));

  let choiceFiles = null;
  let shuffleSeed = null;
  if (result.choices) {
    shuffleSeed = result.choices.seed;
    const wantShuffle = spec.choices?.shuffle !== false;
    const baseItems = result.choices.items.map((it, i) => ({ ...it, originalIndex: i }));
    const finalItems = wantShuffle
      ? applyShuffle(baseItems, shuffleSeed, sandbox).shuffled
      : baseItems;

    choiceFiles = finalItems.map((item, displayIdx) => {
      const target = writeOrInline(item.canvas, `_choice_${displayIdx + 1}${item.isCorrect ? '_correct' : ''}`);
      return {
        ...target,
        isCorrect: !!item.isCorrect,
        label: CIRCLED_DIGITS[displayIdx] || `(${displayIdx + 1})`,
        originalIndex: item.originalIndex,
      };
    });
  }

  const response = {
    success: true,
    type: spec.type,
    sessionId,
    outputDir: inline ? null : sessionDir,
    gridConfig: gridConfig || null,
    questionText: result.questionText || null,
    answerText: result.answerText || null,
    answerValue: result.answerValue ?? null,
    files: {
      question: questionFiles,
      answer: answerFiles,
      ref: refFiles,
      choices: choiceFiles,
    },
    shuffleSeed,
    warnings: [],
  };

  if (!inline) {
    const manifestPath = path.join(sessionDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ request: spec, response }, null, 2));
    response.files.manifest = manifestPath;
  }
  return response;
}

module.exports = {
  newSessionId,
  ensureDir,
  saveCanvasPng,
  canvasToDataUrl,
  applyShuffle,
  buildResponse,
  CIRCLED_DIGITS,
};
