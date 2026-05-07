/**
 * ProblemGenerator - 設問テンプレート生成
 *
 * 出力 Canvas は 2x pixelRatio で高解像度（印刷・PDF 品質）
 * style.width で画面表示サイズを 1x に固定
 *
 * Canvas 寸法は state.cellSize（{ w, h } / null=自動）から
 * WaveRenderer.computeCanvasSize で算出。未設定時はデフォルト 580×200。
 */
class ProblemGenerator {
  constructor(state) {
    this.state = state; // { gridConfig, styleConfig, cellSize? }
    this.PR    = 2;     // pixelRatio（印刷品質）
  }

  // ----------------------------------------------------------------
  // キャンバス・レンダラ生成ヘルパー
  // ----------------------------------------------------------------

  /**
   * メインの y-x グラフ用 Canvas 寸法（論理px）
   * cellSize 未指定なら 580×200
   */
  _mainSize() {
    return WaveRenderer.computeCanvasSize(this.state.gridConfig, this.state.cellSize);
  }

  /**
   * 任意寸法で Canvas を生成
   * dispW/dispH 省略時は _mainSize() を使用
   */
  _makeCanvas(dispW, dispH) {
    if (dispW === undefined || dispH === undefined) {
      const s = this._mainSize();
      dispW = s.width;
      dispH = s.height;
    }
    const canvas = document.createElement('canvas');
    canvas.width        = dispW * this.PR;
    canvas.height       = dispH * this.PR;
    canvas.style.width  = `${dispW}px`;
    canvas.style.height = `${dispH}px`;
    return canvas;
  }

  _makeRenderer(canvas, configOverride) {
    const sc = this.state.styleConfig;
    return new WaveRenderer(
      canvas,
      Object.assign(
        {},
        this.state.gridConfig,
        configOverride,
        { pixelRatio: this.PR, gridStyle: sc ? sc.grid : undefined }
      )
    );
  }

  // スタイル定義（state.styleConfig があれば優先、なければ gray プリセット相当のフォールバック）
  get _styleA() {
    const sc = this.state.styleConfig;
    return sc && sc.waveA ? sc.waveA : { lineWidth: 1.5, dashed: true, dashPattern: [10, 5] };
  }
  get _styleB() {
    const sc = this.state.styleConfig;
    return sc && sc.waveB ? sc.waveB : { lineWidth: 1.5, dashed: true, dashPattern: [4, 4] };
  }
  get _styleSum() {
    const sc = this.state.styleConfig;
    return sc && sc.waveSum ? sc.waveSum : { lineWidth: 3, dashed: false };
  }
  get _styleSingle() {
    const sc = this.state.styleConfig;
    return sc && sc.waveSingle ? sc.waveSingle : { lineWidth: 2.5, dashed: false };
  }
  get _legendAB() {
    const a = this._styleA, b = this._styleB, s = this._styleSum;
    return [
      { label: '波A',   dashed: a.dashed, dashPattern: a.dashPattern, lineWidth: a.lineWidth },
      { label: '波B',   dashed: b.dashed, dashPattern: b.dashPattern, lineWidth: b.lineWidth },
      { label: '合成波', dashed: s.dashed, dashPattern: s.dashPattern, lineWidth: s.lineWidth },
    ];
  }

  /** 波形スナップショットを描画した Canvas を返す */
  _renderSnapshot(waves, t, styles, options = {}) {
    const canvas = this._makeCanvas();
    const r      = this._makeRenderer(canvas, {});
    r.clear();
    r.drawGrid();
    r.drawAxes({ xLabel: options.xLabel, yLabel: options.yLabel });

    const c = r.config;
    waves.forEach((wave, i) => {
      if (!wave || wave.isEmpty()) return;
      r.drawWave(wave.getSnapshot(c.xMin, c.xMax, t), styles[i] || {});
    });

    const label = options.timeLabel !== undefined
      ? options.timeLabel
      : `t = ${t} [s]`;
    r.drawTimeLabel(t, label);

    if (options.legend) r.drawLegend(options.legend);
    return canvas;
  }

  /** 空白解答欄（グリッド＋軸のみ） */
  _renderBlank(labelText, xLabel, yLabel) {
    const canvas = this._makeCanvas();
    const r      = this._makeRenderer(canvas, {});
    r.clear();
    r.drawGrid();
    r.drawAxes({ xLabel, yLabel });
    if (labelText) r.drawTimeLabel(null, labelText);
    return canvas;
  }

  // ----------------------------------------------------------------
  // 重ね合わせ用内部ヘルパー
  // ----------------------------------------------------------------

  /**
   * 波A・波Bのみを描画（合成波なし）— 問題参照図用
   * 学生はここから合成波を自分で計算して描く
   */
  _renderWavesOnly(waveA, waveB, t) {
    const canvas = this._makeCanvas();
    const r      = this._makeRenderer(canvas, {});
    r.clear();
    r.drawGrid();
    r.drawAxes();
    r.drawTimeLabel(t);

    const { xMin, xMax } = r.config;
    if (!waveA.isEmpty())
      r.drawWave(waveA.getSnapshot(xMin, xMax, t), this._styleA);
    if (!waveB.isEmpty())
      r.drawWave(waveB.getSnapshot(xMin, xMax, t), this._styleB);

    // 凡例（合成波の行を含まない）
    r.drawLegend([
      { label: '波A', dashed: true, dashPattern: [10, 5], lineWidth: 1.5 },
      { label: '波B', dashed: true, dashPattern: [4, 4],  lineWidth: 1.5 },
    ]);
    return canvas;
  }

