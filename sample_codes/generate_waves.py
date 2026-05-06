#!/usr/bin/env python3
"""定在波プリント SVG v7
  λ=8, T=8, v=1 [grid/s]

  A (右向き): y_A = AMP * sin(2π*(t-1-x)/λ)  for x ≤ t-1
              先端 x=t-1 → sin(0)=0  ✓
              x=0 が腹の定在波になる

  B (左向き): y_B = AMP * sin(2π*(x+t-1)/λ)  for x ≥ 1-t
              先端 x=1-t → sin(0)=0  ✓

  A+B = 2*AMP * cos(πx/4) * sin(π(t-1)/4)   ← x=0 が腹 ✓

  色: A・B は黒（A=実線, B=破線）, 合成波のみ赤+白縁取り
  グリッド: G/2 ピッチで横線
  行間: 白余白で明確分離
"""
import math, os

# ────────────────────────────────────────────────────────────
# レイアウト定数
# ────────────────────────────────────────────────────────────
G    = 36        # 1グリッド [px]
AMP  = 16        # 成分波の振幅 [px]  (合成最大 2×16=32 < G=36)
RH   = 2 * G     # 行の高さ = 72px (2グリッド分)
GAP  = 14        # 行間の白余白 [px]
LM   = 88        # 左マージン [px]
TM   = 62        # 上マージン [px]
NPTS = 1200      # 波形折れ線の点数

LAM  = 8.0       # 波長 [グリッド]
TP   = 8.0       # 周期 [秒]

X_MIN = -8
X_MAX =  8
XG    = X_MAX - X_MIN   # = 16

OVERLAP_SHIFT = 1.1  # px: t=7,11秒後にA・Bが完全一致する瞬間を視覚的に示すための微小ずらし量

WW = XG * G
SW = LM + WW + 52
SH = TM + 13 * (RH + GAP) + GAP + 16

# ────────────────────────────────────────────────────────────
# 座標ユーティリティ
# ────────────────────────────────────────────────────────────
def row_top(t):
    return TM + t * (RH + GAP)

def bl(t):
    return row_top(t) + RH // 2

def xpx(xg):
    return LM + (xg - X_MIN) * G

# ────────────────────────────────────────────────────────────
# 波形計算
# ────────────────────────────────────────────────────────────
def wave_y(xg, t, wtype, inv=False):
    """各点の振幅 [px, 上方向が正]  inv=True のとき B波を上下反転（逆位相）"""
    # A: 右向き, 先端 x=t-1, y=0 at tip, x=0が腹
    yA =  AMP * math.sin(2.0 * math.pi * (t - 1.0 - xg) / LAM)
    # B: 左向き, 先端 x=1-t, y=0 at tip
    yB =  AMP * math.sin(2.0 * math.pi * (xg + t - 1.0) / LAM)
    if inv:
        yB = -yB   # 逆位相: B波を上下反転
    if   wtype == 'A': return yA
    elif wtype == 'B': return yB
    else:              return yA + yB   # 合成

def make_path(t, wtype, x_lo, x_hi, v_offset=0.0, inv=False):
    """v_offset [px]: 正=上向き(SVG y減少)にシフト"""
    x_lo = max(float(x_lo), float(X_MIN))
    x_hi = min(float(x_hi), float(X_MAX))
    if x_hi - x_lo < 1e-6:
        return ""
    base = bl(t)
    pts = []
    for i in range(NPTS + 1):
        xg  = x_lo + (x_hi - x_lo) * i / NPTS
        yv  = wave_y(xg, t, wtype, inv=inv)
        pts.append(f"{xpx(xg):.1f},{base - yv - v_offset:.1f}")
    return "M " + " L ".join(pts)

