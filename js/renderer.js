/**
 * WaveRenderer - HTML5 Canvas への波形・グリッド描画
 *
 * pixelRatio: 1 = 画面表示用、2 = 印刷・PDF 出力用（2x 高解像度）
 * 白黒印刷対応（実線・破線・太線で区別）
 */
class WaveRenderer {
  // ── デフォルト定数（cellSize 未指定時の Canvas 寸法）─────────────────
  static DEFAULT_DISP_W = 580;
  static DEFAULT_DISP_H = 200;
  static DEFAULT_PADDING = { left: 52, right: 52, top: 32, bottom: 44 };
  // cellSize の許容範囲（極端値で文字が重なるのを防ぐ）
  static CELL_PX_MIN = 15;
  static CELL_PX_MAX = 120;

  /**
   * gridConfig と cellSize から Canvas の論理寸法を計算する
   *
   * cellSize.w / cellSize.h が null/undefined/0 のとき → デフォルト寸法を返す
   * 指定があるときは (range * cellPx + padding) で算出
   *
   * @param {Object} gridConfig { xMin, xMax, yMin, yMax }
   * @param {Object} [cellSize] { w, h } 各々 null=自動
   * @param {Object} [padding]  { left, right, top, bottom } 省略時は DEFAULT_PADDING
   * @returns {{ width: number, height: number }} 論理ピクセル
   */
  static computeCanvasSize(gridConfig, cellSize, padding) {
    const cs  = cellSize || {};
    const pad = padding  || WaveRenderer.DEFAULT_PADDING;
    const xRange = gridConfig.xMax - gridConfig.xMin;
    const yRange = gridConfig.yMax - gridConfig.yMin;

    const width  = (cs.w && cs.w > 0)
      ? Math.round(xRange * cs.w + pad.left + pad.right)
      : WaveRenderer.DEFAULT_DISP_W;
    const height = (cs.h && cs.h > 0)
      ? Math.round(yRange * cs.h + pad.top + pad.bottom)
      : WaveRenderer.DEFAULT_DISP_H;

    return { width, height };
  }

  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    const pr = config.pixelRatio || 1;
    this.pixelRatio    = pr;
    this.logicalWidth  = canvas.width  / pr;
    this.logicalHeight = canvas.height / pr;

    if (pr !== 1) {
      this.ctx.scale(pr, pr);
    }

