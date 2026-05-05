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
      if (!wave || wave.vertices.length === 0) return;
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
    if (waveA.vertices.length > 0)
      r.drawWave(waveA.getSnapshot(xMin, xMax, t), this._styleA);
    if (waveB.vertices.length > 0)
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

    if (waveA.vertices.length > 0)
      r.drawWave(waveA.getSnapshot(xMin, xMax, t), this._styleA);
    if (waveB.vertices.length > 0)
      r.drawWave(waveB.getSnapshot(xMin, xMax, t), this._styleB);

    // 合成波（全頂点位置を union して正確に描画）
    const xSet = new Set();
    for (let xi = Math.floor(xMin); xi <= Math.ceil(xMax); xi++) xSet.add(xi);
    const shiftA = waveA.direction * waveA.speed * t;
    const shiftB = waveB.direction * waveB.speed * t;
    waveA.vertices.forEach(v => xSet.add(v.x + shiftA));
    waveB.vertices.forEach(v => xSet.add(v.x + shiftB));

    const sumPts = [...xSet]
      .sort((a, b) => a - b)
      .filter(xi => xi >= xMin && xi <= xMax)
      .map(xi => ({ x: xi, y: waveA.getYAtTime(xi, t) + waveB.getYAtTime(xi, t) }));

    r.drawWave(sumPts, this._styleSum);
    r.drawLegend(this._legendAB);
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
          pts.push({ x: ti, y: wave.getYAtTime(x, ti) });
        }
        pts.push({ x: tMax, y: wave.getYAtTime(x, tMax) });
        r.drawWave(pts, this._styleSingle);
      }
      return canvas;
    };

    // 参考用: t ごとの y-x 進行波スナップショット + x=○ の地点マーカー
    const makeSnapWithMarker = (t) => {
      const canvas = this._makeCanvas();
      const r      = this._makeRenderer(canvas, {});
      r.clear();
      r.drawGrid();
      r.drawAxes();
      r.drawTimeLabel(t);
      const { xMin, xMax } = r.config;
      r.drawWave(wave.getSnapshot(xMin, xMax, t), this._styleSingle);
      // x=○ の地点に縦破線ガイド＋目立つ丸マーカー
      const y = wave.getYAtTime(x, t);
      r.drawPointMarker(x, y);
      return canvas;
    };

    // 参考画像: t=0〜tMax の各整数時刻の y-x グラフ（地点マーカー付き）
    const refCanvases = [];
    for (let t = 0; t <= tMax; t++) {
      refCanvases.push(makeSnapWithMarker(t));
    }

    return {
      questionText:
        `x = ${x} [cm] の地点の媒質について、\n` +
        `t = 0 〜 ${tMax} [s] の変位の変化を y − t グラフで示せ。`,
      questionCanvases: [
        this._renderSnapshot([wave], 0, [this._styleSingle], { timeLabel: 't = 0 [s]（参考）' }),
        makeYtCanvas(false),
      ],
      answerText:    `x = ${x} [cm] の y − t グラフ`,
      answerCanvases: [makeYtCanvas(true), ...refCanvases],
      answerValue:   null,
      // 参考画像を別キーで渡す（_renderProblemOutput で参照用ラベルを付けるため）
      refCanvases,
    };
  }

  // ================================================================
  // Type 4: 重ね合わせ（指定時刻の合成波）
  // ================================================================
  generateType4(params) {
    const { waveA, waveB, answerT } = params;
    const dirA = waveA.direction > 0 ? '右' : '左';
    const dirB = waveB.direction > 0 ? '右' : '左';

    const questionCanvases = [
      this._renderWavesOnly(waveA, waveB, 0),
      this._renderBlank(`t = ${answerT} [s]（解答欄）`),
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
}
