/**
 * App - メインコントローラ
 * UI の状態管理、タブ切り替え、設問生成、エクスポートを統括する
 */
const App = {
  waveA: null,
  waveB: null,
  hasWaveB: false,
  editorA: null,
  editorB: null,
  gridConfig: { xMin: 0, xMax: 10, yMin: -2, yMax: 2 },
  cellSize: { w: null, h: null }, // null=自動（580×200 デフォルト）
  styleConfig: null,         // 現在アクティブな描画スタイル設定
  _customStyleConfig: null,  // カスタム設定を独立保持（プリセット切替でも消えない）
  styleMode: 'gray',         // 'gray' | 'bw' | 'custom'
  currentProblem: null,

  // ------------------------------------------------------------------
  // 初期化
  // ------------------------------------------------------------------
  init() {
    this.waveA = new Wave();
    this.waveA.label = 'A';

    this.waveB = new Wave();
    this.waveB.label = 'B';
    this.waveB.direction = -1; // デフォルトは左向き

    this._loadStyleConfig();
    this._loadCellSize();
    this._syncPresetButtons();
    this._syncGridInputs();
    this._syncCellSizeInputs();
    this._setupEditorA();
    this._bindSpeedInputs();
    this._updateProblemTypeParams();

    // タブボタン
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showTab(btn.dataset.tab, btn));
    });
  },

  // ------------------------------------------------------------------
  // グリッド設定
  // ------------------------------------------------------------------
  _syncGridInputs() {
    document.getElementById('xMin').value = this.gridConfig.xMin;
    document.getElementById('xMax').value = this.gridConfig.xMax;
    document.getElementById('yMin').value = this.gridConfig.yMin;
    document.getElementById('yMax').value = this.gridConfig.yMax;
  },

  applyGridConfig() {
    const xMin = parseFloat(document.getElementById('xMin').value);
    const xMax = parseFloat(document.getElementById('xMax').value);
    const yMin = parseFloat(document.getElementById('yMin').value);
    const yMax = parseFloat(document.getElementById('yMax').value);

    if (xMin >= xMax || yMin >= yMax) {
      alert('グリッド範囲が不正です。min < max になるように入力してください。');
      return;
    }

    // cellSize の入力もここで反映（バリデーション失敗時は変更しない）
    const newCellSize = this._readCellSizeInputs();
    if (newCellSize === null) return;  // バリデーションエラーで中断

    this.gridConfig = { xMin, xMax, yMin, yMax };
    this.cellSize   = newCellSize;
    this._saveCellSize();
    this._setupEditorA();
    if (this.hasWaveB) this._setupEditorB();
  },

  // ------------------------------------------------------------------
  // 1目盛サイズ（cellSize）— null=自動（既定 580×200 Canvas）
  // ------------------------------------------------------------------
  _loadCellSize() {
    try {
      const saved = localStorage.getItem('waveapp_cellSize');
      if (saved) {
        const obj = JSON.parse(saved);
        this.cellSize = {
          w: (typeof obj.w === 'number' && obj.w > 0) ? obj.w : null,
          h: (typeof obj.h === 'number' && obj.h > 0) ? obj.h : null,
        };
      }
    } catch (_) { this.cellSize = { w: null, h: null }; }
  },

  _saveCellSize() {
    try {
      localStorage.setItem('waveapp_cellSize', JSON.stringify(this.cellSize));
    } catch (_) {}
  },

  _syncCellSizeInputs() {
    const wEl = document.getElementById('cellPxW');
    const hEl = document.getElementById('cellPxH');
    if (wEl) wEl.value = this.cellSize.w == null ? '' : this.cellSize.w;
    if (hEl) hEl.value = this.cellSize.h == null ? '' : this.cellSize.h;
  },

  /**
   * cellSize 入力欄を読む。空欄=null、範囲外はアラート出して null を返す（呼び出し側で中断）
   * @returns {{w:number|null, h:number|null} | null}  null=バリデーションエラー
   */
  _readCellSizeInputs() {
    const min = WaveRenderer.CELL_PX_MIN;
    const max = WaveRenderer.CELL_PX_MAX;
    const parseOne = (id, label) => {
      const raw = document.getElementById(id).value.trim();
      if (raw === '') return { ok: true, value: null };
      const v = parseFloat(raw);
      if (isNaN(v) || v < min || v > max) {
        alert(`${label} は ${min} 〜 ${max} の数値、または空欄（自動）を指定してください。`);
        return { ok: false };
      }
      return { ok: true, value: v };
    };
    const w = parseOne('cellPxW', '1目盛のx方向ピクセル');
    if (!w.ok) return null;
    const h = parseOne('cellPxH', '1目盛のy方向ピクセル');
    if (!h.ok) return null;
    return { w: w.value, h: h.value };
  },

  // ------------------------------------------------------------------
  // 描画スタイル管理
  // ------------------------------------------------------------------
  _loadStyleConfig() {
    try {
      const saved = localStorage.getItem('waveapp_styleConfig');
      const mode  = localStorage.getItem('waveapp_styleMode') || 'gray';
      if (saved && mode === 'custom') {
        this.styleConfig = JSON.parse(saved);
        this.styleMode   = 'custom';
      } else {
        this.styleMode   = mode in STYLE_PRESETS ? mode : 'gray';
        this.styleConfig = cloneStylePreset(STYLE_PRESETS[this.styleMode]);
      }
      // カスタム設定を独立復元（プリセット中でも保持）
      const customSaved = localStorage.getItem('waveapp_customStyleConfig');
      if (customSaved) {
        try { this._customStyleConfig = JSON.parse(customSaved); } catch (_) {}
      }
    } catch (_) {
      this.styleMode   = 'gray';
      this.styleConfig = cloneStylePreset(STYLE_PRESETS.gray);
    }
  },

  _saveStyleConfig() {
    try {
      localStorage.setItem('waveapp_styleMode',   this.styleMode);
      localStorage.setItem('waveapp_styleConfig', JSON.stringify(this.styleConfig));
      if (this._customStyleConfig) {
        localStorage.setItem('waveapp_customStyleConfig', JSON.stringify(this._customStyleConfig));
      }
    } catch (_) {}
  },

  _syncPresetButtons() {
    ['gray', 'bw', 'custom'].forEach(m => {
      const btn = document.getElementById(`presetBtn_${m}`);
      if (btn) btn.classList.toggle('active', m === this.styleMode);
    });
  },

  applyStylePreset(mode) {
    if (mode === 'custom') {
      // カスタムモードはモーダルを開いて設定させる
      this._openStyleModal();
      return;
    }
    this.styleMode   = mode;
    this.styleConfig = cloneStylePreset(STYLE_PRESETS[mode]);
    this._saveStyleConfig();
    this._syncPresetButtons();
    this._applyStyleToAll();
  },

  _applyStyleToAll() {
    // エディタ再描画
    if (this.editorA) { this._setupEditorA(); }
    if (this.editorB && this.hasWaveB) { this._setupEditorB(); }
  },

  // ------------------------------------------------------------------
  // カスタムスタイル モーダル
  // ------------------------------------------------------------------
  _openStyleModal() {
    this._syncModalToStyle();
    document.getElementById('styleModal').style.display = 'flex';
  },

  closeStyleModal() {
    document.getElementById('styleModal').style.display = 'none';
  },

  _syncModalToStyle() {
    // カスタム設定が保存されていればそちらを優先（プリセット切替後も値を維持）
    const config = this._customStyleConfig || this.styleConfig;
    const keys = ['grid', 'waveA', 'waveB', 'waveSum', 'waveSingle'];
    keys.forEach(key => {
      const s = config[key] || {};
      document.getElementById(`sc-${key}-color`).value = s.color   || '#000000';
      document.getElementById(`sc-${key}-lw`).value    = s.lineWidth ?? 1;
      document.getElementById(`sc-${key}-dash`).value  = s.dashed ? 'dashed' : 'solid';
      document.getElementById(`sc-${key}-dp`).value    = (s.dashPattern || []).join(', ');
      document.getElementById(`sc-${key}-dp`).disabled = !s.dashed;
    });
  },

  _onModalDashChange(key) {
    const dashed = document.getElementById(`sc-${key}-dash`).value === 'dashed';
    document.getElementById(`sc-${key}-dp`).disabled = !dashed;
  },

  applyCustomStyle() {
    const keys = ['grid', 'waveA', 'waveB', 'waveSum', 'waveSingle'];
    const result = {};
    keys.forEach(key => {
      const dashed = document.getElementById(`sc-${key}-dash`).value === 'dashed';
      const dpRaw  = document.getElementById(`sc-${key}-dp`).value;
      result[key] = {
        color:       document.getElementById(`sc-${key}-color`).value,
        lineWidth:   parseFloat(document.getElementById(`sc-${key}-lw`).value) || 1,
        dashed,
        dashPattern: dashed
          ? dpRaw.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v))
          : [],
      };
    });
    this.styleConfig        = result;
    this._customStyleConfig = result; // プリセット切替後も値を保持
    this.styleMode          = 'custom';
    this._saveStyleConfig();
    this._syncPresetButtons();
    this._applyStyleToAll();
    this.closeStyleModal();
  },

  // ------------------------------------------------------------------
  // 波形エディタ
  // ------------------------------------------------------------------
  /**
   * エディタ Canvas に gridConfig + cellSize から算出した寸法を適用する
   * （pixelRatio=1。HTMLからは width/height 属性を削除済み）
   */
  _applyEditorCanvasSize(canvas) {
    const size = WaveRenderer.computeCanvasSize(this.gridConfig, this.cellSize);
    canvas.width        = size.width;
    canvas.height       = size.height;
    canvas.style.width  = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
  },

  _setupEditorA() {
    const canvas = document.getElementById('editorCanvasA');
    this._applyEditorCanvasSize(canvas);
    const renderer = new WaveRenderer(canvas, Object.assign({}, this.gridConfig, {
      gridStyle: this.styleConfig ? this.styleConfig.grid : undefined,
    }));
    if (this.editorA) {
      // グリッド設定変更時: レンダラだけ差し替えて再描画（DOM 操作不要）
      this.editorA.renderer = renderer;
      this.editorA.render();
    } else {
      this.editorA = new WaveEditor(canvas, this.waveA, renderer, () => {});
    }
  },

  _setupEditorB() {
    const canvas = document.getElementById('editorCanvasB');
    this._applyEditorCanvasSize(canvas);
    const renderer = new WaveRenderer(canvas, Object.assign({}, this.gridConfig, {
      gridStyle: this.styleConfig ? this.styleConfig.grid : undefined,
    }));
    if (this.editorB) {
      this.editorB.renderer = renderer;
      this.editorB.render();
    } else {
      this.editorB = new WaveEditor(canvas, this.waveB, renderer, () => {});
    }
  },

  // ------------------------------------------------------------------
  // 波 B の追加 / 削除
  // ------------------------------------------------------------------
  toggleWaveB() {
    this.hasWaveB = !this.hasWaveB;
    document.getElementById('waveBSection').style.display    = this.hasWaveB ? 'block' : 'none';
    document.getElementById('editorBSection').style.display  = this.hasWaveB ? 'block' : 'none';
    document.getElementById('addWaveBBtn').style.display     = this.hasWaveB ? 'none'  : 'inline-block';

    if (this.hasWaveB) {
      this._setupEditorB();
      document.getElementById('optType4').disabled = false;
      document.getElementById('optType5').disabled = false;
    } else {
      document.getElementById('optType4').disabled = true;
      document.getElementById('optType5').disabled = true;
      const cur = document.getElementById('problemType').value;
      if (cur === 'type4' || cur === 'type5') {
        document.getElementById('problemType').value = 'type1';
        this._updateProblemTypeParams();
      }
    }
  },

  // ------------------------------------------------------------------
  // 方向ボタン
  // ------------------------------------------------------------------
  setDirection(waveName, dir) {
    const wave = waveName === 'A' ? this.waveA : this.waveB;
    wave.direction = dir;

    const prefix = waveName === 'A' ? 'waveA' : 'waveB';
    document.getElementById(`${prefix}DirRight`).classList.toggle('active', dir === 1);
    document.getElementById(`${prefix}DirLeft`).classList.toggle('active', dir === -1);
  },

  // ------------------------------------------------------------------
  // 波形クリア
  // ------------------------------------------------------------------
  clearWave(waveName) {
    if (waveName === 'A') {
      this.waveA.clear();
      this.editorA && this.editorA.render();
    } else {
      this.waveB.clear();
      this.editorB && this.editorB.render();
    }
  },

  // ------------------------------------------------------------------
  // 速さ入力のバインド
  // ------------------------------------------------------------------
  _bindSpeedInputs() {
    document.getElementById('waveASpeed').addEventListener('change', e => {
      const v = parseFloat(e.target.value); this.waveA.speed = isNaN(v) ? 1 : v;
    });
    document.getElementById('waveBSpeed').addEventListener('change', e => {
      const v = parseFloat(e.target.value); this.waveB.speed = isNaN(v) ? 1 : v;
    });
  },

  // ------------------------------------------------------------------
  // タブ切り替え
  // ------------------------------------------------------------------
  showTab(tabName, clickedBtn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    if (clickedBtn) clickedBtn.classList.add('active');

    if (tabName === 'preview') this.renderPreview();
  },

  // ------------------------------------------------------------------
  // 進行波プレビュー
  // ------------------------------------------------------------------
  renderPreview() {
    const tMax = parseInt(document.getElementById('previewTMax').value, 10) || 5;
    const container = document.getElementById('previewContainer');
    container.innerHTML = '';

    const waves  = this.hasWaveB ? [this.waveA, this.waveB] : [this.waveA];
    const sc = this.styleConfig;
    const styles = this.hasWaveB
      ? [sc.waveA, sc.waveB]
      : [sc.waveSingle];

    const size = WaveRenderer.computeCanvasSize(this.gridConfig, this.cellSize);
    const PR   = 2;

    for (let t = 0; t <= tMax; t++) {
      const canvas = document.createElement('canvas');
      canvas.width        = size.width  * PR;
      canvas.height       = size.height * PR;
      canvas.style.width  = `${size.width}px`;
      canvas.style.height = `${size.height}px`;

      const renderer = new WaveRenderer(canvas, Object.assign({}, this.gridConfig, {
        pixelRatio: PR,
        gridStyle: this.styleConfig ? this.styleConfig.grid : undefined,
      }));
      renderer.renderFull(waves, t, { styles });

      const dlBtn = document.createElement('button');
      dlBtn.textContent = `t=${t}s PNG`;
      dlBtn.className = 'dl-btn';
      dlBtn.onclick = () => Exporter.downloadCanvasPNG(canvas, `wave_t${t}.png`);

      const row = document.createElement('div');
      row.className = 'preview-row';
      row.appendChild(canvas);
      row.appendChild(dlBtn);
      container.appendChild(row);
    }
  },

  downloadAllPreviewPNGs() {
    const canvases = document.querySelectorAll('#previewContainer canvas');
    canvases.forEach((c, i) => Exporter.downloadCanvasPNG(c, `wave_t${i}.png`));
  },

  // ------------------------------------------------------------------
  // 設問タイプ切り替え
  // ------------------------------------------------------------------
  _updateProblemTypeParams() {
    const type = document.getElementById('problemType').value;
    ['type1', 'type2', 'type3', 'type4', 'type5'].forEach(t => {
      const el = document.getElementById(`params-${t}`);
      if (el) el.style.display = (t === type) ? 'flex' : 'none';
    });
  },

  onProblemTypeChange() {
    this._updateProblemTypeParams();
  },

  // ------------------------------------------------------------------
  // 設問生成
  // ------------------------------------------------------------------
  generateProblem() {
    // 速さを最新化
    const _spd = (id) => { const v = parseFloat(document.getElementById(id).value); return isNaN(v) ? 1 : v; };
    this.waveA.speed = _spd('waveASpeed');
    if (this.hasWaveB) {
      this.waveB.speed = _spd('waveBSpeed');
    }

    if (this.waveA.vertices.length === 0) {
      alert('波Aの波形が入力されていません。波形編集タブで波形を描いてください。');
      return;
    }

    const type = document.getElementById('problemType').value;
    const generator = new ProblemGenerator({
      gridConfig:  this.gridConfig,
      styleConfig: this.styleConfig,
      cellSize:    this.cellSize,
    });

    let result;
    try {
      const _int  = (id, def) => { const v = parseInt(document.getElementById(id).value, 10);  return isNaN(v) ? def : v; };
      const _float = (id, def) => { const v = parseFloat(document.getElementById(id).value);      return isNaN(v) ? def : v; };

      if (type === 'type1') {
        const answerT = _int('p1-answerT', 2);
        result = generator.generateType1({ wave: this.waveA, answerT });
      } else if (type === 'type2') {
        const t = _int('p2-t', 1);
        const x = _float('p2-x', 3);
        result = generator.generateType2({ wave: this.waveA, x, t });
      } else if (type === 'type3') {
        const x    = _float('p3-x', 3);
        const tMax = _int('p3-tMax', 5);
        result = generator.generateType3({ wave: this.waveA, x, tMax });
      } else if (type === 'type4') {
        if (!this.hasWaveB || this.waveB.vertices.length === 0) {
          alert('Type 4 には波Bの波形が必要です。');
          return;
        }
        const answerT = _int('p4-answerT', 2);
        result = generator.generateType4({ waveA: this.waveA, waveB: this.waveB, answerT });
      } else if (type === 'type5') {
        if (!this.hasWaveB || this.waveB.vertices.length === 0) {
          alert('Type 5 には波Bの波形が必要です。');
          return;
        }
        const tStart = _int('p5-tStart', 0);
        const tEnd   = _int('p5-tEnd',   5);
        if (tEnd <= tStart) { alert('終了時刻は開始時刻より大きくしてください。'); return; }
        result = generator.generateType5({ waveA: this.waveA, waveB: this.waveB, tStart, tEnd });
      }
    } catch (e) {
      console.error(e);
      alert('設問の生成中にエラーが発生しました: ' + e.message);
      return;
    }

    this.currentProblem = result;
    this._renderProblemOutput(result);
    document.getElementById('exportControls').style.display = 'flex';
  },

  // ------------------------------------------------------------------
  // 設問出力の描画
  // ------------------------------------------------------------------
  _renderProblemOutput(result) {
    const container = document.getElementById('problemOutput');
    container.innerHTML = '';

    // 問題セクション
    const qSection = document.createElement('div');
    qSection.className = 'output-section';
    qSection.innerHTML = '<h3>【問題】</h3>';

    const qText = document.createElement('p');
    qText.className = 'problem-text';
    qText.textContent = result.questionText;
    qSection.appendChild(qText);

    this._appendCanvases(qSection, result.questionCanvases, 'q');
    container.appendChild(qSection);

    // 解答セクション
    const aSection = document.createElement('div');
    aSection.className = 'output-section answer-section';
    aSection.innerHTML = '<h3>【解答】</h3>';

    if (result.answerValue !== null && result.answerValue !== undefined) {
      const aVal = document.createElement('div');
      aVal.className = 'answer-value';
      aVal.textContent = result.answerText;
      aSection.appendChild(aVal);
    } else if (result.answerText) {
      const aNote = document.createElement('p');
      aNote.className = 'answer-note';
      aNote.textContent = result.answerText;
      aSection.appendChild(aNote);
    }

    // answerCanvases は refCanvases 込みで渡されることがあるが、
    // Type3 は refCanvases を別セクションで表示するため先頭1枚のみここに表示
    const mainAnswerCanvases = result.refCanvases
      ? result.answerCanvases.slice(0, 1)
      : result.answerCanvases;
    this._appendCanvases(aSection, mainAnswerCanvases, 'a');
    container.appendChild(aSection);

    // Type3: 解説セクション（各時刻の y-x グラフ + 地点マーカー）
    if (result.refCanvases && result.refCanvases.length > 0) {
      const refSection = document.createElement('div');
      refSection.className = 'output-section';
      refSection.innerHTML =
        '<h3>【解説】各時刻の波形と観測地点</h3>' +
        '<p class="answer-note">各コマの ● の高さを読み取り、y−t グラフの対応する t の列にプロットしてください。</p>';

      const grid = document.createElement('div');
      grid.className = 'ref-canvas-grid';

      result.refCanvases.forEach((canvas, i) => {
        canvas.style.width  = '290px';
        canvas.style.height = '100px';

        const dlBtn = document.createElement('button');
        dlBtn.textContent = '画像DL';
        dlBtn.className = 'dl-btn';
        dlBtn.onclick = () => Exporter.downloadCanvasPNG(canvas, `ref_t${i}.png`);

        const item = document.createElement('div');
        item.className = 'ref-canvas-item';
        item.appendChild(canvas);
        item.appendChild(dlBtn);
        grid.appendChild(item);
      });

      refSection.appendChild(grid);
      container.appendChild(refSection);
    }
  },

  _appendCanvases(section, canvases, prefix) {
    canvases.forEach((canvas, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'canvas-wrapper';

      const dlBtn = document.createElement('button');
      dlBtn.textContent = '画像DL';
      dlBtn.className = 'dl-btn';
      dlBtn.onclick = () => Exporter.downloadCanvasPNG(canvas, `${prefix}_${i + 1}.png`);

      wrapper.appendChild(canvas);
      wrapper.appendChild(dlBtn);
      section.appendChild(wrapper);
    });
  },

  // ------------------------------------------------------------------
  // エクスポート
  // ------------------------------------------------------------------
  async exportProblemPDF() {
    if (!this.currentProblem) return;
    const r = this.currentProblem;
    await Exporter.generatePDF(
      '波の重ね合わせ 問題',
      [{ label: '問題', text: r.questionText, canvases: r.questionCanvases }],
      'wave_question.pdf'
    );
  },

  async exportAnswerPDF() {
    if (!this.currentProblem) return;
    const r = this.currentProblem;
    const sections = [
      { label: '問題', text: r.questionText, canvases: r.questionCanvases },
      { label: '解答', text: r.answerText,   canvases: r.answerCanvases },
    ];
    await Exporter.generatePDF('波の重ね合わせ 解答', sections, 'wave_answer.pdf');
  },

  async exportZIP() {
    if (!this.currentProblem) return;
    const r = this.currentProblem;
    const images = {};
    r.questionCanvases.forEach((c, i) => { images[`question_${i + 1}.png`] = c; });
    r.answerCanvases.forEach((c, i)   => { images[`answer_${i + 1}.png`]   = c; });
    await Exporter.generateZIP(images, 'wave_images.zip');
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