# ────────────────────────────────────────────────────────────
# 1行の描画
# ────────────────────────────────────────────────────────────
def draw_row(t, pattern):
    base = bl(t)
    rt   = row_top(t)
    rb   = rt + RH
    out  = []

    # 白背景
    out.append(f'<rect x="{LM}" y="{rt}" width="{WW}" height="{RH}" fill="white"/>')

    # ── 縦グリッド線 ──
    for i in range(XG + 1):
        xg = X_MIN + i
        x  = xpx(xg)
        if xg == 0:
            # x=0 (腹): 中程度の太さの黒実線
            out.append(
                f'<line x1="{x}" y1="{rt}" x2="{x}" y2="{rb}" '
                f'stroke="black" stroke-width="1.8"/>'
            )
        elif xg % int(LAM) == 0:
            # ±λ: 太い黒実線
            out.append(
                f'<line x1="{x}" y1="{rt}" x2="{x}" y2="{rb}" '
                f'stroke="black" stroke-width="1.4"/>'
            )
        else:
            # 通常: 細い黒実線
            out.append(
                f'<line x1="{x}" y1="{rt}" x2="{x}" y2="{rb}" '
                f'stroke="black" stroke-width="0.5"/>'
            )

    # ── 横グリッド線 (G/2 ピッチ = 4本: top, 1/4, 1/2=baseline, 3/4, bottom) ──
    for step in range(5):          # 0, 1, 2, 3, 4 → y = rt + step*(G/2)
        y = rt + step * (G // 2)
        if step == 0 or step == 4:
            # 枠線: 太め
            out.append(
                f'<line x1="{LM}" y1="{y}" x2="{LM+WW}" y2="{y}" '
                f'stroke="black" stroke-width="1.4"/>'
            )
        else:
            # 内側グリッド線
            out.append(
                f'<line x1="{LM}" y1="{y}" x2="{LM+WW}" y2="{y}" '
                f'stroke="black" stroke-width="0.5"/>'
            )

    # ── 左右の枠線 ──
    out.append(f'<line x1="{LM}" y1="{rt}" x2="{LM}" y2="{rb}" stroke="black" stroke-width="1.4"/>')
    out.append(f'<line x1="{LM+WW}" y1="{rt}" x2="{LM+WW}" y2="{rb}" stroke="black" stroke-width="1.4"/>')

    # ── ベースライン (太め) + 矢印 ──
    out.append(
        f'<line x1="{LM}" y1="{base}" x2="{LM+WW+6}" y2="{base}" '
        f'stroke="black" stroke-width="1.8"/>'
    )
    ax = LM + WW + 6
    out.append(f'<polygon points="{ax+10},{base} {ax},{base-4} {ax},{base+4}" fill="black"/>')

    # ── 時刻ラベル "N秒後" ──
    out.append(
        f'<text x="{LM-10}" y="{base+6}" text-anchor="end" '
        f'font-family="sans-serif" font-size="15" font-weight="bold">{t}秒後</text>'
    )
    if t == 0:
        out.append(
            f'<text x="{LM+WW+24}" y="{base+6}" '
            f'font-family="serif" font-size="14" font-style="italic">x</text>'
        )

    # ── 波の描画 ──
    # pattern 4-6 は 1-3 の逆位相版
    inv      = pattern in (4, 5, 6)
    base_pat = ((pattern - 1) % 3) + 1   # 1→1, 2→2, 3→3, 4→1, 5→2, 6→3

    if base_pat == 3 and t > 2:
        return '\n'.join(out)

    # 波フロント座標
    x_fA = float(t - 1)      # A の先端 (右端)
    x_fB = float(-(t - 1))   # B の先端 (左端)

    # ── 合成波 (パターンkanzen, 重なり領域 t≥2) を先に描いて A・B で上書き ──
    if base_pat == 1 and x_fA > x_fB:
        s_lo = max(x_fB, float(X_MIN))
        s_hi = min(x_fA, float(X_MAX))
        if s_hi > s_lo:
            pd = make_path(t, 'S', s_lo, s_hi, inv=inv)
            if pd:
                # 白縁取り
                out.append(
                    f'<path d="{pd}" fill="none" stroke="white" '
                    f'stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
                )
                # 赤太線
                out.append(
                    f'<path d="{pd}" fill="none" stroke="#cc0000" '
                    f'stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>'
                )

    # ── A波 (黒実線) ──
    # 正位相: t=7,11 / 逆位相: t=1,5,9 に A・B が完全一致 → 微小シフトで視覚的分離
    # (正位相 t=3, 逆位相 t=13 は範囲外 or 重複領域が小さいためスキップ)
    a_voff =  OVERLAP_SHIFT if (not inv and t in (7, 11)) or (inv and t in (1, 5, 9)) else 0.0
    b_voff = -OVERLAP_SHIFT if (not inv and t in (7, 11)) or (inv and t in (1, 5, 9)) else 0.0

    a_hi = min(x_fA, float(X_MAX))
    if a_hi > float(X_MIN):
        pd = make_path(t, 'A', X_MIN, a_hi, v_offset=a_voff, inv=inv)
        if pd:
            out.append(f'<path d="{pd}" fill="none" stroke="black" stroke-width="1.8"/>')

    # ── B波 (黒破線) ──
    b_lo = max(x_fB, float(X_MIN))
    if b_lo < float(X_MAX):
        pd = make_path(t, 'B', b_lo, X_MAX, v_offset=b_voff, inv=inv)
        if pd:
            out.append(
                f'<path d="{pd}" fill="none" stroke="black" '
                f'stroke-width="1.8" stroke-dasharray="9,5"/>'
            )



    return '\n'.join(out)

# ────────────────────────────────────────────────────────────
# 凡例
# ────────────────────────────────────────────────────────────
def make_legend(pattern):
    y   = TM - 30
    out = []

    # pattern 4-6 は 1-3 の逆位相版
    inv      = pattern in (4, 5, 6)
    base_pat = ((pattern - 1) % 3) + 1
    phase_label = '（逆位相）' if inv else ''

    if base_pat in (1, 2):
        out.append(
            f'<text x="{LM}" y="{y}" font-family="sans-serif" font-size="13">凡例{phase_label}：</text>'
        )
        lx = LM + 46 + (len(phase_label) * 13 if inv else 0)
        # A (黒実線)
        out.append(
            f'<line x1="{lx}" y1="{y-5}" x2="{lx+32}" y2="{y-5}" '
            f'stroke="black" stroke-width="1.8"/>'
        )
        out.append(
            f'<text x="{lx+36}" y="{y}" font-family="sans-serif" font-size="13">'
            f'A（右向きに進む波）</text>'
        )
        lx2 = lx + 210
        # B (黒破線)
        out.append(
            f'<line x1="{lx2}" y1="{y-5}" x2="{lx2+32}" y2="{y-5}" '
            f'stroke="black" stroke-width="1.8" stroke-dasharray="9,5"/>'
        )
        out.append(
            f'<text x="{lx2+36}" y="{y}" font-family="sans-serif" font-size="13">'
            f'B（左向きに進む波{"，上下反転" if inv else ""}）</text>'
        )
        if base_pat == 1:
            lx3 = lx2 + 210 + (50 if inv else 0)
            out.append(
                f'<line x1="{lx3}" y1="{y-5}" x2="{lx3+32}" y2="{y-5}" '
                f'stroke="white" stroke-width="8" stroke-linecap="round"/>'
            )
            out.append(
                f'<line x1="{lx3}" y1="{y-5}" x2="{lx3+32}" y2="{y-5}" '
                f'stroke="#cc0000" stroke-width="3.8" stroke-linecap="round"/>'
            )
            out.append(
                f'<text x="{lx3+36}" y="{y}" font-family="sans-serif" font-size="13">'
                f'合成波</text>'
            )
    else:
        out.append(
            f'<text x="{LM}" y="{y-9}" font-family="sans-serif" font-size="13">'
            f'凡例{phase_label}：── A（右向きに進む波）　　- - - B（左向きに進む波{"，上下反転" if inv else ""}）</text>'
        )
        out.append(
            f'<text x="{LM}" y="{y+8}" font-family="sans-serif" font-size="13">'
            f'[問] 0〜2秒後を参考に、各時刻における A・B の波形を作図しなさい。</text>'
        )
    return '\n'.join(out)

# ────────────────────────────────────────────────────────────
# SVG 組み立て
# ────────────────────────────────────────────────────────────
def build_svg(pattern):
    parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{SW}" height="{SH}" '
        f'font-family="\'Yu Gothic\',\'Meiryo\',sans-serif">',
        f'<rect width="{SW}" height="{SH}" fill="white"/>',
        make_legend(pattern),
    ]
    for t in range(13):
        parts.append(draw_row(t, pattern))
    parts.append('</svg>')
    return '\n'.join(parts)

# ────────────────────────────────────────────────────────────
# 出力
# ────────────────────────────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))
for pat, name in [
    (1, 'teizaiha_1_kanzen'),
    (2, 'teizaiha_2_seibun'),
    (3, 'teizaiha_3_print'),
    (4, 'teizaiha_inv_1_kanzen'),
    (5, 'teizaiha_inv_2_seibun'),
    (6, 'teizaiha_inv_3_print'),
]:
    fp = os.path.join(BASE, f'{name}.svg')
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(build_svg(pat))
    print(f'OK: {name}.svg')

print('Done!')
