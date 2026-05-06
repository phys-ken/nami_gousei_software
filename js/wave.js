/**
 * Wave - パルス波の物理モデル
 * 頂点リスト（格子点）を保持し、時刻tでの波形を線形補間で計算する
 */
class Wave {
  constructor() {
    this.vertices = []; // [{x: int, y: int}, ...] x 昇順ソート済み
    this.speed = 1;     // マス/s
    this.direction = 1; // +1=右, -1=左
    this.label = 'A';
  }

  /**
   * 頂点を追加または更新する
   * 同じ x の頂点が存在する場合は y を更新
   */
  setVertex(x, y) {
    x = Math.round(x);
    y = Math.round(y * 2) / 2; // 0.5刻みに丸める
    const idx = this.vertices.findIndex(v => v.x === x);
    if (idx !== -1) {
      this.vertices[idx].y = y;
    } else {
      this.vertices.push({ x, y });
      this.vertices.sort((a, b) => a.x - b.x);
    }
  }

  /**
   * 頂点を削除する
   */
  removeVertex(x) {
    x = Math.round(x);
    const idx = this.vertices.findIndex(v => v.x === x);
    if (idx !== -1) this.vertices.splice(idx, 1);
  }

  /**
   * 指定 x の頂点 y 値を返す（なければ null）
   */
  getVertex(x) {
    const v = this.vertices.find(v => v.x === Math.round(x));
    return v ? v.y : null;
  }

  /**
   * 位置 x での波形 y 値（線形補間、範囲外は 0）
   */
  getY(x) {
    if (this.vertices.length === 0) return 0;

    const first = this.vertices[0];
    const last  = this.vertices[this.vertices.length - 1];

    // 端部ランプ: getSnapshot の視覚表示（隣接格子点 y=0 との折れ線）と整合させる。
    // 左端 [first.x-1, first.x): 0 → first.y の線形補間
    // 右端 (last.x,  last.x+1]: last.y → 0 の線形補間
    if (x < first.x - 1 || x > last.x + 1) return 0;
    if (x < first.x) return (x - (first.x - 1)) * first.y;
    if (x > last.x)  return (last.x + 1 - x)    * last.y;

    if (x === first.x) return first.y;
    if (x === last.x)  return last.y;

    for (let i = 0; i < this.vertices.length - 1; i++) {
      const a = this.vertices[i];
      const b = this.vertices[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / (b.x - a.x);
        return a.y + t * (b.y - a.y);
      }
    }
    return 0;
  }

  /**
   * 時刻 t における位置 x の変位
   * 波は direction * speed * t だけシフトしている
   */
  getYAtTime(x, t) {
    const shift = this.direction * this.speed * t;
    return this.getY(x - shift);
  }

  /**
   * 時刻 t における [xMin, xMax] の描画用点列を返す
   * 頂点位置を含めて折れ線を正確に描画できるようにする
   */
  getSnapshot(xMin, xMax, t) {
    const shift = this.direction * this.speed * t;

    const xSet = new Set();
    // 整数格子点を全て含める
    for (let x = Math.floor(xMin); x <= Math.ceil(xMax); x++) {
      xSet.add(x);
    }
    // シフト後の頂点位置（波形の折れ点）を含める
    this.vertices.forEach(v => {
      const sx = v.x + shift;
      xSet.add(sx);
    });

    return [...xSet]
      .sort((a, b) => a - b)
      .filter(x => x >= xMin && x <= xMax)
      .map(x => ({ x, y: this.getYAtTime(x, t) }));
  }

  /**
   * 波形をクリアする
   */
  clear() {
    this.vertices = [];
  }

  /**
   * JSON シリアライズ（kind: 'vertex' を付与）
   */
  toJSON() {
    return {
      kind: 'vertex',
      vertices: this.vertices.map(v => ({ x: v.x, y: v.y })),
      speed: this.speed,
      direction: this.direction,
      label: this.label,
    };
  }

  /**
   * JSON デシリアライズ（kind フィールドがなくても動く）
   */
  fromJSON(data) {
    this.vertices = (data.vertices || []).map(v => ({ x: v.x, y: v.y }));
    this.speed = data.speed ?? 1;
    this.direction = data.direction ?? 1;
    this.label = data.label ?? 'A';
    return this;
  }