  /** 波A・波B・合成波の3本を描画 — 解答図用 */
  _renderSuperposition(waveA, waveB, t) {
    const canvas = this._makeCanvas();
    const r      = this._makeRenderer(canvas, {});
    r.clear();
    r.drawGrid();
    r.drawAxes();
    r.drawTimeLabel(t);

    const { xMin, xMax } = r.config;

    if (!waveA.isEmpty())
      r.drawWave(waveA.getSnapshot(xMin, xMax, t), this._styleA);
    if (!waveB.isEmpty())
      r.drawWave(waveB.getSnapshot(xMin, xMax, t), this._styleB);

    // 合成波（全頂点位置を union して正確に描画）
    // SineWave は getKeyXs が [] を返すため、その場合は密サンプリングにフォールバック
    const keyA = waveA.getKeyXs(t);
    const keyB = waveB.getKeyXs(t);
    const needsDense = (!waveA.isEmpty() && keyA.length === 0) ||
                       (!waveB.isEmpty() && keyB.length === 0);

    let sumPts;
    if (needsDense) {
      const STEP = 0.05;
      const count = Math.ceil((xMax - xMin) / STEP);
      sumPts = [];
      for (let i = 0; i <= count; i++) {
        const xi = Math.round((xMin + i * STEP) * 10000) / 10000;
        if (xi > xMax + 1e-9) break;
        sumPts.push({ x: xi, y: waveA.getYAtTime(xi, t) + waveB.getYAtTime(xi, t) });
      }
      const lastX = sumPts.length > 0 ? sumPts[sumPts.length - 1].x : xMin;
      if (Math.abs(lastX - xMax) > 1e-9) {
        sumPts.push({ x: xMax, y: waveA.getYAtTime(xMax, t) + waveB.getYAtTime(xMax, t) });
      }
    } else {
      const xSet = new Set();
      for (let xi = Math.floor(xMin); xi <= Math.ceil(xMax); xi++) xSet.add(xi);
      keyA.forEach(sx => xSet.add(sx));
      keyB.forEach(sx => xSet.add(sx));
      sumPts = [...xSet]
        .sort((a, b) => a - b)
        .filter(xi => xi >= xMin && xi <= xMax)
        .map(xi => ({ x: xi, y: waveA.getYAtTime(xi, t) + waveB.getYAtTime(xi, t) }));
    }

    r.drawWave(sumPts, this._styleSum);
    r.drawLegend(this._legendAB);
    return canvas;
  }

  // ================================================================
  // 選択肢モード用ヘルパー（Type3 / Type4）
  // ================================================================

  /** Type3 の y-t グラフ用 gridConfig を返す */
  _type3GridConfig(tMax) {
    const gc = this.state.gridConfig;
    const sc = this.state.styleConfig;
    return {
      xMin: 0, xMax: tMax,
      yMin: gc.yMin, yMax: gc.yMax,
      paddingLeft: 52, paddingRight: 52,
      paddingTop: 32, paddingBottom: 44,
      gridStyle: sc ? sc.grid : undefined,
    };
  }

  /** Type3/y-t 用 Canvas のサイズ（横 580 固定、縦は cellSize.h を反映） */
  _type3CanvasHeight() {
    const cs = this.state.cellSize;
    const gc = this.state.gridConfig;
    return WaveRenderer.computeCanvasSize(
      { xMin: gc.yMin, xMax: gc.yMax, yMin: gc.yMin, yMax: gc.yMax },
      { w: null, h: cs ? cs.h : null }
    ).height;
  }

  /**
   * Type3 の正答 y-t グラフを描画した Canvas を返す
   * （ProblemGenerator.generateType3 内のロジックを切り出し・再利用）
   *
   * @param {Wave|SineWave} wave   波A（入射波）
   * @param {number}        x      観測地点
   * @param {number}        tMax   時間上限
   * @param {Object}        [opts] オプション
   *   opts.waveB    {Wave|SineWave}  合成波モード時の波B
   *   opts.boundary {number}         反射波モード時の境界座標
   *   opts.endType  {string}         'free'|'fixed'
   */
  renderType3CorrectCanvas(wave, x, tMax, opts = {}) {
    const waveB    = opts.waveB    || null;
    const boundary = opts.boundary !== undefined ? opts.boundary : null;
    const endType  = opts.endType  || 'free';

    const mode = (waveB && !waveB.isEmpty()) ? 'superposition'
               : (boundary !== null)          ? 'reflection'
               :                               'single';

    const reflectedWave = (mode === 'reflection')
      ? this._buildReflectedWave(wave, boundary, endType)
      : null;

    const getYSum = (ti) => {
      if (mode === 'superposition') return wave.getYAtTime(x, ti) + waveB.getYAtTime(x, ti);
      if (mode === 'reflection')    return wave.getYAtTime(x, ti) + reflectedWave.getYAtTime(x, ti);
      return wave.getYAtTime(x, ti);
    };

    const ytStyle = (mode === 'single') ? this._styleSingle : this._styleSum;
    const ytConfig = this._type3GridConfig(tMax);
    const h = this._type3CanvasHeight();
    const canvas = this._makeCanvas(WaveRenderer.DEFAULT_DISP_W, h);
    const r = new WaveRenderer(canvas, Object.assign({}, ytConfig, { pixelRatio: this.PR }));
    r.clear();
    r.drawGrid();
    r.drawAxes({ xLabel: 't [s]', yLabel: 'y [cm]' });
    r.drawTimeLabel(null, `x = ${x} [cm] の地点`);
    const pts = [];
    for (let ti = 0; ti <= tMax; ti += 0.05) {
      pts.push({ x: ti, y: getYSum(ti) });
    }
    pts.push({ x: tMax, y: getYSum(tMax) });
    r.drawWave(pts, ytStyle);
    return canvas;
  }

