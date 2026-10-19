"""Build the dimensioned top-view drawings from the Blender ortho renders.

    python drawings/draw_topview.py            # both variants
    python drawings/draw_topview.py 3zone      # just one

Reads   drawings/topview_<variant>.png    (from blender/scripts/render_topview.py)
Writes  drawings/bench_topview_<variant>.png

The render covers exactly the display floor — X -700..700, Y -194.6..405.4 mm
at 2 px/mm — so it is placed in millimetre data coordinates and every
dimension below is a real measurement, not a drawn approximation.
"""

import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import Rectangle

matplotlib.rcParams["font.family"] = ["Malgun Gothic", "AppleGothic",
                                      "NanumGothic", "DejaVu Sans"]
matplotlib.rcParams["axes.unicode_minus"] = False

HERE = os.path.dirname(os.path.abspath(__file__))

# display floor, millimetres
X0, X1 = -700.0, 700.0
Y0, Y1 = -194.6, 405.4

INK = "#1a1a1a"
DIM = "#0b4f8a"
NOTE = "#8a3b0b"

# --------------------------------------------------------------------------
# per-variant drawing content. All numbers are millimetres, measured from
# the Blender scene (see blender/scripts/layouts.py).
# --------------------------------------------------------------------------
COMMON_DETAIL3 = [(-201.6, 193.4, "395  OMX PLATE")]
COMMON_DETAIL4 = [(-500.0, 500.0, "1000  LINEAR RAIL")]
COMMON_YDIMS = [
    (Y0, Y1, -800.0, "600 mm", "left", 18),
    (-84.5, -41.5, -930.0, "43", "left", 11),
    (Y0, 295.0, 800.0, "489.6", "right", 12),
    (295.0, 365.0, 800.0, "70", "right", 12),
    (365.0, Y1, 800.0, "40.4", "right", 12),
    (305.0, 355.0, 930.0, "50", "right", 11),
    (-123.1, 16.9, 930.0, "140", "right", 11),
]
COMMON_CALLOUTS = [
    (-250.0, -63.0, -430, -150, "리니어 레일 1 m + 캐리지"),
    (108.5, 75.0, 450, -60, "OMX 모듈 ×2\n마운팅 플레이트 395 × 140"),
]

VARIANTS = {
    # ----------------------------------------------------------------------
    "4zone": dict(
        title="LAB BENCH LAYOUT — TOP VIEW  (4 ZONE)",
        zones=[((-652.0, -495.0), "① 폐기통"),
               ((-399.0, -239.0), "② 비커 ×2"),
               ((-143.0, 202.0), "③ 실린더 홀더 ×2"),
               ((298.0, 652.0), "④ 시약 ×5")],
        chain=[(X0, -652.0, "48"), (-652.0, -495.0, "157"),
               (-495.0, -399.0, "96"), (-399.0, -239.0, "160"),
               (-239.0, -143.0, "96"), (-143.0, 202.0, "345"),
               (202.0, 298.0, "96"), (298.0, 652.0, "354"),
               (652.0, X1, "48")],
        detail1=[(-364.0, -274.0, "90"), (-143.0, 22.0, "165"),
                 (37.0, 202.0, "165"), (335.5, 405.5, "70"),
                 (405.5, 475.5, "70"), (475.5, 545.5, "70"),
                 (545.5, 615.5, "70")],
        detail2=[(-652.0, -495.0, "⌀157"), (-60.5, 119.5, "180")],
        detail3=[(22.0, 37.0, "15")] + COMMON_DETAIL3,
        detail4=COMMON_DETAIL4,
        ydims=COMMON_YDIMS + [(241.5, 398.5, -1050.0, "157", "left", 11),
                              (295.0, 330.0, 1050.0, "35", "right", 11)],
        bottles=[(335.5, 295, "H2O2"), (405.5, 365, "ETHANOL"),
                 (475.5, 295, "SOLVENT"), (545.5, 365, "ACID"),
                 (615.5, 295, "NaOH")],
        bucket=(-573.5, 320),
        callouts=[
            (-573.5, 320, -560, 130, "① 폐기통  ⌀157 × H204\n상단 개구 ⌀136  |  Y = 320"),
            (-319.0, 330, -230, 60, "② 비커  ⌀70 × H95\nY = 330  |  피치 90"),
            (-60.5, 330, 30, 130, "③ 실린더 홀더  165 × 50 × H80\n슬롯 6개  |  피치 180, 틈 15"),
            (405.5, 365, 470, 130, "④ 시약 5개  지그재그\n앞 3 (Y=295) / 뒤 2 (Y=365)\n열 피치 70"),
        ] + COMMON_CALLOUTS,
    ),
    # ----------------------------------------------------------------------
    "3zone": dict(
        title="LAB BENCH LAYOUT — TOP VIEW  (3 ZONE)",
        zones=[((-512.5, -352.5), "① 비커 ×2"),
               ((-172.5, 172.5), "② 실린더 홀더 ×2"),
               ((292.5, 646.5), "③ 시약 ×5")],
        chain=[(X0, -512.5, "187.5"), (-512.5, -352.5, "160"),
               (-352.5, -172.5, "180"), (-172.5, 172.5, "345"),
               (172.5, 292.5, "120"), (292.5, 646.5, "354"),
               (646.5, X1, "53.5")],
        detail1=[(-477.5, -387.5, "90"), (-172.5, -7.5, "165"),
                 (7.5, 172.5, "165"), (330.0, 400.0, "70"),
                 (400.0, 470.0, "70"), (470.0, 540.0, "70"),
                 (540.0, 610.0, "70")],
        detail2=[(-90.0, 90.0, "180"), (292.5, 646.5, "354")],
        detail3=[(-7.5, 7.5, "15")] + COMMON_DETAIL3,
        detail4=COMMON_DETAIL4,
        ydims=COMMON_YDIMS + [(295.0, 330.0, 1050.0, "35", "right", 11)],
        bottles=[(330.0, 295, "H2O2"), (400.0, 365, "ETHANOL"),
                 (470.0, 295, "SOLVENT"), (540.0, 365, "ACID"),
                 (610.0, 295, "NaOH")],
        bucket=None,
        callouts=[
            (-477.5, 330, -540, 170, "① 비커  ⌀70 × H95\nY = 330  |  피치 90"),
            (-90.0, 330, -110, 60, "② 실린더 홀더  165 × 50 × H80\n슬롯 6개  |  피치 180, 틈 15"),
            (400.0, 365, 330, 130, "③ 시약 5개  지그재그\n앞 3 (Y=295) / 뒤 2 (Y=365)\n열 피치 70"),
        ] + COMMON_CALLOUTS,
    ),
}