  // ── 抽象 Wave API ─────────────────────────────────────────────────────

  /**
   * 波として中身がないか（頂点が一つもない）
   * @returns {boolean}
   */
  isEmpty() {
    return this.vertices.length === 0;
  }

  /**
   * getSnapshot() に補強すべきキー x 座標（シフト後の頂点位置）を返す
   * @param {number} t
   * @returns {number[]}
   */
  getKeyXs(t) {
    const shift = this.direction * this.speed * t;
    return this.vertices.map(v => v.x + shift);
  }

  /**
   * 最大変位の絶対値
   * @returns {number}
   */
  getMaxAmplitude() {
    if (this.vertices.length === 0) return 0;
    return Math.max(...this.vertices.map(v => Math.abs(v.y)));
  }

  /**
   * 境界 boundary で反射した鏡像 Wave を返す
   * @param {number} boundary
   * @param {'fixed'|'free'} endType
   * @returns {Wave}
   */
  reflect(boundary, endType) {
    const reflected = new Wave();
    reflected.speed = this.speed;
    reflected.direction = -this.direction;
    reflected.label = this.label;
    const ySign = (endType === 'fixed') ? -1 : 1;
    this.vertices.forEach(v => {
      reflected.vertices.push({ x: 2 * boundary - v.x, y: ySign * v.y });
    });
    reflected.vertices.sort((a, b) => a.x - b.x);
    return reflected;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SineWave — 正弦波の物理モデル（連続波 / 先頭あり進行波）
// Wave クラスと互換の公開 API を持ち、vertices プロパティは持たない
// ─────────────────────────────────────────────────────────────────────────────
class SineWave {
  /**
   * @param {Object} opts
   * @param {Object} opts.sineConfig
   * @param {number} opts.speed
   * @param {number} opts.direction  +1=右, -1=左
   * @param {string} opts.label
   */
  constructor({ sineConfig = {}, speed = 1, direction = 1, label = 'A' } = {}) {
    this.sineConfig = {
      amplitude:   sineConfig.amplitude   ?? 1,
      wavelength:  sineConfig.wavelength  ?? 4,
      phaseShift:  sineConfig.phaseShift  ?? 0,
      waveType:    sineConfig.waveType    ?? 'continuous',
      invertPhase: sineConfig.invertPhase ?? false,
      x0:          sineConfig.x0          ?? 0,
    };
    this.speed     = speed;
    this.direction = direction;
    this.label     = label;
  }

  /**
   * 時刻 t における位置 x の変位
   *
   * 連続波:
   *   y = A * flipSign * sin(2π * (x - direction*speed*t - phaseShift) / λ)
   *
   * 先頭あり進行波（direction=+1）:
   *   x_front = x0 + speed*t
   *   y = (x ≤ x_front) ? A*flipSign*sin(2π*(x_front-x)/λ) : 0
   *
   * 先頭あり進行波（direction=-1）:
   *   x_front = x0 - speed*t
   *   y = (x ≥ x_front) ? A*flipSign*sin(2π*(x-x_front)/λ) : 0
   *
   * @param {number} x
   * @param {number} t
   * @returns {number}
   */
  getYAtTime(x, t) {
    const { amplitude, wavelength, phaseShift, waveType, invertPhase, x0 } = this.sineConfig;
    const flipSign = invertPhase ? -1 : 1;
    const k = 2 * Math.PI / wavelength;

    if (waveType === 'continuous') {
      return amplitude * flipSign * Math.sin(k * (x - this.direction * this.speed * t - phaseShift));
    } else {
      // progressive
      const xFront = this.direction === 1
        ? x0 + this.speed * t
        : x0 - this.speed * t;

      if (this.direction === 1) {
        if (x > xFront) return 0;
        return amplitude * flipSign * Math.sin(k * (xFront - x));
      } else {
        if (x < xFront) return 0;
        return amplitude * flipSign * Math.sin(k * (x - xFront));
      }
    }
  }

  /**
   * 時刻 t における [xMin, xMax] の描画用点列を返す（高密度サンプリング）
   * step = 0.05 で 1 グリッドあたり 20 点
   * @param {number} xMin
   * @param {number} xMax
   * @param {number} t
   * @returns {{x:number, y:number}[]}
   */
  getSnapshot(xMin, xMax, t) {
    const { waveType, x0 } = this.sineConfig;
    const STEP = 0.05;

    let lo = xMin;
    let hi = xMax;

    if (waveType === 'progressive') {
      const xFront = this.direction === 1
        ? x0 + this.speed * t
        : x0 - this.speed * t;

      if (this.direction === 1) {
        hi = Math.min(xMax, xFront);
      } else {
        lo = Math.max(xMin, xFront);
      }

      if (hi < lo) return [];
    }

    const points = [];
    const count = Math.ceil((hi - lo) / STEP);
    for (let i = 0; i <= count; i++) {
      const x = lo + i * STEP;
      if (x > hi + 1e-9) break;
      points.push({ x, y: this.getYAtTime(x, t) });
    }

    // 末端点を明示追加（先頭あり進行波の先端が y=0 で閉じるため）
    const lastX = points.length > 0 ? points[points.length - 1].x : null;
    if (lastX === null || Math.abs(lastX - hi) > 1e-9) {
      points.push({ x: hi, y: this.getYAtTime(hi, t) });
    }

    return points;
  }

  /** @returns {boolean} 常に false（SineWave は常に値を持つ） */
  isEmpty() {
    return false;
  }

  /**
   * getSnapshot() に補強すべきキー x 座標（SineWave は高密度サンプリングで十分）
   * @returns {number[]}
   */
  getKeyXs(_t) {
    return [];
  }

  /** @returns {number} 振幅 */
  getMaxAmplitude() {
    return this.sineConfig.amplitude;
  }

  /**
   * 境界 boundary で反射した鏡像 SineWave を返す
   *
   * 連続波（image source 法）:
   *   y_r = ±A * sin(2π*(x + speed*t - (2B - phaseShift))/λ)
   *   固定端: flipSign 不変（y_i + y_r = 0 at boundary）
   *   自由端: flipSign 反転（∂y/∂x = 0 at boundary）
   *
   * 先頭あり進行波:
   *   x0_r = 2B - x0
   *   固定端: flipSign 反転
   *   自由端: flipSign 不変
   *
   * @param {number}           boundary
   * @param {'fixed'|'free'}   endType
   * @returns {SineWave}
   */
  reflect(boundary, endType) {
    const { waveType, invertPhase } = this.sineConfig;

    if (waveType === 'continuous') {
      // 固定端: invertPhase 不変（y_r = +A*flipSign*sin(...)）
      // 自由端: invertPhase 反転（y_r = -A*flipSign*sin(...)）
      return new SineWave({
        sineConfig: {
          ...this.sineConfig,
          phaseShift: 2 * boundary - this.sineConfig.phaseShift,
          invertPhase: (endType === 'fixed') ? invertPhase : !invertPhase,
        },
        speed:     this.speed,
        direction: -this.direction,
        label:     this.label,
      });
    } else {
      // 先頭あり進行波
      // 固定端: invertPhase 反転
      // 自由端: invertPhase 不変
      return new SineWave({
        sineConfig: {
          ...this.sineConfig,
          x0: 2 * boundary - this.sineConfig.x0,
          invertPhase: (endType === 'fixed') ? !invertPhase : invertPhase,
        },
        speed:     this.speed,
        direction: -this.direction,
        label:     this.label,
      });
    }
  }

  /** no-op: SineWave は削除すべき内部状態を持たない */
  clear() {}

  /**
   * JSON シリアライズ
   */
  toJSON() {
    return {
      kind:       'sine',
      sineConfig: { ...this.sineConfig },
      speed:      this.speed,
      direction:  this.direction,
      label:      this.label,
    };
  }

  /**
   * JSON デシリアライズ
   */
  fromJSON(data) {
    this.sineConfig = {
      amplitude:   data.sineConfig?.amplitude   ?? 1,
      wavelength:  data.sineConfig?.wavelength  ?? 4,
      phaseShift:  data.sineConfig?.phaseShift  ?? 0,
      waveType:    data.sineConfig?.waveType    ?? 'continuous',
      invertPhase: data.sineConfig?.invertPhase ?? false,
      x0:          data.sineConfig?.x0          ?? 0,
    };
    this.speed     = data.speed     ?? 1;
    this.direction = data.direction ?? 1;
    this.label     = data.label     ?? 'A';
    return this;
  }
}