  /**
   * Type3 の不正解（distractor）を描画した Canvas を返す
   * distractorWave は (t, y) 座標空間の頂点を持つ Wave
   */
  renderType3DistractorCanvas(distractorWave, tMax) {
    const ytConfig = this._type3GridConfig(tMax);
    const h = this._type3CanvasHeight();
    const canvas = this._makeCanvas(WaveRenderer.DEFAULT_DISP_W, h);
    const r = new WaveRenderer(canvas, Object.assign({}, ytConfig, { pixelRatio: this.PR }));
    r.clear();
    r.drawGrid();
    r.drawAxes({ xLabel: 't [s]', yLabel: 'y [cm]' });
    if (distractorWave && !distractorWave.isEmpty()) {
      // distractor は静的な折れ線（伝播しない）→ getSnapshot(_, _, 0) を使う
      const pts = distractorWave.getSnapshot(0, tMax, 0);
      r.drawWave(pts, this._styleSingle);
    }
    return canvas;
  }

  /**
   * Type4 の正答（合成波のみ）を描画した Canvas を返す
   * 凡例なし・合成波のみ（選択肢比較用）
   */
  renderType4CorrectCanvas(waveA, waveB, t) {
    const canvas = this._makeCanvas();
    const r = this._makeRenderer(canvas, {});
    r.clear();
    r.drawGrid();
    r.drawAxes();
    r.drawTimeLabel(t);
    const { xMin, xMax } = r.config;

    // SineWave は getKeyXs が [] を返すため、その場合は密サンプリングにフォールバック
    const keyA = waveA.getKeyXs(t);
    const keyB = waveB.getKeyXs(t);
    const needsDense = (!waveA.isEmpty() && keyA.length === 0) ||
                       (!waveB.isEmpty() && keyB.length === 0);

    let sumPts;
    if (needsDense) {
      const STEP = 0.05;
      const count = Math.ceil((xMax - xMin) / STEP);
      sumPts = [];
      for (let i = 0; i <= count; i++) {
        const xi = Math.round((xMin + i * STEP) * 10000) / 10000;
        if (xi > xMax + 1e-9) break;
        sumPts.push({ x: xi, y: waveA.getYAtTime(xi, t) + waveB.getYAtTime(xi, t) });
      }
      const lastX = sumPts.length > 0 ? sumPts[sumPts.length - 1].x : xMin;
      if (Math.abs(lastX - xMax) > 1e-9) {
        sumPts.push({ x: xMax, y: waveA.getYAtTime(xMax, t) + waveB.getYAtTime(xMax, t) });
      }
    } else {
      const xSet = new Set();
      for (let xi = Math.floor(xMin); xi <= Math.ceil(xMax); xi++) xSet.add(xi);
      keyA.forEach(sx => xSet.add(sx));
      keyB.forEach(sx => xSet.add(sx));
      sumPts = [...xSet]
        .sort((a, b) => a - b)
        .filter(xi => xi >= xMin && xi <= xMax)
        .map(xi => ({ x: xi, y: waveA.getYAtTime(xi, t) + waveB.getYAtTime(xi, t) }));
    }
    r.drawWave(sumPts, this._styleSum);
    return canvas;
  }

  /**
   * Type4 の不正解 Canvas（distractor の波形を合成波の代替として描画）
   */
  renderType4DistractorCanvas(distractorWave, t) {
    const canvas = this._makeCanvas();
    const r = this._makeRenderer(canvas, {});
    r.clear();
    r.drawGrid();
    r.drawAxes();
    r.drawTimeLabel(t);
    if (distractorWave && !distractorWave.isEmpty()) {
      const { xMin, xMax } = r.config;
      // distractor は静的な折れ線（伝播しない）→ t=0 として描画
      const pts = distractorWave.getSnapshot(xMin, xMax, 0);
      r.drawWave(pts, this._styleSum);
    }
    return canvas;
  }

  // ================================================================
  // Type 1: 指定時刻の y-x グラフ
  // ================================================================
  generateType1(params) {
    const { wave, answerT } = params;
    const dirStr = wave.direction > 0 ? '右' : '左';
    const style  = this._styleSingle;

    const questionCanvases = [
      this._renderSnapshot([wave], 0, [style], { timeLabel: 't = 0 [s]（初期波形）' }),
      this._renderBlank(`t = ${answerT} [s]（解答欄）`),
    ];
    const answerCanvases = [];
    for (let t = 0; t <= answerT; t++) {
      answerCanvases.push(this._renderSnapshot([wave], t, [style]));
    }
    return {
      questionText:
        `t = 0 のとき、下図のような波形の波がある。\n` +
        `速さ ${wave.speed} cm/s、${dirStr}向きに進んでいる。\n` +
        `t = ${answerT} [s] のときの波形（y − x グラフ）を描け。`,
      questionCanvases,
      answerText: `t = ${answerT} [s] のときの波形（t = 0 〜 ${answerT} の変化）`,
      answerCanvases,
      answerValue: null,
    };
  }

