"""Vectorize printed lettering from a photo/scan, keeping print texture.

extract.py image.jpg x0 y0 x1 y1 out.svg [--channel R] [--min-area 80]
           [--turd 3] [--blur 0.4] [--bias 0]

Unlike glyph.py this keeps everything the press left: pinholes where ink
didn't take, chipped edges, rough counters. Only detached specks smaller than
--min-area (paper dirt) are dropped. --bias nudges the Otsu threshold (+ = more
ink). Output is one black compound path in source-pixel units.
"""
import argparse
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
import potrace

ap = argparse.ArgumentParser()
ap.add_argument("image"); ap.add_argument("box", nargs=4, type=int); ap.add_argument("out")
ap.add_argument("--channel", default="R", choices=["R", "G", "B", "L"])
ap.add_argument("--min-area", type=int, default=80)
ap.add_argument("--turd", type=int, default=3)
ap.add_argument("--blur", type=float, default=0.4)
ap.add_argument("--bias", type=int, default=0)
ap.add_argument("--label", default="")
ap.add_argument("--void", type=int, default=None,
                help="inside letters, pixels lighter than this become holes (unprinted flecks)")
a = ap.parse_args()

im = Image.open(a.image).convert("RGB").crop(tuple(a.box))
ch = im.convert("L") if a.channel == "L" else im.getchannel(a.channel)
if a.blur: ch = ch.filter(ImageFilter.GaussianBlur(a.blur))
g = np.asarray(ch, dtype=np.float64)
hist, _ = np.histogram(g, bins=256, range=(0, 256))
w = np.cumsum(hist); m = np.cumsum(hist * np.arange(256))
t = int(np.argmax((m[-1] * w / w[-1] - m) ** 2 / np.maximum(w * (w[-1] - w), 1))) + a.bias
ink = g < t
if a.void is not None:
    # Flecks where ink didn't take are pale but rarely reach paper colour, so
    # Otsu keeps them as ink. Inside each letter (2px clear of its edge, so the
    # outline isn't eaten) treat anything lighter than --void as bare paper.
    raw = np.asarray(im.convert("L") if a.channel == "L" else im.getchannel(a.channel), dtype=np.float64)
    core = ndimage.binary_erosion(ink, iterations=2)
    ink &= ~(core & (raw > a.void))

lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
areas = ndimage.sum(ink, lab, range(1, n + 1))
ink = np.isin(lab, 1 + np.nonzero(areas >= a.min_area)[0])

# potracer traces False pixels as ink, so hand it the inverse.
path = potrace.Bitmap(~ink).trace(turdsize=a.turd, alphamax=0.7, opticurve=True, opttolerance=0.15)
f = lambda p: f"{p.x:.1f} {p.y:.1f}"
d = []
for c in path:
    d.append("M" + f(c.start_point))
    for s in c.segments:
        d.append(("L" + f(s.c) + " L" + f(s.end_point)) if s.is_corner else
                 ("C" + f(s.c1) + " " + f(s.c2) + " " + f(s.end_point)))
    d.append("Z")
ys, xs = np.nonzero(ink)
vb = f"{xs.min() - 4} {ys.min() - 4} {xs.max() - xs.min() + 8} {ys.max() - ys.min() + 8}"
label = f' role="img" aria-label="{a.label}"' if a.label else ' aria-hidden="true"'
open(a.out, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{label}>'
                       f'<path fill="#000" fill-rule="evenodd" d="{" ".join(d)}"/></svg>\n')
Image.fromarray((~ink * 255).astype("uint8")).save(a.out.replace(".svg", ".png"))
print(a.out, "threshold", t, "paths", len(path), "kept components", int((areas >= a.min_area).sum()), "of", n)