TICK = 8.0


def draw(variant, spec):
    render = os.path.join(HERE, "topview_%s.png" % variant)
    out = os.path.join(HERE, "bench_topview_%s.png" % variant)
    if not os.path.exists(render):
        raise SystemExit("missing %s - run blender/scripts/render_topview.py "
                         "with SIMENV_VARIANT=%s first" % (render, variant))

    fig, ax = plt.subplots(figsize=(23, 15))
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_xlim(-1130, 1130)
    ax.set_ylim(-620, 700)

    # ---- underlay: composite the transparent render over white -----------
    rgba = mpimg.imread(render).astype(float)
    if rgba.shape[2] == 4:
        a = rgba[:, :, 3:4]
        img = rgba[:, :, :3] * a + (1.0 - a)
    else:
        img = rgba[:, :, :3]
    img = img * 0.80 + 0.20                    # screen back slightly
    ax.imshow(img, extent=(X0, X1, Y0, Y1), zorder=1, interpolation="bilinear")
    ax.add_patch(Rectangle((X0, Y0), X1 - X0, Y1 - Y0,
                           fill=False, ec=INK, lw=2.0, zorder=6))

    def dim_h(x1, x2, y, label, ext_from=None, fs=13):
        if ext_from is not None:
            for x in (x1, x2):
                y_end = y + (10 if y > ext_from else -10)
                ax.plot([x, x], [ext_from, y_end], color=DIM, lw=0.7,
                        ls=(0, (5, 4)), zorder=4)
        ax.annotate("", xy=(x1, y), xytext=(x2, y),
                    arrowprops=dict(arrowstyle="<|-|>,head_width=0.26,head_length=0.7",
                                    color=DIM, lw=1.1, shrinkA=0, shrinkB=0),
                    zorder=6)
        for x in (x1, x2):
            ax.plot([x, x], [y - TICK, y + TICK], color=DIM, lw=1.1, zorder=6)
        ax.text((x1 + x2) / 2, y + 8, label, ha="center", va="bottom",
                fontsize=fs, color=DIM, zorder=7,
                bbox=dict(fc="white", ec="none", pad=1.0))

    def dim_v(y1, y2, x, label, ext_from=None, fs=13, side="left"):
        if ext_from is not None:
            for y in (y1, y2):
                x_end = x + (10 if x > ext_from else -10)
                ax.plot([ext_from, x_end], [y, y], color=DIM, lw=0.7,
                        ls=(0, (5, 4)), zorder=4)
        ax.annotate("", xy=(x, y1), xytext=(x, y2),
                    arrowprops=dict(arrowstyle="<|-|>,head_width=0.26,head_length=0.7",
                                    color=DIM, lw=1.1, shrinkA=0, shrinkB=0),
                    zorder=6)
        for y in (y1, y2):
            ax.plot([x - TICK, x + TICK], [y, y], color=DIM, lw=1.1, zorder=6)
        ax.text(x + (-8 if side == "left" else 8), (y1 + y2) / 2, label,
                ha="right" if side == "left" else "left", va="center",
                rotation=90, fontsize=fs, color=DIM, zorder=7,
                bbox=dict(fc="white", ec="none", pad=1.0))

    def leader(x, y, tx, ty, text, fs=11.5):
        ax.annotate(text, xy=(x, y), xytext=(tx, ty), fontsize=fs, color=NOTE,
                    ha="center", va="center", zorder=9,
                    arrowprops=dict(arrowstyle="-", color=NOTE, lw=0.9,
                                    shrinkA=0, shrinkB=3),
                    bbox=dict(fc="white", ec=NOTE, lw=0.7, pad=3.0, alpha=0.96))

    # ---- X chain below the frame -----------------------------------------
    for a, b, t in spec["chain"]:
        dim_h(a, b, -260.0, t, ext_from=Y0, fs=12)
    for (lo, hi), txt in spec["zones"]:
        ax.text((lo + hi) / 2, -320, txt, ha="center", va="center",
                fontsize=13.5, color=INK, zorder=8,
                bbox=dict(fc="white", ec=INK, lw=0.8, pad=3.5))
    dim_h(X0, X1, -400.0, "1400 mm", ext_from=Y0, fs=18)

    # ---- X detail above the frame ----------------------------------------
    for level, key, fs in ((452.0, "detail1", 12), (522.0, "detail2", 12),
                           (592.0, "detail3", 12)):
        for a, b, t in spec[key]:
            dim_h(a, b, level, t, ext_from=Y1, fs=fs if len(t) < 8 else 12)
    dim_h(-500.0, 500.0, 662.0, "1000  LINEAR RAIL", ext_from=Y1, fs=15) \
        if not any(t.endswith("LINEAR RAIL") for _, _, t in spec["detail3"]) else None

    # ---- Y dimensions -----------------------------------------------------
    for y1, y2, x, label, side, fs in spec["ydims"]:
        dim_v(y1, y2, x, label, ext_from=X0 if side == "left" else X1,
              fs=fs, side=side)

    # ---- centre line ------------------------------------------------------
    ax.plot([0, 0], [Y0 - 230, Y1 + 30], color="#c02020", lw=0.9,
            ls=(0, (14, 5, 3, 5)), zorder=5)
    ax.text(-8, Y0 - 240, "CL  X=0", ha="right", va="top", fontsize=11,
            color="#c02020", zorder=8)

    # ---- callouts and item labels ----------------------------------------
    for x, y, tx, ty, text in spec["callouts"]:
        leader(x, y, tx, ty, text)
    for x, y, n in spec["bottles"]:
        ax.text(x, y, n, ha="center", va="center", fontsize=8.5, color=INK,
                zorder=10,
                bbox=dict(fc="white", ec=INK, lw=0.5, pad=1.6, alpha=0.9))
    if spec["bucket"]:
        bx, by = spec["bucket"]
        ax.text(bx, by, "WASTE", ha="center", va="center", fontsize=9,
                color="#c02020", zorder=10,
                bbox=dict(fc="white", ec="#c02020", lw=0.6, pad=2.0, alpha=0.9))

    # ---- origin axis marker ----------------------------------------------
    ox, oy = X0 + 45, Y0 + 45
    ax.annotate("", xy=(ox + 80, oy), xytext=(ox, oy),
                arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.3), zorder=8)
    ax.annotate("", xy=(ox, oy + 80), xytext=(ox, oy),
                arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.3), zorder=8)
    ax.text(ox + 90, oy, "X", fontsize=13, va="center", color=INK, zorder=8)
    ax.text(ox, oy + 90, "Y", fontsize=13, ha="center", color=INK, zorder=8)

    # ---- sheet border + title block --------------------------------------
    SX0, SY0, SX1, SY1 = -1115, -605, 1115, 690
    ax.add_patch(Rectangle((SX0, SY0), SX1 - SX0, SY1 - SY0,
                           fill=False, ec=INK, lw=2.4, zorder=11))
    tw, th = 700, 145
    tx, ty = SX1 - 14 - tw, SY0 + 14
    ax.add_patch(Rectangle((tx, ty), tw, th, fill=True, fc="white",
                           ec=INK, lw=1.6, zorder=12))
    ax.plot([tx, tx + tw], [ty + 70, ty + 70], color=INK, lw=1.0, zorder=13)
    ax.plot([tx + 350, tx + 350], [ty, ty + 70], color=INK, lw=1.0, zorder=13)
    ax.text(tx + 18, ty + 108, spec["title"], fontsize=17, va="center",
            color=INK, zorder=13, fontweight="bold")
    ax.text(tx + 18, ty + 47, "단위   mm", fontsize=12.5, va="center",
            color=INK, zorder=13)
    ax.text(tx + 18, ty + 20, "시트   1400 × 600", fontsize=12.5, va="center",
            color=INK, zorder=13)
    ax.text(tx + 368, ty + 47, "축척   1 : 1 (정투상 탑뷰)", fontsize=12.5,
            va="center", color=INK, zorder=13)
    ax.text(tx + 368, ty + 20, "변형   %s" % variant, fontsize=12.5,
            va="center", color=INK, zorder=13)

    fig.subplots_adjust(0, 0, 1, 1)
    fig.savefig(out, dpi=150, facecolor="white", bbox_inches="tight",
                pad_inches=0.12)
    plt.close(fig)
    print("wrote", out)


def main():
    wanted = sys.argv[1:] or list(VARIANTS)
    for variant in wanted:
        if variant not in VARIANTS:
            raise SystemExit("unknown variant %r, expected one of %s"
                             % (variant, ", ".join(VARIANTS)))
        draw(variant, VARIANTS[variant])


main()
