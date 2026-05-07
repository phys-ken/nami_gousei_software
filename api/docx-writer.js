'use strict';

const { Document, Packer, Paragraph, TextRun, ImageRun } = require('docx');
const { CIRCLED_DIGITS } = require('./serialize');

function _imgParagraph(canvas) {
  const data = canvas.toBuffer('image/png');
  const w = Math.round(canvas.width / 2);
  const h = Math.round(canvas.height / 2);
  return new Paragraph({
    children: [new ImageRun({ data, transformation: { width: w, height: h }, type: 'png' })],
    spacing: { before: 80, after: 80 },
  });
}

function _textParagraphs(text, opts = {}) {
  const { bold = false, size = 22, italics = false } = opts;
  return (text || '').split('\n').map(line =>
    new Paragraph({
      children: [new TextRun({ text: line || ' ', bold, size, italics })],
      spacing: { after: 60 },
    })
  );
}

function _heading(label) {
  return new Paragraph({
    children: [new TextRun({ text: label, bold: true, size: 28 })],
    spacing: { before: 320, after: 160 },
  });
}

/**
 * 問題・解答・解説を含む Word 文書を Buffer として生成する
 *
 * @param {object} result            - ProblemGenerator の返り値（questionCanvases 等）
 * @param {object} opts
 * @param {Array}  opts.shuffledChoices  - シャッフル済みの選択肢配列 [{canvas, isCorrect, ...}]
 * @param {number|null} opts.correctNewIndex - シャッフル後の正答インデックス
 * @returns {Promise<Buffer>}
 */
async function generateDocxBuffer(result, { shuffledChoices = null, correctNewIndex = null } = {}) {
  const children = [];

  const mainAnswerCanvases = result.refCanvases?.length
    ? (result.answerCanvases || []).slice(0, 1)
    : (result.answerCanvases || []);

  // 【問題】
  children.push(_heading('【問題】'));
  children.push(..._textParagraphs(result.questionText || ''));
  for (const c of (result.questionCanvases || [])) children.push(_imgParagraph(c));

  // 【選択肢】
  if (shuffledChoices?.length) {
    children.push(_heading('【選択肢】'));
    shuffledChoices.forEach((item, i) => {
      children.push(new Paragraph({
        children: [new TextRun({ text: CIRCLED_DIGITS[i] || `(${i + 1})`, bold: true, size: 22 })],
        spacing: { before: 120, after: 40 },
      }));
      children.push(_imgParagraph(item.canvas));
    });
  }

  // 【解答】
  children.push(_heading('【解答】'));
  if (shuffledChoices && correctNewIndex !== null) {
    const label = CIRCLED_DIGITS[correctNewIndex] || `(${correctNewIndex + 1})`;
    children.push(..._textParagraphs(`正答: 選択肢 ${label}`));
  } else {
    children.push(..._textParagraphs(result.answerText || ''));
    for (const c of mainAnswerCanvases) children.push(_imgParagraph(c));
  }

  // 【解説】（refCanvases がある場合）
  if (result.refCanvases?.length) {
    children.push(_heading(result.refSectionTitle || '【解説】'));
    if (result.refSectionNote) {
      children.push(..._textParagraphs(result.refSectionNote, { italics: true, size: 18 }));
    }
    for (const c of result.refCanvases) children.push(_imgParagraph(c));
  }

  const doc = new Document({
    creator: '波の合成 問題作成ツール',
    sections: [{ children }],
  });
  return await Packer.toBuffer(doc);
}

module.exports = { generateDocxBuffer };
