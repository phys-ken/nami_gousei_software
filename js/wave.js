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
    const last = this.vertices[this.vertices.length - 1];

    if (x < first.x || x > last.x) return 0;
    if (x === first.x) return first.y;
    if (x === last.x) return last.y;

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
   * JSON シリアライズ
   */
  toJSON() {
    return {
      vertices: this.vertices.map(v => ({ x: v.x, y: v.y })),
      speed: this.speed,
      direction: this.direction,
      label: this.label,
    };
  }

  /**
   * JSON デシリアライズ
   */
  fromJSON(data) {
    this.vertices = (data.vertices || []).map(v => ({ x: v.x, y: v.y }));
    this.speed = data.speed ?? 1;
    this.direction = data.direction ?? 1;
    this.label = data.label ?? 'A';
    return this;
  }
}
