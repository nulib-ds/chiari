"""Trace one handwritten letter from a rendered page into a normalized SVG path.

glyph.py page.png x0 y0 x1 y1 --char C [--weight 0.17] [--out glyphs/]

1. Crop the box and threshold the ink (Otsu on a lightly blurred crop, so scan
   grain drops out but the felt-tip's ragged edge stays).
2. Keep only connected strokes that mostly sit inside the box; fragments of
   neighbouring letters that poke in are dropped.
3. Measure stroke weight as 2*area/perimeter relative to cap height and grow
   or shrink the ink toward --weight, so letters from lighter and heavier
   passages match.
4. Trace with potrace and write path data scaled to a 100-unit cap height,
   origin at the left of the baseline.
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
import potrace

ap = argparse.ArgumentParser()
ap.add_argument("page"); ap.add_argument("box", nargs=4, type=int)
ap.add_argument("--char", required=True)
ap.add_argument("--weight", type=float, default=None, help="target stroke/cap-height ratio")
ap.add_argument("--pad", type=int, default=6, help="context pixels kept around the box")
ap.add_argument("--out", default="glyphs")
ap.add_argument("--id", default=None, help="variant name, e.g. C.2")
ap.add_argument("--clip", action="store_true", help="cut ink at the box edge (for joined letters)")
ap.add_argument("--baseline", type=int, default=None,
                help="page y of the baseline, for letters with descenders (Q); default is the ink's bottom")
a = ap.parse_args()

x0, y0, x1, y1 = a.box
im = Image.open(a.page).convert("L").crop((x0 - a.pad, y0 - a.pad, x1 + a.pad, y1 + a.pad))
# Work at a common resolution (box ~240px tall) so weight matching moves in
# small steps for every letter, and potrace gets smooth input.
up = 240.0 / (y1 - y0)
im = im.resize((round(im.width * up), round(im.height * up)), Image.LANCZOS)
pad = round(a.pad * up)
g = np.asarray(im.filter(ImageFilter.GaussianBlur(0.8 * up)), dtype=np.float64)

# Otsu threshold
hist, edges = np.histogram(g, bins=256, range=(0, 256))
w = np.cumsum(hist); m = np.cumsum(hist * np.arange(256))
between = (m[-1] * w / w[-1] - m) ** 2 / np.maximum(w * (w[-1] - w), 1)
t = int(np.argmax(between))
ink = g < t

# Keep components that live mostly inside the requested box. With --clip,
# cut at the box edge first, so a stroke joined to a neighbour survives.
inner = np.zeros_like(ink); inner[pad:-pad, pad:-pad] = True
if a.clip:
    ink = ink & inner
lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
keep = np.zeros_like(ink)
for i in range(1, n + 1):
    comp = lab == i
    area = comp.sum()
    if area < 40 * up * up: continue
    if a.clip or (comp & inner).sum() / area >= 0.7: keep |= comp
ink = keep
if not ink.any():
    raise SystemExit(f"{a.id or a.char}: no ink kept in box {a.box}; if the letter is joined to a neighbour, try --clip")

def stroke_ratio(mask):
    ys, xs = np.nonzero(mask)
    cap = ys.max() - ys.min() + 1
    per = (mask ^ ndimage.binary_erosion(mask)).sum()
    return (2 * mask.sum() / max(per, 1)) / cap, cap

ratio, cap = stroke_ratio(ink)
before = ratio
if a.weight:
    for _ in range(60):
        ratio, cap = stroke_ratio(ink)
        if abs(ratio - a.weight) * cap < 0.75: break
        nxt = ndimage.binary_dilation(ink) if ratio < a.weight else ndimage.binary_erosion(ink)
        if nxt.sum() < 0.35 * keep.sum(): break  # never erode a letter away
        ink = nxt
ratio, cap = stroke_ratio(ink)

ys, xs = np.nonzero(ink)
top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
ink = ink[top:bottom, left:right]
# Cap height runs from the ink's top to the baseline; a descender hangs below.
base = ink.shape[0] if a.baseline is None else (a.baseline - (y0 - a.pad)) * up - top
scale = 100.0 / base

# potracer traces False pixels as ink, so hand it the inverse.
path = potrace.Bitmap(~ink).trace(turdsize=round(12 * up * up), alphamax=1.0, opticurve=True, opttolerance=0.25)
def pt(p):  # potrace y grows downward like SVG; shift so baseline is y=0
    return f"{p.x * scale:.1f} {(p.y - base) * scale:.1f}"
d = []
for curve in path:
    d.append("M" + pt(curve.start_point))
    for seg in curve.segments:
        if seg.is_corner: d.append("L" + pt(seg.c) + " L" + pt(seg.end_point))
        else: d.append("C" + pt(seg.c1) + " " + pt(seg.c2) + " " + pt(seg.end_point))
    d.append("Z")

os.makedirs(a.out, exist_ok=True)
gid = a.id or a.char
rec = {"char": a.char, "id": gid, "d": " ".join(d), "advance": round(ink.shape[1] * scale, 1),
       "descent": round(max(0, ink.shape[0] - base) * scale, 1),
       "source": {"page": os.path.basename(a.page), "box": a.box},
       "weight": {"measured": round(before, 3), "final": round(ratio, 3)}}
json.dump(rec, open(os.path.join(a.out, f"{gid}.json"), "w"), indent=1)
Image.fromarray((~ink * 255).astype("uint8")).save(os.path.join(a.out, f"{gid}.png"))
print(gid, "advance", rec["advance"], "weight", rec["weight"], "curves", len(path))