  // ================================================================
  // Type 2: 指定地点・時刻の変位（数値）
  // ================================================================
  generateType2(params) {
    const { wave, x, t } = params;
    const y = wave.getYAtTime(x, t);
    const style = this._styleSingle;

    const qCanvas = this._renderSnapshot([wave], 0, [style], { timeLabel: 't = 0 [s]（参考）' });

    const aCanvas = this._makeCanvas();
    const r       = this._makeRenderer(aCanvas, {});
    r.renderFull([wave], t, { styles: [style], showTimeLabel: true });
    r.drawPointMarker(x, y);

    return {
      questionText: `t = ${t} [s] のとき、x = ${x} [cm] の地点の媒質の変位 y はいくらか。`,
      questionCanvases: [qCanvas],
      answerText:    `y = ${y} [cm]`,
      answerCanvases: [aCanvas],
      answerValue:   y,
    };
  }

  // ================================================================
  // Type 3: 特定地点の y-t グラフ
  // ================================================================
  generateType3(params) {
    const { wave, x, tMax } = params;
    // waveB: 合成波モード（波B あり）
    // boundary / endType: 反射波モード
    const waveB    = params.waveB    || null;
    const boundary = params.boundary !== undefined ? params.boundary : null;
    const endType  = params.endType  || 'free';

    // モード判定
    // 'superposition': 波B が存在して空でない
    // 'reflection'   : boundary が指定されている
    // 'single'       : 進行波（既存動作）
    const mode = (waveB && !waveB.isEmpty()) ? 'superposition'
               : (boundary !== null)          ? 'reflection'
               :                               'single';

    // 反射波モードの場合は反射波インスタンスを生成しておく
    const reflectedWave = (mode === 'reflection')
      ? this._buildReflectedWave(wave, boundary, endType)
      : null;

    // 反射波モードで媒質内かどうかを判定（入射波が右向き(+1) なら x ≤ boundary が媒質）
    let xOutsideMediumWarning = false;
    if (mode === 'reflection') {
      const dir = wave.direction;
      const insideMedium = dir > 0 ? (x <= boundary) : (x >= boundary);
      if (!insideMedium) xOutsideMediumWarning = true;
    }

    const gc = this.state.gridConfig;
    const sc = this.state.styleConfig;
    const cs = this.state.cellSize;

    const ytConfig = {
      xMin: 0, xMax: tMax,
      yMin: gc.yMin, yMax: gc.yMax,
      paddingLeft: 52, paddingRight: 52,
      paddingTop: 32, paddingBottom: 44,
      gridStyle: sc ? sc.grid : undefined,
    };

    // y-t グラフのサイズ：横は固定 580px（時間軸の物理意味が y-x と異なるため
    // cellSize.w は流用しない）。縦のみ cellSize.h を反映する。
    const ytSize = WaveRenderer.computeCanvasSize(
      { xMin: gc.yMin, xMax: gc.yMax, yMin: gc.yMin, yMax: gc.yMax }, // 幅算出には使わないダミー
      { w: null, h: cs ? cs.h : null }
    );

    /** 時刻 ti での x 地点の合成変位を返す（モード対応） */
    const getYSum = (ti) => {
      if (mode === 'superposition') {
        return wave.getYAtTime(x, ti) + waveB.getYAtTime(x, ti);
      } else if (mode === 'reflection') {
        return wave.getYAtTime(x, ti) + reflectedWave.getYAtTime(x, ti);
      } else {
        return wave.getYAtTime(x, ti);
      }
    };

    /** y-t グラフに用いるスタイル（合成波モード/反射波モードは合成波スタイル） */
    const ytStyle = (mode === 'single') ? this._styleSingle : this._styleSum;

    // y-t グラフ（空白 or 解答線あり）
    const makeYtCanvas = (drawWave) => {
      const canvas = this._makeCanvas(WaveRenderer.DEFAULT_DISP_W, ytSize.height);
      const r      = new WaveRenderer(canvas, Object.assign({}, ytConfig, { pixelRatio: this.PR }));
      r.clear();
      r.drawGrid();
      r.drawAxes({ xLabel: 't [s]', yLabel: 'y [cm]' });
      r.drawTimeLabel(null, `x = ${x} [cm] の地点`);
      if (drawWave) {
        const pts = [];
        for (let ti = 0; ti <= tMax; ti += 0.05) {
          pts.push({ x: ti, y: getYSum(ti) });
        }
        pts.push({ x: tMax, y: getYSum(tMax) });
        r.drawWave(pts, ytStyle);
      }
      return canvas;
    };

    // 参考用スナップショット（モード別）
    const makeSnapWithMarker = (t) => {
      if (mode === 'superposition') {
        // 波A（破線）＋波B（破線）＋合成波（実線）＋観測点マーカー
        const canvas = this._makeCanvas();
        const r      = this._makeRenderer(canvas, {});
        r.clear();
        r.drawGrid();
        r.drawAxes();
        r.drawTimeLabel(t);
        const { xMin, xMax } = r.config;
        if (!wave.isEmpty())  r.drawWave(wave.getSnapshot(xMin, xMax, t), this._styleA);
        if (!waveB.isEmpty()) r.drawWave(waveB.getSnapshot(xMin, xMax, t), this._styleB);
        // 合成波（SineWave 対応で密サンプリング or 頂点ベース）
        const keyA = wave.getKeyXs(t);
        const keyB = waveB.getKeyXs(t);
        const needsDense = (!wave.isEmpty() && keyA.length === 0) ||
                           (!waveB.isEmpty() && keyB.length === 0);
        let sumPts;
        if (needsDense) {
          const STEP = 0.05;
          const count = Math.ceil((xMax - xMin) / STEP);
          sumPts = [];
          for (let i = 0; i <= count; i++) {
            const xi = Math.round((xMin + i * STEP) * 10000) / 10000;
            if (xi > xMax + 1e-9) break;
            sumPts.push({ x: xi, y: wave.getYAtTime(xi, t) + waveB.getYAtTime(xi, t) });
          }
          if (sumPts.length > 0 && Math.abs(sumPts[sumPts.length - 1].x - xMax) > 1e-9) {
            sumPts.push({ x: xMax, y: wave.getYAtTime(xMax, t) + waveB.getYAtTime(xMax, t) });
          }
        } else {
          const xSet = new Set();
          for (let xi = Math.floor(xMin); xi <= Math.ceil(xMax); xi++) xSet.add(xi);
          keyA.forEach(sx => xSet.add(sx));
          keyB.forEach(sx => xSet.add(sx));
          sumPts = [...xSet]
            .sort((a, b) => a - b)
            .filter(xi => xi >= xMin && xi <= xMax)
            .map(xi => ({ x: xi, y: wave.getYAtTime(xi, t) + waveB.getYAtTime(xi, t) }));
        }
        if (sumPts.length >= 2) r.drawWave(sumPts, this._styleSum);
        r.drawLegend(this._legendAB);
        const sumY = wave.getYAtTime(x, t) + waveB.getYAtTime(x, t);
        r.drawPointMarker(x, sumY);
        return canvas;
      } else if (mode === 'reflection') {
        // 反射波モード: 境界線・灰色領域・入射波・反射波・合成波（媒質内）＋観測点マーカー
        const canvas = this._makeCanvas();
        const r      = this._makeRenderer(canvas, {});
        r.clear();
        r.drawBeyondMediumRegion(boundary, wave.direction);
        r.drawGrid();
        r.drawAxes();
        r.drawTimeLabel(t);
        r.drawBoundaryLine(boundary);
        const { xMin, xMax } = r.config;
        const dir    = wave.direction;
        const medXMin = dir > 0 ? xMin     : boundary;
        const medXMax = dir > 0 ? boundary : xMax;
        if (!wave.isEmpty())         r.drawWave(wave.getSnapshot(xMin, xMax, t), this._styleA);
        if (!reflectedWave.isEmpty()) {
          const rpts = reflectedWave.getSnapshot(medXMin, medXMax, t);
          if (rpts.length >= 2) r.drawWave(rpts, this._styleB);
        }
        // 合成波（媒質内のみ）
        const incKeyXs = wave.getKeyXs(t);
        const refKeyXs = reflectedWave.getKeyXs(t);
        const needsDense = (!wave.isEmpty() && incKeyXs.length === 0) ||
                           (!reflectedWave.isEmpty() && refKeyXs.length === 0);
        let sumPts;
        if (needsDense) {
          const STEP = 0.05;
          const count = Math.ceil((medXMax - medXMin) / STEP);
          sumPts = [];
          for (let i = 0; i <= count; i++) {
            const xi = Math.round((medXMin + i * STEP) * 10000) / 10000;
            if (xi > medXMax + 1e-9) break;
            sumPts.push({ x: xi, y: wave.getYAtTime(xi, t) + reflectedWave.getYAtTime(xi, t) });
          }
          if (sumPts.length > 0 && Math.abs(sumPts[sumPts.length - 1].x - medXMax) > 1e-9) {
            sumPts.push({ x: medXMax, y: wave.getYAtTime(medXMax, t) + reflectedWave.getYAtTime(medXMax, t) });
          }
        } else {
          const xSet = new Set();
          for (let xi = Math.floor(medXMin); xi <= Math.ceil(medXMax); xi++) xSet.add(xi);
          incKeyXs.forEach(sx => { if (sx >= medXMin && sx <= medXMax) xSet.add(sx); });
          refKeyXs.forEach(sx => { if (sx >= medXMin && sx <= medXMax) xSet.add(sx); });
          sumPts = [...xSet]
            .sort((a, b) => a - b)
            .filter(xi => xi >= medXMin && xi <= medXMax)
            .map(xi => ({ x: xi, y: wave.getYAtTime(xi, t) + reflectedWave.getYAtTime(xi, t) }));
        }
        if (sumPts.length >= 2) r.drawWave(sumPts, this._styleSum);
        r.drawLegend([
          { label: '入射波', ...this._styleA },
          { label: '反射波', ...this._styleB },
          { label: '合成波', ...this._styleSum },
        ]);
        // 観測点マーカー（媒質内のみ描画）
        const insideMedium = dir > 0 ? (x <= boundary) : (x >= boundary);
        if (insideMedium) {
          const markerY = wave.getYAtTime(x, t) + reflectedWave.getYAtTime(x, t);
          r.drawPointMarker(x, markerY);
        }
        return canvas;
      } else {
        // single（既存）
        const canvas = this._makeCanvas();
        const r      = this._makeRenderer(canvas, {});
        r.clear();
        r.drawGrid();
        r.drawAxes();
        r.drawTimeLabel(t);
        const { xMin, xMax } = r.config;
        r.drawWave(wave.getSnapshot(xMin, xMax, t), this._styleSingle);
        const y = wave.getYAtTime(x, t);
        r.drawPointMarker(x, y);
        return canvas;
      }
    };

    // 参考画像: t=0〜tMax の各整数時刻の y-x グラフ（地点マーカー付き）
    const refCanvases = [];
    for (let t = 0; t <= tMax; t++) {
      refCanvases.push(makeSnapWithMarker(t));
    }

    // 問題文・設問 Canvas をモード別に構築
    let questionText, questionCanvases;
    if (mode === 'superposition') {
      const dirA = wave.direction  > 0 ? '右' : '左';
      const dirB = waveB.direction > 0 ? '右' : '左';
      questionText =
        `x = ${x} [cm] の地点の媒質について、\n` +
        `t = 0 〜 ${tMax} [s] の合成変位の変化を y − t グラフで示せ。\n` +
        `（波A: 速さ ${wave.speed} cm/s、${dirA}向き  ／  波B: 速さ ${waveB.speed} cm/s、${dirB}向き）`;
      questionCanvases = [
        this._renderSnapshot([wave, waveB], 0, [this._styleA, this._styleB], {
          timeLabel: 't = 0 [s]（参考）',
        }),
        makeYtCanvas(false),
      ];
    } else if (mode === 'reflection') {
      const dirStr  = wave.direction > 0 ? '右' : '左';
      const endStr  = endType === 'fixed' ? '固定端' : '自由端';
      questionText =
        `x = ${x} [cm] の地点の媒質について、\n` +
        `t = 0 〜 ${tMax} [s] の合成変位の変化を y − t グラフで示せ。\n` +
        `（波A: 速さ ${wave.speed} cm/s、${dirStr}向き。x = ${boundary} [cm] で反射（${endStr}））` +
        (xOutsideMediumWarning ? '\n※ 観測点が媒質の外にあります。入射波のみの変位を示します。' : '');
      questionCanvases = [
        this._renderReflectionCanvas(wave, boundary, endType, 0, {
          showIncident: true, showReflected: true, showSum: false,
          timeLabel: 't = 0 [s]（参考）',
        }),
        makeYtCanvas(false),
      ];
    } else {
      const dirStr = wave.direction > 0 ? '右' : '左';
      questionText =
        `x = ${x} [cm] の地点の媒質について、\n` +
        `t = 0 〜 ${tMax} [s] の変位の変化を y − t グラフで示せ。`;
      questionCanvases = [
        this._renderSnapshot([wave], 0, [this._styleSingle], { timeLabel: 't = 0 [s]（参考）' }),
        makeYtCanvas(false),
      ];
    }

    const answerText = mode === 'single'
      ? `x = ${x} [cm] の y − t グラフ`
      : `x = ${x} [cm] の合成波 y − t グラフ`;

    const refSectionNote = mode === 'single'
      ? '各コマの ● の高さを読み取り、y−t グラフの対応する t の列にプロットしてください。'
      : '各コマの ● の高さ（合成変位）を読み取り、y−t グラフの対応する t の列にプロットしてください。';

    return {
      questionText,
      questionCanvases,
      answerText,
      answerCanvases: [makeYtCanvas(true), ...refCanvases],
      answerValue:   null,
      // 参考画像を別キーで渡す（_renderProblemOutput で参照用ラベルを付けるため）
      refCanvases,
      refSectionNote,
      xOutsideMediumWarning,
    };
  }

