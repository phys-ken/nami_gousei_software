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

  // 選択肢モード設定（Type3 / Type4 / Type6 対象）
  // distractors[] には Wave インスタンスが入る（count - 1 個、正答は別途自動生成）
  // source は将来 'auto'（自動生成）を追加できるように布石
  choicesConfig: {
    type3: { enabled: false, count: 6, source: 'manual', distractors: [] },
    type4: { enabled: false, count: 6, source: 'manual', distractors: [] },
    type6: { enabled: false, count: 4, source: 'manual', distractors: [] },
  },
  // 選択肢エディタ用 WaveEditor インスタンスを保持（再生成時のクリーンアップ用）
  _choiceEditors: { type3: [], type4: [], type6: [] },

  // 反射波モード設定
  reflectionConfig: {
    enabled:  false,
    boundary: 5,      // 媒質の端 x 座標
    endType:  'free', // 'free'（自由端）| 'fixed'（固定端）
  },

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
    this._loadChoicesConfig();
    this._loadReflectionConfig();
    this._syncPresetButtons();
    this._syncGridInputs();
    this._syncCellSizeInputs();
    this._setupEditorA();
    this._bindSpeedInputs();
    this._bindChoicesParamRefresh();
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
    this._refreshActiveChoicesPanel();
  },

  /** 現在選択中の Type の選択肢パネルを再描画（gridConfig や style の変更を反映） */
  _refreshActiveChoicesPanel() {
    const type = document.getElementById('problemType').value;
    if (['type3', 'type4', 'type6'].includes(type) && this.choicesConfig[type]?.enabled) {
      this._renderChoicesPanel(type);
    }
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
  // 選択肢モード（Type3 / Type4）— 状態管理
  // ------------------------------------------------------------------

  /** localStorage から復元（distractors は Wave インスタンスとして再構築） */
  _loadChoicesConfig() {
    try {
      const saved = localStorage.getItem('waveapp_choicesConfig');
      if (!saved) return;
      const obj = JSON.parse(saved);
      ['type3', 'type4', 'type6'].forEach(t => {
        const c = obj[t];
        if (!c) return;
        this.choicesConfig[t].enabled = !!c.enabled;
        this.choicesConfig[t].count   = (typeof c.count === 'number' && c.count >= 2 && c.count <= 10) ? c.count : 6;
        this.choicesConfig[t].source  = c.source || 'manual';
        this.choicesConfig[t].distractors = (c.distractors || []).map(json => new Wave().fromJSON(json));
      });
    } catch (_) {/* 失敗時はデフォルトのまま */}
  },

  _saveChoicesConfig() {
    try {
      const out = {};
      ['type3', 'type4', 'type6'].forEach(t => {
        const c = this.choicesConfig[t];
        out[t] = {
          enabled: c.enabled,
          count:   c.count,
          source:  c.source,
          distractors: c.distractors.map(w => w.toJSON()),
        };
      });
      localStorage.setItem('waveapp_choicesConfig', JSON.stringify(out));
    } catch (_) {}
  },

  /** type の distractors に頂点が1つでもあれば true */
  _choicesHasContent(type) {
    return this.choicesConfig[type].distractors.some(w => w.vertices.length > 0);
  },

  /**
   * 選択肢数を変更（Wave 配列を伸縮）
   * 必要数 = count - 1（正答は自動生成のため distractors には含めない）
   */
  _resizeDistractors(type, count) {
    const need = Math.max(0, count - 1);
    const arr  = this.choicesConfig[type].distractors;
    while (arr.length < need) arr.push(new Wave());
    while (arr.length > need) arr.pop();
  },

  /**
   * トグルボタンのクリックハンドラ
   * OFF→ON: そのまま展開
   * ON→OFF: distractors に頂点があれば確認ダイアログを出す
   */
  toggleChoicesMode(type) {
    const cfg = this.choicesConfig[type];
    if (cfg.enabled) {
      // 無効化しようとしている: 内容がある場合は確認
      if (this._choicesHasContent(type)) {
        const ok = confirm('選択肢モードを無効化すると、現在の選択肢の波形は削除されます。よろしいですか？');
        if (!ok) return;  // キャンセル: トグル状態を変更しない
        cfg.distractors.forEach(w => w.clear());
      }
      cfg.enabled = false;
    } else {
      // 有効化: 必要な数だけ Wave を確保
      cfg.enabled = true;
      this._resizeDistractors(type, cfg.count);
    }
    this._saveChoicesConfig();
    this._renderChoicesPanel(type);
  },

  /** 選択肢数の input が変わったとき */
  onChoicesCountChange(type) {
    const el = document.getElementById(`choices-${type}-count`);
    let n = parseInt(el.value, 10);
    if (isNaN(n) || n < 2) n = 2;
    if (n > 10) n = 10;
    el.value = n;
    this.choicesConfig[type].count = n;
    this._resizeDistractors(type, n);
    this._saveChoicesConfig();
    this._renderChoicesPanel(type);
  },

  /** 個別の選択肢をクリア */
  clearDistractor(type, idx) {
    const w = this.choicesConfig[type].distractors[idx];
    if (!w) return;
    w.clear();
    const ed = this._choiceEditors[type][idx];
    if (ed) ed.render();
  },

  /** 正答プレビューを再描画（波A・波B・パラメータの変更を反映） */
  refreshCorrectPreview(type) {
    if (!this.choicesConfig[type].enabled) return;
    this._renderChoicesList(type);
  },

  // ------------------------------------------------------------------
  // 選択肢モード — UI レンダリング
  // ------------------------------------------------------------------

  /** トグルボタンの ON/OFF 表示 + パネルの表示切替 + リスト再描画 */
  _renderChoicesPanel(type) {
    const cfg     = this.choicesConfig[type];
    const toggle  = document.getElementById(`choices-${type}-toggle`);
    const panel   = document.getElementById(`choices-${type}-panel`);
    const status  = document.getElementById(`choices-${type}-status`);
    const countEl = document.getElementById(`choices-${type}-count`);
    if (!toggle || !panel) return;

    toggle.classList.toggle('on', cfg.enabled);
    panel.style.display = cfg.enabled ? 'block' : 'none';
    if (countEl) countEl.value = cfg.count;

    if (cfg.enabled) {
      status.textContent = `${cfg.count} 択（① 正答 + ${cfg.count - 1} 個の不正解）`;
      this._renderChoicesList(type);
    } else {
      status.textContent = '記述式（解答画像を表示）';
      // エディタインスタンスをクリア
      this._choiceEditors[type] = [];
    }
  },

  /** 選択肢一覧（正答 + distractors）を描画 */
  _renderChoicesList(type) {
    const cfg     = this.choicesConfig[type];
    const listEl  = document.getElementById(`choices-${type}-list`);
    if (!listEl) return;
    listEl.innerHTML = '';
    this._choiceEditors[type] = [];

    // 1) 選択肢① = 正答（システム生成・読み取り専用）
    const correctItem = this._buildChoiceItemContainer(1, true);
    const correctCanvas = this._renderCorrectChoiceCanvas(type);
    if (correctCanvas) {
      // 描画専用の Canvas（編集不可）。スタイルだけ揃える
      correctCanvas.style.cursor = 'default';
      correctItem.canvasArea.appendChild(correctCanvas);
    } else {
      const note = document.createElement('p');
      note.className = 'answer-note';
      note.textContent = type === 'type3'
        ? '波A の波形と地点 x・tMax を設定すると正答が表示されます。'
        : '波A・波B の波形と解答時刻 t を設定すると正答が表示されます。';
      correctItem.canvasArea.appendChild(note);
    }
    listEl.appendChild(correctItem.root);

    // 2) 選択肢② 〜 ⑥（distractors）= ユーザ入力
    for (let i = 0; i < cfg.distractors.length; i++) {
      const item = this._buildChoiceItemContainer(i + 2, false, () => this.clearDistractor(type, i));
      const canvas = this._buildDistractorCanvas(type, i);
      item.canvasArea.appendChild(canvas);
      listEl.appendChild(item.root);

      // WaveEditor を生成
      const wave     = cfg.distractors[i];
      const renderer = this._buildDistractorRenderer(type, canvas);
      const editor   = new WaveEditor(canvas, wave, renderer, () => this._saveChoicesConfig());
      this._choiceEditors[type].push(editor);
    }
  },

  /** 選択肢アイテムの外枠を生成（ヘッダー + canvasArea） */
  _buildChoiceItemContainer(displayNumber, isCorrect, onClear) {
    const root = document.createElement('div');
    root.className = 'choice-item';

    const header = document.createElement('div');
    header.className = 'choice-item-header';

    const label = document.createElement('span');
    label.className = 'choice-item-label';
    label.textContent = `選択肢 ${this._numToCircled(displayNumber)}`;
    header.appendChild(label);

    if (isCorrect) {
      const badge = document.createElement('span');
      badge.className = 'choice-item-correct-badge';
      badge.textContent = '正答';
      header.appendChild(badge);
    } else {
      const note = document.createElement('span');
      note.className = 'choices-hint';
      note.textContent = 'クリックで頂点を追加・移動／右クリックで削除';
      header.appendChild(note);

      if (onClear) {
        const btn = document.createElement('button');
        btn.className = 'choice-item-clear-btn';
        btn.textContent = 'クリア';
        btn.onclick = onClear;
        header.appendChild(btn);
      }
    }

    const canvasArea = document.createElement('div');
    root.appendChild(header);
    root.appendChild(canvasArea);
    return { root, canvasArea };
  },

  /** ① ② ③ ... ⑩ の丸数字（11以上は (11) のように括弧表記） */
  _numToCircled(n) {
    const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
    return n >= 1 && n <= 10 ? circled[n - 1] : `(${n})`;
  },

  /** 正答 Canvas を生成（ProblemGenerator のヘルパーを利用） */
  _renderCorrectChoiceCanvas(type) {
    const gen = new ProblemGenerator({
      gridConfig:  this.gridConfig,
      styleConfig: this.styleConfig,
      cellSize:    this.cellSize,
    });

    if (type === 'type3') {
      if (this.waveA.vertices.length === 0) return null;
      const x    = parseFloat(document.getElementById('p3-x').value);
      const tMax = parseInt(document.getElementById('p3-tMax').value, 10);
      if (isNaN(x) || isNaN(tMax) || tMax < 1) return null;
      return gen.renderType3CorrectCanvas(this.waveA, x, tMax);
    } else if (type === 'type4') {
      if (!this.hasWaveB) return null;
      if (this.waveA.vertices.length === 0 || this.waveB.vertices.length === 0) return null;
      const t = parseInt(document.getElementById('p4-answerT').value, 10);
      if (isNaN(t) || t < 1) return null;
      // 速さも最新化
      const sa = parseFloat(document.getElementById('waveASpeed').value);
      const sb = parseFloat(document.getElementById('waveBSpeed').value);
      if (!isNaN(sa)) this.waveA.speed = sa;
      if (!isNaN(sb)) this.waveB.speed = sb;
      return gen.renderType4CorrectCanvas(this.waveA, this.waveB, t);
    } else if (type === 'type6') {
      if (!this.reflectionConfig.enabled || this.waveA.vertices.length === 0) return null;
      const t = parseInt(document.getElementById('t6-answer').value, 10);
      if (isNaN(t) || t < 1) return null;
      const sa = parseFloat(document.getElementById('waveASpeed').value);
      if (!isNaN(sa)) this.waveA.speed = sa;
      return gen.renderType6CorrectCanvas(
        this.waveA, this.reflectionConfig.boundary, this.reflectionConfig.endType, t
      );
    }
    return null;
  },

  /** distractor 用 Canvas（編集可能） */
  _buildDistractorCanvas(type, idx) {
    const canvas = document.createElement('canvas');
    canvas.id = `distractor-${type}-${idx}`;
    canvas.style.cursor = 'crosshair';
    const size = this._distractorCanvasSize(type);
    canvas.width        = size.width;
    canvas.height       = size.height;
    canvas.style.width  = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    return canvas;
  },

  /** distractor エディタ用 Renderer（pixelRatio=1） */
  _buildDistractorRenderer(type, canvas) {
    const cfg = this._distractorGridConfig(type);
    return new WaveRenderer(canvas, Object.assign({}, cfg, {
      gridStyle: this.styleConfig ? this.styleConfig.grid : undefined,
    }));
  },

  /**
   * distractor エディタの gridConfig
   * Type3: y-t グラフ → x軸=t [0, tMax], y軸=メイングリッドの yMin/yMax
   * Type4/Type6: y-x グラフ → メイングリッドと同じ
   */
  _distractorGridConfig(type) {
    if (type === 'type3') {
      const tMax = parseInt(document.getElementById('p3-tMax').value, 10) || 6;
      return {
        xMin: 0, xMax: tMax,
        yMin: this.gridConfig.yMin, yMax: this.gridConfig.yMax,
      };
    }
    return Object.assign({}, this.gridConfig);
  },

  /** distractor Canvas のサイズ（出力と揃える） */
  _distractorCanvasSize(type) {
    const gc = this._distractorGridConfig(type);
    // Type3 は y-t グラフ → 横幅は固定 580px（出力ルールと同じ）、縦のみ cellSize.h を反映
    const cs = type === 'type3'
      ? { w: null, h: this.cellSize ? this.cellSize.h : null }
      : this.cellSize;
    return WaveRenderer.computeCanvasSize(gc, cs);
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
    this._refreshActiveChoicesPanel();
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
    const extra = this.reflectionConfig.enabled ? {
      boundary:          this.reflectionConfig.boundary,
      boundaryDirection: this.waveA.direction,
    } : {};
    const renderer = new WaveRenderer(canvas, Object.assign({}, this.gridConfig, {
      gridStyle: this.styleConfig ? this.styleConfig.grid : undefined,
    }, extra));
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
    // 反射波モードが有効な状態で波Bを追加しようとする場合は反射モードを先に無効化
    if (!this.hasWaveB && this.reflectionConfig.enabled) {
      this._toggleReflectionMode(false);
    }
    this.hasWaveB = !this.hasWaveB;
    document.getElementById('waveBSection').style.display    = this.hasWaveB ? 'block' : 'none';
    document.getElementById('editorBSection').style.display  = this.hasWaveB ? 'block' : 'none';
    document.getElementById('addWaveBBtn').style.display     = this.hasWaveB ? 'none'  : 'inline-block';
    if (this.hasWaveB) this._setupEditorB();
    this._updateProblemTypeGating();
  },

  // ------------------------------------------------------------------
  // 反射波モード
  // ------------------------------------------------------------------

  /** 反射波モードを有効 / 無効にする */
  _toggleReflectionMode(enable) {
    // 波Bが有効な状態で反射モードを有効化しようとする場合は波Bを先に無効化
    if (enable && this.hasWaveB) {
      this.hasWaveB = false;
      document.getElementById('waveBSection').style.display   = 'none';
      document.getElementById('editorBSection').style.display = 'none';
      document.getElementById('addWaveBBtn').style.display    = 'inline-block';
    }
    this.reflectionConfig.enabled = enable;

    const section = document.getElementById('reflectionSection');
    const addBtn  = document.getElementById('addReflectionBtn');
    if (section) section.style.display = enable ? 'block' : 'none';
    if (addBtn)  addBtn.style.display  = enable ? 'none'  : 'inline-block';

    this._updateProblemTypeGating();
    this._setupEditorA();    // 境界線の有無を反映
    this._saveReflectionConfig();
  },

  /**
   * タイプ選択肢の disabled 状態を一括更新（モード変更時に呼ぶ）
   * ・通常モード: type1/2/3 有効、type4/5/6/7 無効
   * ・波Bモード: type4/5 有効、type1/2/3/6/7 無効
   * ・反射波モード: type6/7 有効、type1/2/3/4/5 無効
   */
  _updateProblemTypeGating() {
    const hasWaveB   = this.hasWaveB;
    const reflActive = this.reflectionConfig.enabled;

    const setDisabled = (id, disabled) => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    };
    setDisabled('optType1', hasWaveB || reflActive);
    setDisabled('optType2', hasWaveB || reflActive);
    setDisabled('optType3', hasWaveB || reflActive);
    setDisabled('optType4', !hasWaveB);
    setDisabled('optType5', !hasWaveB);
    setDisabled('optType6', !reflActive);
    setDisabled('optType7', !reflActive);

    // 現在選択中のタイプが使えなくなる場合は適切なタイプへ切り替える
    const cur = document.getElementById('problemType').value;
    const unavailable =
      ((!hasWaveB && !reflActive) && (cur === 'type4' || cur === 'type5')) ||
      (!hasWaveB && (cur === 'type4' || cur === 'type5')) ||
      (!reflActive && (cur === 'type6' || cur === 'type7')) ||
      ((hasWaveB || reflActive) && (cur === 'type1' || cur === 'type2' || cur === 'type3'));
    if (unavailable) {
      const newType = reflActive ? 'type6' : (hasWaveB ? 'type4' : 'type1');
      document.getElementById('problemType').value = newType;
      this._updateProblemTypeParams();
    }
  },

  /** 反射設定を localStorage から復元してUIに反映 */
  _loadReflectionConfig() {
    try {
      const saved = localStorage.getItem('waveapp_reflectionConfig');
      if (saved) {
        const obj = JSON.parse(saved);
        if (typeof obj.boundary === 'number') this.reflectionConfig.boundary = obj.boundary;
        if (obj.endType === 'free' || obj.endType === 'fixed') this.reflectionConfig.endType = obj.endType;
        if (obj.enabled) this._toggleReflectionMode(true);
      }
    } catch (_) {}
    // UI 同期（enabled 未設定のときも境界値・反射タイプ表示を揃える）
    const bEl = document.getElementById('reflBoundary');
    if (bEl) bEl.value = this.reflectionConfig.boundary;
    const freeBtn  = document.getElementById('reflFreeBtn');
    const fixedBtn = document.getElementById('reflFixedBtn');
    if (freeBtn)  freeBtn.classList.toggle('active',  this.reflectionConfig.endType === 'free');
    if (fixedBtn) fixedBtn.classList.toggle('active', this.reflectionConfig.endType === 'fixed');
  },

  _saveReflectionConfig() {
    try {
      localStorage.setItem('waveapp_reflectionConfig', JSON.stringify({
        enabled:  this.reflectionConfig.enabled,
        boundary: this.reflectionConfig.boundary,
        endType:  this.reflectionConfig.endType,
      }));
    } catch (_) {}
  },

  /** 媒質の端の位置が変更されたとき */
  onReflBoundaryChange() {
    const v = parseFloat(document.getElementById('reflBoundary').value);
    if (!isNaN(v)) {
      this.reflectionConfig.boundary = v;
      this._setupEditorA();
      this._saveReflectionConfig();
      this._refreshActiveChoicesPanel();
    }
  },

  /** 反射タイプ（自由端 / 固定端）が変更されたとき */
  setReflEndType(endType) {
    this.reflectionConfig.endType = endType;
    document.getElementById('reflFreeBtn').classList.toggle('active',  endType === 'free');
    document.getElementById('reflFixedBtn').classList.toggle('active', endType === 'fixed');
    this._saveReflectionConfig();
    this._refreshActiveChoicesPanel();
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
    // 反射モード中は入射波の向きが変わるためエディタのグレー領域も更新
    if (waveName === 'A' && this.reflectionConfig.enabled) this._setupEditorA();
    this._refreshActiveChoicesPanel();
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
    this._refreshActiveChoicesPanel();
  },

  // ------------------------------------------------------------------
  // 速さ入力のバインド
  // ------------------------------------------------------------------
  _bindSpeedInputs() {
    document.getElementById('waveASpeed').addEventListener('change', e => {
      const v = parseFloat(e.target.value); this.waveA.speed = isNaN(v) ? 1 : v;
      this._refreshActiveChoicesPanel();
    });
    document.getElementById('waveBSpeed').addEventListener('change', e => {
      const v = parseFloat(e.target.value); this.waveB.speed = isNaN(v) ? 1 : v;
      this._refreshActiveChoicesPanel();
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
    if (tabName === 'problems') this._autoAdjustYRange();
  },

  /**
   * 合成波（または単独波）の最大変位を返す。
   * 複数の (t, x) をサンプリングして実測値を求める。
   * 波形なし（全頂点空）の場合は 0 を返す。
   */
  _computeMaxDisplacement() {
    if (this.waveA.vertices.length === 0) return 0;

    const { xMin, xMax } = this.gridConfig;

    // 反射波モード: 入射波最大振幅×2 を上限とする（構成的干渉の最悪ケース）
    if (this.reflectionConfig.enabled) {
      return Math.max(...this.waveA.vertices.map(v => Math.abs(v.y))) * 2;
    }

    const hasB = this.hasWaveB && this.waveB.vertices.length > 0;
    const tMax  = (xMax - xMin) * 2; // 両波が領域を一往復する時間
    const tStep = 0.25;
    const xStep = 0.25;
    let maxY = 0;

    for (let t = 0; t <= tMax; t += tStep) {
      for (let x = xMin; x <= xMax; x += xStep) {
        const yA = this.waveA.getYAtTime(x, t);
        const yB = hasB ? this.waveB.getYAtTime(x, t) : 0;
        const abs = Math.abs(yA + yB);
        if (abs > maxY) maxY = abs;
      }
    }

    return maxY;
  },

  /**
   * 設問作成タブへの遷移時に y 軸範囲を自動調整する。
   * 合成波の最大変位 + 1 を対称な上下限として設定する。
   */
  _autoAdjustYRange() {
    const maxY = this._computeMaxDisplacement();
    if (maxY === 0) return; // 波形なし

    const newBound = Math.ceil(maxY) + 1;
    const prev = { yMin: this.gridConfig.yMin, yMax: this.gridConfig.yMax };

    this.gridConfig.yMin = -newBound;
    this.gridConfig.yMax =  newBound;
    document.getElementById('yMin').value = -newBound;
    document.getElementById('yMax').value =  newBound;

    this._setupEditorA();
    if (this.hasWaveB) this._setupEditorB();
    this._refreshActiveChoicesPanel();

    if (prev.yMin !== -newBound || prev.yMax !== newBound) {
      this._showToast(`y 軸を自動調整しました：${-newBound} 〜 ${newBound}`);
    }
  },

  /** 画面右下に一時的なトースト通知を表示する */
  _showToast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    // アニメーション完了後に DOM から除去（3.2s 表示 + 0.4s フェードアウト）
    setTimeout(() => el.remove(), 3700);
  },

  // ------------------------------------------------------------------
  // 進行波プレビュー
  // ------------------------------------------------------------------
  renderPreview() {
    const tMax = parseInt(document.getElementById('previewTMax').value, 10) || 5;
    const container = document.getElementById('previewContainer');
    container.innerHTML = '';

    const PR = 2;

    // 反射波モード時は ProblemGenerator の描画ヘルパーを使う
    if (this.reflectionConfig.enabled) {
      const gen = new ProblemGenerator({
        gridConfig:  this.gridConfig,
        styleConfig: this.styleConfig,
        cellSize:    this.cellSize,
      });
      for (let t = 0; t <= tMax; t++) {
        const canvas = gen._renderReflectionCanvas(
          this.waveA, this.reflectionConfig.boundary, this.reflectionConfig.endType, t
        );
        const dlBtn = document.createElement('button');
        dlBtn.textContent = `t=${t}s PNG`;
        dlBtn.className   = 'dl-btn';
        dlBtn.onclick = () => Exporter.downloadCanvasPNG(canvas, `wave_t${t}.png`);
        const row = document.createElement('div');
        row.className = 'preview-row';
        row.appendChild(canvas);
        row.appendChild(dlBtn);
        container.appendChild(row);
      }
      return;
    }

    const waves  = this.hasWaveB ? [this.waveA, this.waveB] : [this.waveA];
    const sc = this.styleConfig;
    const styles = this.hasWaveB
      ? [sc.waveA, sc.waveB]
      : [sc.waveSingle];

    const size = WaveRenderer.computeCanvasSize(this.gridConfig, this.cellSize);

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
    ['type1', 'type2', 'type3', 'type4', 'type5', 'type6', 'type7'].forEach(t => {
      const el = document.getElementById(`params-${t}`);
      if (el) el.style.display = (t === type) ? 'flex' : 'none';
    });
    // 選択肢セクションは Type3/Type4/Type6 のみ表示
    ['type3', 'type4', 'type6'].forEach(t => {
      const sec = document.getElementById(`choices-${t}-section`);
      if (sec) sec.style.display = (t === type) ? 'block' : 'none';
      if (t === type) this._renderChoicesPanel(t);
    });
  },

  onProblemTypeChange() {
    this._updateProblemTypeParams();
  },

  /**
   * Type3/4 のパラメータ入力（x, tMax, answerT）に変更リスナーを付け、
   * 選択肢パネルが有効な時はパネルを再描画する（正答プレビューと
   * distractor エディタの gridConfig（tMax 反映）を更新するため）。
   */
  _bindChoicesParamRefresh() {
    const refresh = (type) => () => {
      if (this.choicesConfig[type].enabled) this._renderChoicesPanel(type);
    };
    const bind = (id, type) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', refresh(type));
    };
    bind('p3-x',       'type3');
    bind('p3-tMax',    'type3');
    bind('p4-answerT', 'type4');
    bind('t6-answer',  'type6');
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
    const hasChoices = ['type3', 'type4', 'type6'].includes(type) && !!this.choicesConfig[type]?.enabled;
    const generator = new ProblemGenerator({
      gridConfig:  this.gridConfig,
      styleConfig: this.styleConfig,
      cellSize:    this.cellSize,
      hasChoices,
    });

    let result;
    try {
      const _int   = (id, def) => { const v = parseInt(document.getElementById(id).value, 10); return isNaN(v) ? def : v; };
      const _float = (id, def) => { const v = parseFloat(document.getElementById(id).value);    return isNaN(v) ? def : v; };

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
      } else if (type === 'type6') {
        if (!this.reflectionConfig.enabled) { alert('反射波モードが有効ではありません。'); return; }
        const answerT = _int('t6-answer', 3);
        result = generator.generateType6({
          waveA:        this.waveA,
          boundary:     this.reflectionConfig.boundary,
          endType:      this.reflectionConfig.endType,
          answerT,
          choicesConfig: hasChoices ? this.choicesConfig.type6 : null,
        });
        // Type6 の選択肢はgenerateType6 内で構築済み。シード値をここで付与する
        if (result.choices) {
          result.choices.seed = SeededRandom.hashString(this._buildChoicesSeedSource('type6'));
        }
      } else if (type === 'type7') {
        if (!this.reflectionConfig.enabled) { alert('反射波モードが有効ではありません。'); return; }
        const tStart = _int('t7-start', 1);
        const tEnd   = _int('t7-end',   5);
        if (tEnd <= tStart) { alert('終了時刻は開始時刻より大きくしてください。'); return; }
        result = generator.generateType7({
          waveA:    this.waveA,
          boundary: this.reflectionConfig.boundary,
          endType:  this.reflectionConfig.endType,
          tStart,
          tEnd,
        });
      }
    } catch (e) {
      console.error(e);
      alert('設問の生成中にエラーが発生しました: ' + e.message);
      return;
    }

    // 選択肢モードが有効なら choices を構築（Type6 は generateType6 内で構築済み）
    if (['type3', 'type4'].includes(type) && this.choicesConfig[type].enabled) {
      try {
        result.choices = this._buildChoices(type, generator);
      } catch (e) {
        console.error(e);
        alert('選択肢の生成中にエラーが発生しました: ' + e.message);
        return;
      }
    }

    this.currentProblem = result;
    this._renderProblemOutput(result);
    document.getElementById('exportControls').style.display = 'flex';
  },

  /**
   * 選択肢オブジェクトを構築
   * 表示順は ① 正答 ② 不正解1 ③ 不正解2 ... の固定順
   * シード値は (問題波形 + パラメータ + 選択肢数) のハッシュ
   * @returns { items: [{canvas, isCorrect}], correctIndex: 0, seed: number, count: number }
   */
  _buildChoices(type, generator) {
    const cfg = this.choicesConfig[type];
    const items = [];

    // ① 正答
    const correctCanvas = this._renderCorrectChoiceCanvas(type);
    if (!correctCanvas) {
      throw new Error('正答 Canvas を生成できません。波形・パラメータを確認してください。');
    }
    items.push({ canvas: correctCanvas, isCorrect: true });

    // ② 〜 不正解
    cfg.distractors.forEach((distractorWave, i) => {
      let canvas;
      if (type === 'type3') {
        const tMax = parseInt(document.getElementById('p3-tMax').value, 10);
        canvas = generator.renderType3DistractorCanvas(distractorWave, tMax);
      } else {
        const t = parseInt(document.getElementById('p4-answerT').value, 10);
        canvas = generator.renderType4DistractorCanvas(distractorWave, t);
      }
      items.push({ canvas, isCorrect: false });
    });

    // シード値: 問題波形 + 設問パラメータ + 選択肢数
    const seedSource = this._buildChoicesSeedSource(type);
    const seed = SeededRandom.hashString(seedSource);

    return { items, correctIndex: 0, seed, count: cfg.count };
  },

  /** シード生成用の入力文字列（問題定義から決定論的に作る） */
  _buildChoicesSeedSource(type) {
    const cfg = this.choicesConfig[type];
    if (type === 'type3') {
      const x    = parseFloat(document.getElementById('p3-x').value);
      const tMax = parseInt(document.getElementById('p3-tMax').value, 10);
      return `t3|${JSON.stringify(this.waveA.toJSON())}|x=${x}|tMax=${tMax}|n=${cfg.count}`;
    }
    if (type === 'type6') {
      const t = parseInt(document.getElementById('t6-answer').value, 10);
      return `t6|A=${JSON.stringify(this.waveA.toJSON())}|b=${this.reflectionConfig.boundary}|e=${this.reflectionConfig.endType}|t=${t}|n=${cfg.count}`;
    }
    // type4
    const t = parseInt(document.getElementById('p4-answerT').value, 10);
    return `t4|A=${JSON.stringify(this.waveA.toJSON())}|B=${JSON.stringify(this.waveB.toJSON())}|t=${t}|n=${cfg.count}`;
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

    // 選択肢セクション（画面表示は ① 正答 固定順）
    if (result.choices) {
      const cSection = document.createElement('div');
      cSection.className = 'output-section';
      cSection.innerHTML =
        '<h3>【選択肢】</h3>' +
        '<p class="answer-note">画面では ① が正答固定。PDF/ZIP DL 時はシード乱数でシャッフルされます。</p>';
      const list = document.createElement('div');
      list.className = 'choices-display';
      result.choices.items.forEach((item, idx) => {
        const block = document.createElement('div');
        block.className = 'choice-display-item';
        const lbl = document.createElement('div');
        lbl.className = 'choice-display-label';
        const num = document.createElement('span');
        num.textContent = `選択肢 ${this._numToCircled(idx + 1)}`;
        lbl.appendChild(num);
        if (item.isCorrect) {
          const badge = document.createElement('span');
          badge.className = 'choice-display-correct';
          badge.textContent = '正答';
          lbl.appendChild(badge);
        }
        block.appendChild(lbl);
        block.appendChild(item.canvas);
        list.appendChild(block);
      });
      cSection.appendChild(list);
      container.appendChild(cSection);
    }

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

    // 解説セクション（Type3: y-x スナップショット列 / Type6: 各時刻の反射波合成）
    if (result.refCanvases && result.refCanvases.length > 0) {
      const refSection = document.createElement('div');
      refSection.className = 'output-section';
      const refTitle = result.refSectionTitle || '【解説】各時刻の波形と観測地点';
      const refNote  = result.refSectionNote  || '各コマの ● の高さを読み取り、y−t グラフの対応する t の列にプロットしてください。';
      refSection.innerHTML =
        `<h3>${refTitle}</h3>` +
        `<p class="answer-note">${refNote}</p>`;

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
  /**
   * 選択肢を PDF 用にシャッフル + ラベル付け
   * @param {boolean} showCorrect 正答に「★ 正答」マークを付けるか
   * @returns シャッフル後の [{canvas, label, isCorrect, showCorrect}]
   */
  _buildPdfChoices(choices, showCorrect) {
    const { shuffled } = Exporter.shuffleChoicesWithSeed(choices.items, choices.seed);
    return shuffled.map((item, i) => ({
      canvas:      item.canvas,
      label:       this._numToCircled(i + 1),
      isCorrect:   item.isCorrect,
      showCorrect: showCorrect,
    }));
  },

  async exportProblemPDF() {
    if (!this.currentProblem) return;
    const r = this.currentProblem;
    const sections = [
      { label: '問題', text: r.questionText, canvases: r.questionCanvases },
    ];
    if (r.choices) {
      sections.push({ label: '選択肢', choices: this._buildPdfChoices(r.choices, false) });
    }
    await Exporter.generatePDF('波の重ね合わせ 問題', sections, 'wave_question.pdf');
  },

  async exportAnswerPDF() {
    if (!this.currentProblem) return;
    const r = this.currentProblem;
    const sections = [
      { label: '問題', text: r.questionText, canvases: r.questionCanvases },
    ];
    if (r.choices) {
      // 解答PDFでは正答にマークを付ける
      sections.push({ label: '選択肢（正答マーク付き）', choices: this._buildPdfChoices(r.choices, true) });
      // 解答テキスト（シャッフル後の正答番号）
      const { correctNewIndex } = Exporter.shuffleChoicesWithSeed(r.choices.items, r.choices.seed);
      sections.push({ label: '解答', text: `正答: 選択肢 ${this._numToCircled(correctNewIndex + 1)}` });
    } else {
      sections.push({ label: '解答', text: r.answerText, canvases: r.answerCanvases });
    }
    await Exporter.generatePDF('波の重ね合わせ 解答', sections, 'wave_answer.pdf');
  },

  async exportZIP() {
    if (!this.currentProblem) return;
    const r = this.currentProblem;
    const images = {};
    r.questionCanvases.forEach((c, i) => { images[`question_${i + 1}.png`] = c; });
    r.answerCanvases.forEach((c, i)   => { images[`answer_${i + 1}.png`]   = c; });
    if (r.choices) {
      const { shuffled, correctNewIndex } = Exporter.shuffleChoicesWithSeed(r.choices.items, r.choices.seed);
      shuffled.forEach((item, i) => {
        const num = i + 1;
        const tag = (i === correctNewIndex) ? '_correct' : '';
        images[`choice_${num}${tag}.png`] = item.canvas;
      });
    }
    await Exporter.generateZIP(images, 'wave_images.zip');
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
