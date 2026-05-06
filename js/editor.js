/**
 * WaveEditor - 格子点クリックによる波形入力
 *
 * 操作方法:
 *   左クリック: クリックした x 列の変位を設定
 *   左クリック＋上下ドラッグ: x を固定したまま変位を調整
 *   右クリック: その x 列の頂点を削除
 */
class WaveEditor {
  constructor(canvas, wave, renderer, onUpdate) {
    this.canvas   = canvas;
    this.wave     = wave;
    this.renderer = renderer;
    this.onUpdate = onUpdate || (() => {});

    this.hoverPos  = null;  // マウスホバー位置（ワールド座標）
    this.isDragging = false;
    this.activeX   = null;  // ドラッグ中に固定する x 列

    this._bindEvents();
    this.render();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove',   e => this._onMouseMove(e));
    this.canvas.addEventListener('mousedown',   e => this._onMouseDown(e));
    this.canvas.addEventListener('mouseup',     ()  => this._onMouseUp());
    this.canvas.addEventListener('mouseleave',  ()  => { this.hoverPos = null; this.isDragging = false; this.activeX = null; this.render(); });
    this.canvas.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });

    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      const pos = this._snapGrid(t.clientX, t.clientY);
      this.activeX = pos.x;
      this.wave.setVertex(pos.x, pos.y);
      this.onUpdate();
      this.render();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (this.activeX === null) return;
      const t = e.touches[0];
      const { py } = this._getCanvasXY(t.clientX, t.clientY);
      const world = this.renderer.toWorld(0, py);
      const c = this.renderer.config;
      const snappedY = Math.max(c.yMin, Math.min(c.yMax, Math.round(world.y * 2) / 2));
      this.wave.setVertex(this.activeX, snappedY);
      this.onUpdate();
      this.render();
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => { this.activeX = null; });
  }

  _getCanvasXY(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      px: (clientX - rect.left) * (this.canvas.width  / rect.width),
      py: (clientY - rect.top)  * (this.canvas.height / rect.height),
    };
  }

  /** マウス座標をグリッド格子点にスナップ */
  _snapGrid(clientX, clientY) {
    const { px, py } = this._getCanvasXY(clientX, clientY);
    const world = this.renderer.toWorld(px, py);
    const c = this.renderer.config;
    return {
      x: Math.max(c.xMin, Math.min(c.xMax, Math.round(world.x))),
      y: Math.max(c.yMin, Math.min(c.yMax, Math.round(world.y * 2) / 2)),
    };
  }

  /** ドラッグ中: x を固定して y だけ更新 */
  _snapY(clientY) {
    const { py } = this._getCanvasXY(0, clientY);
    const world = this.renderer.toWorld(0, py);
    const c = this.renderer.config;
    return Math.max(c.yMin, Math.min(c.yMax, Math.round(world.y * 2) / 2));
  }

  _onMouseMove(e) {
    if (this.isDragging && this.activeX !== null) {
      // x は固定、y だけマウスに追従
      const y = this._snapY(e.clientY);
      this.hoverPos = { x: this.activeX, y };
      this.wave.setVertex(this.activeX, y);
      this.onUpdate();
    } else {
      this.hoverPos = this._snapGrid(e.clientX, e.clientY);
    }
    this.render();
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    const pos = this._snapGrid(e.clientX, e.clientY);
    this.activeX    = pos.x;
    this.isDragging = true;
    this.hoverPos   = pos;
    this.wave.setVertex(pos.x, pos.y);
    this.onUpdate();
    this.render();
  }

  _onMouseUp() {
    this.isDragging = false;
    this.activeX    = null;
  }

  _onRightClick(e) {
    const pos = this._snapGrid(e.clientX, e.clientY);
    this.wave.removeVertex(pos.x);
    this.onUpdate();
    this.render();
  }

  render() {
    const r = this.renderer;
    const c = r.config;
    r.clear();
    if (c.boundary != null) r.drawBeyondMediumRegion(c.boundary, c.boundaryDirection || 1);
    r.drawGrid();

    // ドラッグ中: アクティブ列をハイライト
    if (this.isDragging && this.activeX !== null) {
      const ctx = r.ctx;
      const { px: colPx } = r.toPixel(this.activeX, 0);
      const { py: yTop }  = r.toPixel(0, c.yMax);
      const { py: yBot }  = r.toPixel(0, c.yMin);
      const colW = r.toPixel(1, 0).px - r.toPixel(0, 0).px;
      ctx.save();
      ctx.fillStyle = 'rgba(30, 120, 255, 0.10)';
      ctx.fillRect(colPx - colW / 2, yTop, colW, yBot - yTop);
      ctx.restore();
    }

    r.drawAxes();
    if (r.config.boundary != null) r.drawBoundaryLine(r.config.boundary);

    // 波形
    if (!this.wave.isEmpty()) {
      const pts = this.wave.getSnapshot(c.xMin, c.xMax, 0);
      r.drawWave(pts, { lineWidth: 2.5 });
      if (this.wave.vertices) this.wave.vertices.forEach(v => r.drawVertex(v.x, v.y));
    }

    // ホバー
    if (this.hoverPos) {
      r.drawHighlight(this.hoverPos.x, this.hoverPos.y);
      // 座標ラベル（(x, y) のテキスト）
      this._drawCoordLabel(r, this.hoverPos.x, this.hoverPos.y);
    }
  }

  _drawCoordLabel(r, x, y) {
    const ctx = r.ctx;
    const { px, py } = r.toPixel(x, y);
    ctx.save();
    ctx.font = '11px monospace';
    ctx.fillStyle = '#1e3a5f';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const label = `(${x}, ${y})`;
    const tw = ctx.measureText(label).width;
    // 右端に近い場合は左に表示
    const lx = (px + tw + 12 > r.canvas.width) ? px - tw - 8 : px + 8;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(lx - 2, py - 16, tw + 4, 14);
    ctx.fillStyle = '#1e3a5f';
    ctx.fillText(label, lx, py - 4);
    ctx.restore();
  }
}