  // ================================================================
  // Type 4: 重ね合わせ（指定時刻の合成波）
  // ================================================================
  generateType4(params) {
    const { waveA, waveB, answerT } = params;
    const dirA = waveA.direction > 0 ? '右' : '左';
    const dirB = waveB.direction > 0 ? '右' : '左';

    const blankLabel = this.state.hasChoices ? `t = ${answerT} [s]（作図用）` : `t = ${answerT} [s]（解答欄）`;
    const questionCanvases = [
      this._renderWavesOnly(waveA, waveB, 0),
      this._renderBlank(blankLabel),
    ];
    const answerCanvases = [];
    for (let t = 0; t <= answerT; t++) {
      answerCanvases.push(this._renderSuperposition(waveA, waveB, t));
    }
    return {
      questionText:
        `t = 0 のとき、下図のような 2 つの波が重なり合っている。\n` +
        `波A: 速さ ${waveA.speed} cm/s、${dirA}向き\n` +
        `波B: 速さ ${waveB.speed} cm/s、${dirB}向き\n` +
        `t = ${answerT} [s] のときの合成波を描け。\n` +
        `（各波を点線・破線で、合成波を実線で重ねること）`,
      questionCanvases,
      answerText:
        `t = 0 〜 ${answerT} [s] の合成波の変化\n点線: 波A　破線: 波B　実線: 合成波`,
      answerCanvases,
      answerValue: null,
    };
  }

