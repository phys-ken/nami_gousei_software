/**
 * Exporter - PNG / PDF / ZIP ダウンロード
 * jsPDF（window.jspdf）と JSZip（window.JSZip）に依存
 */
class Exporter {
  /**
   * 日本語テキストを Canvas に描画して返す（PDF埋め込み用）
   * @param {string} text      改行 \n 対応
   * @param {Object} opts      { fontSize, bold }
   */
  static _textCanvas(text, { fontSize = 12, bold = false } = {}) {
    const PR = 2;
    const canvasW = 1160; // 波形 Canvas と同幅に揃える
    const fontPx  = fontSize * PR;
    const weight  = bold ? 'bold' : 'normal';
    const family  = "'Hiragino Kaku Gothic Pro', 'Meiryo', 'Yu Gothic', sans-serif";
    const font    = `${weight} ${fontPx}px ${family}`;
    const lineH   = Math.ceil(fontPx * 1.65);

    // テキスト折り返し計算（幅超過でラップ）
    const tmp = document.createElement('canvas');
    tmp.width = canvasW; tmp.height = 1;
    const tc = tmp.getContext('2d');
    tc.font = font;

    const wrapped = [];
    for (const raw of text.split('\n')) {
      if (!raw) { wrapped.push(''); continue; }
      if (tc.measureText(raw).width <= canvasW - 4) {
        wrapped.push(raw);
      } else {
        let line = '';
        for (const ch of [...raw]) {
          if (tc.measureText(line + ch).width > canvasW - 4) {
            wrapped.push(line); line = ch;
          } else {
            line += ch;
          }
        }
        if (line) wrapped.push(line);
      }
    }

    const h = Math.max(wrapped.length * lineH + 8, 2);
    const canvas = document.createElement('canvas');
    canvas.width  = canvasW;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, h);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = font;
    ctx.textBaseline = 'top';
    wrapped.forEach((line, i) => {
      if (line) ctx.fillText(line, 0, i * lineH + 4);
    });
    return canvas;
  }

  /**
   * Canvas を PNG としてダウンロード
   */
  static downloadCanvasPNG(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename || 'wave.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * PDF を生成してダウンロード
   * テキストは Canvas 画像として埋め込み、日本語を正しく表示する
   *
   * @param {string} title - PDFのタイトル
   * @param {Array} sections - [{ label, text, canvases, note }]
   * @param {string} filename - ダウンロードファイル名
   */
  static async generatePDF(title, sections, filename) {
    if (!window.jspdf) {
      alert('jsPDF ライブラリが読み込まれていません。インターネット接続を確認してください。');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageW    = doc.internal.pageSize.getWidth();
    const pageH    = doc.internal.pageSize.getHeight();
    const margin   = 14;
    const contentW = pageW - margin * 2;
    let curY = 14;

    const checkNewPage = (needed) => {
      if (curY + needed > pageH - 14) {
        doc.addPage();
        curY = 14;
      }
    };

    // テキスト Canvas を PDF に画像として埋め込む共通ヘルパー
    const embedText = (text, opts = {}) => {
      if (!text) return;
      const cvs     = Exporter._textCanvas(text, opts);
      const imgData = cvs.toDataURL('image/png');
      const imgH    = contentW * (cvs.height / cvs.width);
      checkNewPage(imgH + 2);
      doc.addImage(imgData, 'PNG', margin, curY, contentW, imgH);
      curY += imgH + 2;
    };

    // タイトル
    embedText(title, { fontSize: 15, bold: true });
    curY += 1;

    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.line(margin, curY, pageW - margin, curY);
    curY += 5;

    for (const section of sections) {
      // セクションラベル
      if (section.label) {
        checkNewPage(10);
        embedText(section.label, { fontSize: 11, bold: true });
      }

      // テキスト（改行対応・日本語）
      if (section.text) {
        checkNewPage(8);
        embedText(section.text, { fontSize: 10 });
      }

      // Canvas 画像（波形グラフなど）
      if (section.canvases && section.canvases.length > 0) {
        for (const canvas of section.canvases) {
          const imgData = canvas.toDataURL('image/png');
          const ratio   = canvas.height / canvas.width;
          const imgW    = contentW;
          const imgH    = imgW * ratio;
          checkNewPage(imgH + 4);
          doc.addImage(imgData, 'PNG', margin, curY, imgW, imgH);
          curY += imgH + 4;
        }
      }

      // 補足ノート
      if (section.note) {
        checkNewPage(8);
        embedText(section.note, { fontSize: 9 });
      }

      curY += 4;
    }

    doc.save(filename || 'wave.pdf');
  }

  /**
   * 複数の Canvas を ZIP にまとめてダウンロード
   *
   * @param {Object} imageMap - { 'filename.png': Canvas, ... }
   * @param {string} filename - ZIPファイル名
   */
  static async generateZIP(imageMap, filename) {
    if (!window.JSZip) {
      alert('JSZip ライブラリが読み込まれていません。インターネット接続を確認してください。');
      return;
    }
    const zip = new JSZip();
    for (const [name, canvas] of Object.entries(imageMap)) {
      const dataURL = canvas.toDataURL('image/png');
      const base64  = dataURL.split(',')[1];
      zip.file(name, base64, { base64: true });
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.download = filename || 'wave_images.zip';
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }
}