    this.config = Object.assign({
      xMin: 0,  xMax: 10,
      yMin: -2, yMax: 2,
      paddingLeft:   52,
      paddingRight:  52,
      paddingTop:    32,
      paddingBottom: 44,
    }, config);
  }

  updateConfig(config) {
    Object.assign(this.config, config);
    this.logicalWidth  = this.canvas.width  / this.pixelRatio;
    this.logicalHeight = this.canvas.height / this.pixelRatio;
  }

  /** ワールド座標 → 論理ピクセル */
  toPixel(x, y) {
    const c = this.config;
    const W = this.logicalWidth  - c.paddingLeft - c.paddingRight;
    const H = this.logicalHeight - c.paddingTop  - c.paddingBottom;
    return {
      px: c.paddingLeft + (x - c.xMin) / (c.xMax - c.xMin) * W,
      py: c.paddingTop  + (c.yMax - y) / (c.yMax - c.yMin) * H,
    };
  }

  /** 論理ピクセル → ワールド座標 */
  toWorld(px, py) {
    const c = this.config;
    const W = this.logicalWidth  - c.paddingLeft - c.paddingRight;
    const H = this.logicalHeight - c.paddingTop  - c.paddingBottom;
    return {
      x: c.xMin + (px - c.paddingLeft) / W * (c.xMax - c.xMin),
      y: c.yMax - (py - c.paddingTop)  / H * (c.yMax - c.yMin),
    };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
  }

  drawGrid() {
    const ctx = this.ctx;
    const c   = this.config;
    // gridStyle が未指定のときは gray プリセット相当をフォールバック
    const gs  = c.gridStyle || { color: '#cccccc', lineWidth: 0.5, dashed: false, dashPattern: [4, 4] };
    ctx.save();
    ctx.strokeStyle = gs.color;
    ctx.lineWidth   = gs.lineWidth;
    ctx.setLineDash(gs.dashed ? (gs.dashPattern || [4, 4]) : []);

    const { py: yTop }    = this.toPixel(0, c.yMax);
    const { py: yBottom } = this.toPixel(0, c.yMin);
    const { px: xLeft }   = this.toPixel(c.xMin, 0);
    const { px: xRight }  = this.toPixel(c.xMax, 0);

    for (let x = Math.ceil(c.xMin); x <= Math.floor(c.xMax); x++) {
      const { px } = this.toPixel(x, 0);
      ctx.beginPath(); ctx.moveTo(px, yTop); ctx.lineTo(px, yBottom); ctx.stroke();
    }
    for (let y = Math.ceil(c.yMin); y <= Math.floor(c.yMax); y++) {
      const { py } = this.toPixel(0, y);
      ctx.beginPath(); ctx.moveTo(xLeft, py); ctx.lineTo(xRight, py); ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 軸・ラベル・目盛り描画
   * @param {Object} options { xLabel, yLabel }
   */
  drawAxes(options = {}) {
    const ctx    = this.ctx;
    const c      = this.config;
    const xLabel = options.xLabel || 'x [cm]';
    const yLabel = options.yLabel || 'y [cm]';

    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.fillStyle   = '#000000';
    ctx.lineWidth   = 2;
    ctx.setLineDash([]);

    const { px: xLeft }   = this.toPixel(c.xMin, 0);
    const { px: xRight }  = this.toPixel(c.xMax, 0);
    const { py: yAxis }   = this.toPixel(0, 0);
    const { py: yTop }    = this.toPixel(0, c.yMax);
    const { py: yBottom } = this.toPixel(0, c.yMin);
    // xMin > 0 のとき x=0 が画面外になるので、y軸をグラフ左端に描く
    const xAxis = c.xMin >= 0 ? Math.max(xLeft, this.toPixel(0, 0).px) : this.toPixel(0, 0).px;

    // x 軸
    ctx.beginPath();
    ctx.moveTo(xLeft, yAxis);
    ctx.lineTo(xRight + 14, yAxis);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xRight + 14, yAxis);
    ctx.lineTo(xRight + 6,  yAxis - 4);
    ctx.lineTo(xRight + 6,  yAxis + 4);
    ctx.closePath();
    ctx.fill();

    // y 軸
    ctx.beginPath();
    ctx.moveTo(xAxis, yBottom);
    ctx.lineTo(xAxis, yTop - 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xAxis,     yTop - 14);
    ctx.lineTo(xAxis - 4, yTop - 6);
    ctx.lineTo(xAxis + 4, yTop - 6);
    ctx.closePath();
    ctx.fill();

    // 軸ラベル
    ctx.font = '12px serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(xLabel, xRight + 8, yAxis + 4);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(yLabel, xAxis, yTop - 16);

    // 原点 O
    ctx.font = '12px serif';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('O', xAxis - 3, yAxis + 3);

    // x 軸目盛り
    ctx.lineWidth = 1;
    ctx.font = '11px serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    for (let x = Math.ceil(c.xMin); x <= Math.floor(c.xMax); x++) {
      if (x === 0) continue;
      const { px } = this.toPixel(x, 0);
      ctx.beginPath(); ctx.moveTo(px, yAxis - 3); ctx.lineTo(px, yAxis + 3); ctx.stroke();
      ctx.fillText(String(x), px, yAxis + 5);
    }

    // y 軸目盛り
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'middle';
    for (let y = Math.ceil(c.yMin); y <= Math.floor(c.yMax); y++) {
      if (y === 0) continue;
      const { py } = this.toPixel(0, y);
      ctx.beginPath(); ctx.moveTo(xAxis - 3, py); ctx.lineTo(xAxis + 3, py); ctx.stroke();
      ctx.fillText(String(y), xAxis - 5, py);
    }

    ctx.restore();
  }

  /**
   * 波形の折れ線描画
   * @param {Array}  points  [{x, y}, ...]
   * @param {Object} style   { lineWidth, dashed, dashPattern, color }
   */
  drawWave(points, style = {}) {
    if (!points || points.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = style.color || '#000000';
    ctx.lineWidth   = style.lineWidth ?? 2.5;
    ctx.setLineDash(style.dashed ? (style.dashPattern || [8, 5]) : []);
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const first = this.toPixel(points[0].x, points[0].y);
    ctx.moveTo(first.px, first.py);
    for (let i = 1; i < points.length; i++) {
      const p = this.toPixel(points[i].x, points[i].y);
      ctx.lineTo(p.px, p.py);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** 時刻ラベル（右上に小さく表示） */
  drawTimeLabel(t, customLabel) {
    const ctx = this.ctx;
    const c   = this.config;
    ctx.save();
    ctx.font         = 'bold 13px serif';
    ctx.fillStyle    = '#000000';
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    const label = customLabel !== undefined ? customLabel : `t = ${t} [s]`;
    const { px: xRight } = this.toPixel(c.xMax, 0);
    ctx.fillText(label, xRight, 6);
    ctx.restore();
  }

  /** ホバーハイライト（半透明の青丸） */
  drawHighlight(x, y) {
    const ctx = this.ctx;
    const { px, py } = this.toPixel(x, y);
    ctx.save();
    ctx.fillStyle = 'rgba(30, 120, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 頂点マーカー（黒丸） */
  drawVertex(x, y) {
    const ctx = this.ctx;
    const { px, py } = this.toPixel(x, y);
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 指定点に点マーカー＋縦破線ガイド（Type2 解答用） */
  drawPointMarker(x, y) {
    const ctx = this.ctx;
    const { px, py }     = this.toPixel(x, y);
    const { py: yAxisPy } = this.toPixel(x, 0);
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(px, yAxisPy); ctx.lineTo(px, py); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /**
   * 媒質の端より先（波が存在しない側）を薄灰色で塗る（反射波モード用）
   * drawGrid() より前に呼び出すこと（グリッド線が灰色の上に描かれる）
   * @param {number} boundary  媒質の端 x 座標
   * @param {number} direction 入射波の向き (+1=右向き, -1=左向き)
   *   +1 → boundary より右側を塗る
   *   -1 → boundary より左側を塗る
   */
  drawBeyondMediumRegion(boundary, direction) {
    const c   = this.config;
    const ctx = this.ctx;
    const { px: bPx }    = this.toPixel(boundary, 0);
    const { px: xLeft }  = this.toPixel(c.xMin, 0);
    const { px: xRight } = this.toPixel(c.xMax, 0);
    const { py: yTop }   = this.toPixel(0, c.yMax);
    const { py: yBot }   = this.toPixel(0, c.yMin);
    ctx.save();
    ctx.fillStyle = '#D0D0D0';
    if (direction > 0) {
      ctx.fillRect(bPx, yTop, xRight - bPx, yBot - yTop);
    } else {
      ctx.fillRect(xLeft, yTop, bPx - xLeft, yBot - yTop);
    }
    ctx.restore();
  }

  /** 媒質の端を縦の破線で描画（反射波モード用） */
  drawBoundaryLine(xBoundary) {
    const c   = this.config;
    const ctx = this.ctx;
    const { px }     = this.toPixel(xBoundary, 0);
    const { py: topPy } = this.toPixel(xBoundary, c.yMax);
    const { py: botPy } = this.toPixel(xBoundary, c.yMin);
    ctx.save();
    ctx.strokeStyle = '#333333';
    ctx.lineWidth   = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(px, topPy);
    ctx.lineTo(px, botPy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle    = '#333333';
    ctx.font         = '10px sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('媒質の端', px + 3, topPy + 1);
    ctx.restore();
  }

  /**
   * 凡例を「グラフ下の余白」に描画（波形と被らない）
   * @param {Array} items [{label, dashed, dashPattern, lineWidth}]
   */
  drawLegend(items) {
    const ctx = this.ctx;
    const c   = this.config;
    ctx.save();

    // 下余白の中央ライン
    const legendY = this.logicalHeight - c.paddingBottom / 2 + 4;
    const { px: xLeft } = this.toPixel(c.xMin, 0);

    ctx.font         = '11px serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'left';

    let ox = xLeft;
    for (const item of items) {
      const lw = item.lineWidth || 2;
      ctx.strokeStyle = '#000';
      ctx.lineWidth   = lw;
      ctx.setLineDash(item.dashed ? (item.dashPattern || [6, 4]) : []);
      ctx.beginPath();
      ctx.moveTo(ox, legendY);
      ctx.lineTo(ox + 22, legendY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#000';
      ctx.fillText(item.label, ox + 26, legendY);
      ox += 26 + ctx.measureText(item.label).width + 16;
    }
    ctx.restore();
  }

  /**
   * 全波形を描画するコンビニエンスメソッド
   * @param {Array}  waves   Wave[]
   * @param {number} t       時刻
   * @param {Object} options { styles, showTimeLabel, timeLabel, xLabel, yLabel }
   */
  renderFull(waves, t, options = {}) {
    this.clear();
    this.drawGrid();
    this.drawAxes({ xLabel: options.xLabel, yLabel: options.yLabel });

    const c = this.config;
    waves.forEach((wave, i) => {
      if (!wave || wave.vertices.length === 0) return;
      const pts   = wave.getSnapshot(c.xMin, c.xMax, t);
      const style = (options.styles && options.styles[i]) ? options.styles[i] : {};
      this.drawWave(pts, style);
    });

    if (options.showTimeLabel !== false) {
      this.drawTimeLabel(t, options.timeLabel);
    }
    if (options.legend) {
      this.drawLegend(options.legend);
    }
  }
}