  // ================================================================
  // Type 5: 複数時刻の合成波（範囲指定）
  // ================================================================
  generateType5(params) {
    const { waveA, waveB, tStart, tEnd } = params;
    const dirA = waveA.direction > 0 ? '右' : '左';
    const dirB = waveB.direction > 0 ? '右' : '左';

    // 問題: t=0 の状態を表示（合成波なし）+ 各時刻の解答欄
    const questionCanvases = [this._renderWavesOnly(waveA, waveB, 0)];
    for (let t = tStart; t <= tEnd; t++) {
      questionCanvases.push(this._renderBlank(`t = ${t} [s]（解答欄）`));
    }

    // 解答: tStart〜tEnd の各時刻の合成波
    const answerCanvases = [];
    for (let t = tStart; t <= tEnd; t++) {
      answerCanvases.push(this._renderSuperposition(waveA, waveB, t));
    }

    return {
      questionText:
        `t = 0 のとき、下図のような 2 つの波が重なり合っている。\n` +
        `波A: 速さ ${waveA.speed} cm/s、${dirA}向き\n` +
        `波B: 速さ ${waveB.speed} cm/s、${dirB}向き\n` +
        `t = ${tStart} 〜 ${tEnd} [s] の各時刻について、\n` +
        `波A・波Bをそれぞれ点線・破線で描き、合成波を実線で記入せよ。`,
      questionCanvases,
      answerText:
        `t = ${tStart} 〜 ${tEnd} [s] の合成波（各 1 秒刻み）\n点線: 波A　破線: 波B　実線: 合成波`,
      answerCanvases,
      answerValue: null,
    };
  }

  // ================================================================
  // 反射波ヘルパー（Type6 / Type7 共通）
  // ================================================================

  /**
   * 入射波から反射波（仮想 Wave オブジェクト）を生成する。
   * 自由端: x → 2*boundary - x, y 同符号
   * 固定端: x → 2*boundary - x, y 反転
   */
  _buildReflectedWave(incidentWave, boundary, endType) {
    return incidentWave.reflect(boundary, endType);
  }

  /**
   * 反射波問題の Canvas を描画して返す。
   *
   * @param {Wave}   incidentWave 入射波
   * @param {number} boundary     媒質の端 x 座標
   * @param {string} endType      'free' | 'fixed'
   * @param {number} t            時刻
   * @param {Object} opts
   *   showIncident  {boolean} デフォルト true
   *   showReflected {boolean} デフォルト true
   *   showSum       {boolean} デフォルト true
   *   isBlank       {boolean} true = 解答欄（波なし）
   *   timeLabel     {string}  カスタムラベル（省略時 "t = N [s]"）
   */
  _renderReflectionCanvas(incidentWave, boundary, endType, t, opts = {}) {
    const {
      showIncident  = true,
      showReflected = true,
      showSum       = true,
      isBlank       = false,
      timeLabel,
    } = opts;

    const canvas = this._makeCanvas();
    const r      = this._makeRenderer(canvas, {});
    r.clear();
    r.drawBeyondMediumRegion(boundary, incidentWave.direction);  // 媒質の奥を灰色塗り
    r.drawGrid();
    r.drawAxes();
    r.drawTimeLabel(null, timeLabel !== undefined ? timeLabel : `t = ${t} [s]`);
    r.drawBoundaryLine(boundary);

    if (isBlank) return canvas;

    const { xMin, xMax }  = r.config;
    const reflectedWave   = this._buildReflectedWave(incidentWave, boundary, endType);
    const dir             = incidentWave.direction;
    // 入射波が右向き(+1) → 媒質は x ≤ boundary 側
    const medXMin = dir > 0 ? xMin     : boundary;
    const medXMax = dir > 0 ? boundary : xMax;

    // 入射波（全範囲）
    if (showIncident && !incidentWave.isEmpty()) {
      r.drawWave(incidentWave.getSnapshot(xMin, xMax, t), this._styleA);
    }

    // 反射波（媒質内のみ）
    if (showReflected && !reflectedWave.isEmpty()) {
      const pts = reflectedWave.getSnapshot(medXMin, medXMax, t);
      if (pts.length >= 2) r.drawWave(pts, this._styleB);
    }

    // 合成波（媒質内のみ）—— SineWave が絡む場合は密サンプリングにフォールバック
    if (showSum) {
      // SineWave は getKeyXs が [] を返すため、その場合は密サンプリングにフォールバック
      const incKeyXs = incidentWave.getKeyXs(t);
      const refKeyXs = reflectedWave.getKeyXs(t);
      const needsDense = (!incidentWave.isEmpty() && incKeyXs.length === 0) ||
                         (!reflectedWave.isEmpty() && refKeyXs.length === 0);

      let sumPts;
      if (needsDense) {
        const STEP = 0.05;
        const count = Math.ceil((medXMax - medXMin) / STEP);
        sumPts = [];
        for (let i = 0; i <= count; i++) {
          const xi = Math.round((medXMin + i * STEP) * 10000) / 10000;
          if (xi > medXMax + 1e-9) break;
          sumPts.push({
            x: xi,
            y: incidentWave.getYAtTime(xi, t) + reflectedWave.getYAtTime(xi, t),
          });
        }
        const lastX = sumPts.length > 0 ? sumPts[sumPts.length - 1].x : medXMin;
        if (Math.abs(lastX - medXMax) > 1e-9) {
          sumPts.push({ x: medXMax, y: incidentWave.getYAtTime(medXMax, t) + reflectedWave.getYAtTime(medXMax, t) });
        }
      } else {
        const xSet = new Set();
        for (let xi = Math.floor(medXMin); xi <= Math.ceil(medXMax); xi++) xSet.add(xi);
        incidentWave.getKeyXs(t).forEach(sx => {
          if (sx >= medXMin && sx <= medXMax) xSet.add(sx);
        });
        reflectedWave.getKeyXs(t).forEach(sx => {
          if (sx >= medXMin && sx <= medXMax) xSet.add(sx);
        });
        sumPts = [...xSet]
          .sort((a, b) => a - b)
          .filter(xi => xi >= medXMin && xi <= medXMax)
          .map(xi => ({
            x: xi,
            y: incidentWave.getYAtTime(xi, t) + reflectedWave.getYAtTime(xi, t),
          }));
      }
      if (sumPts.length >= 2) r.drawWave(sumPts, this._styleSum);
    }

    // 凡例（表示要素のみ）
    const legend = [];
    if (showIncident)  legend.push({ label: '入射波', ...this._styleA });
    if (showReflected) legend.push({ label: '反射波', ...this._styleB });
    if (showSum)       legend.push({ label: '合成波', ...this._styleSum });
    if (legend.length > 0) r.drawLegend(legend);

    return canvas;
  }

  /**
   * Type6 正答選択肢（合成波のみ + 境界線）
   */
  renderType6CorrectCanvas(waveA, boundary, endType, t) {
    return this._renderReflectionCanvas(waveA, boundary, endType, t, {
      showIncident:  false,
      showReflected: false,
      showSum:       true,
    });
  }

  /**
   * Type6 不正解選択肢（distractor を合成波スタイルで描画 + 境界線 + 灰色領域）
   * distractor は静的な折れ線（伝播しない）→ getSnapshot(_, _, 0) で描画
   * @param {number} direction 入射波の向き（灰色領域の方向）
   */
  renderType6DistractorCanvas(distractorWave, boundary, t, direction = 1) {
    const canvas = this._makeCanvas();
    const r      = this._makeRenderer(canvas, {});
    r.clear();
    r.drawBeyondMediumRegion(boundary, direction);
    r.drawGrid();
    r.drawAxes();
    r.drawTimeLabel(t);
    r.drawBoundaryLine(boundary);
    if (distractorWave && !distractorWave.isEmpty()) {
      const { xMin, xMax } = r.config;
      r.drawWave(distractorWave.getSnapshot(xMin, xMax, 0), this._styleSum);
    }
    return canvas;
  }

  // ================================================================
  // Type 6: 反射波 — 指定時刻の合成波
  // ================================================================
  generateType6(params) {
    const { waveA, boundary, endType, answerT, choicesConfig } = params;
    const endTypeStr = endType === 'free' ? '自由端' : '固定端';
    const dirStr     = waveA.direction > 0 ? '右' : '左';
    const hasChoices = choicesConfig && choicesConfig.enabled;

    const blankLabel = hasChoices
      ? `t = ${answerT} [s]（作図用）`
      : `t = ${answerT} [s]（解答欄）`;

    // 問題キャンバス: t=0 入射波参照 + 解答欄
    const questionCanvases = [
      this._renderReflectionCanvas(waveA, boundary, endType, 0, {
        showIncident: true, showReflected: false, showSum: false,
      }),
      this._renderReflectionCanvas(waveA, boundary, endType, answerT, {
        isBlank: true, timeLabel: blankLabel,
      }),
    ];

    // 解答キャンバス: 全表示
    const answerCanvases = [
      this._renderReflectionCanvas(waveA, boundary, endType, answerT),
    ];

    // 解説用スナップショット（refCanvases で _renderProblemOutput が自動検出して表示）
    const refCanvases = [];
    for (let t = 0; t <= answerT; t++) {
      refCanvases.push(this._renderReflectionCanvas(waveA, boundary, endType, t));
    }

    const result = {
      questionText:
        `t = 0 のとき、下図のような入射波が x = ${boundary} の位置にある${endTypeStr}に向かって進んでいる。\n` +
        `（速さ ${waveA.speed} cm/s、${dirStr}向き）\n` +
        `t = ${answerT} [s] のとき、媒質内の合成波を実線で記入しなさい。`,
      questionCanvases,
      answerText:
        `t = ${answerT} [s] の波の様子\n点線: 入射波　破線: 反射波　実線: 合成波`,
      answerCanvases,
      answerValue: null,
      refCanvases,
      refSectionTitle: '【解説】各時刻の入射波・反射波・合成波の様子',
      refSectionNote:  '点線: 入射波　破線: 反射波　実線: 合成波（媒質内のみ）',
    };

    // 選択肢モード
    if (hasChoices) {
      const { count, distractors = [] } = choicesConfig;
      const correctCanvas = this.renderType6CorrectCanvas(waveA, boundary, endType, answerT);
      const items = [
        { canvas: correctCanvas, isCorrect: true },
        ...distractors.slice(0, count - 1).map(d => ({
          canvas:    this.renderType6DistractorCanvas(d, boundary, answerT, waveA.direction),
          isCorrect: false,
        })),
      ];
      result.choices = { items, correctIndex: 0, count };
    }

    return result;
  }

  // ================================================================
  // Type 7: 反射波 — 複数時刻の合成波（範囲指定）
  // ================================================================
  generateType7(params) {
    const { waveA, boundary, endType, tStart, tEnd } = params;
    const endTypeStr = endType === 'free' ? '自由端' : '固定端';
    const dirStr     = waveA.direction > 0 ? '右' : '左';

    // 問題キャンバス: t=0 参照 + 各時刻の解答欄
    const questionCanvases = [
      this._renderReflectionCanvas(waveA, boundary, endType, 0, {
        showIncident: true, showReflected: false, showSum: false,
      }),
    ];
    for (let t = tStart; t <= tEnd; t++) {
      questionCanvases.push(
        this._renderReflectionCanvas(waveA, boundary, endType, t, {
          isBlank: true, timeLabel: `t = ${t} [s]（解答欄）`,
        })
      );
    }

    // 解答キャンバス: 各時刻の全表示
    const answerCanvases = [];
    for (let t = tStart; t <= tEnd; t++) {
      answerCanvases.push(this._renderReflectionCanvas(waveA, boundary, endType, t));
    }

    return {
      questionText:
        `t = 0 のとき、下図のような入射波が x = ${boundary} の位置にある${endTypeStr}に向かって進んでいる。\n` +
        `（速さ ${waveA.speed} cm/s、${dirStr}向き）\n` +
        `t = ${tStart} 〜 ${tEnd} [s] の各時刻について、媒質内の合成波を実線で記入しなさい。`,
      questionCanvases,
      answerText:
        `t = ${tStart} 〜 ${tEnd} [s] の波の様子（各 1 秒刻み）\n点線: 入射波　破線: 反射波　実線: 合成波`,
      answerCanvases,
      answerValue: null,
    };
  }
}
