"""Build the masthead wordmarks from Chiari's own hand.

masthead.py letter.jpg bag.jpg [--out assets/images/glyphs] [--grow 1]

art-is-easy.svg (English)
    The first, underlined ART IS EASY on page 1 of the "Art is Easy" text
    pieces (felt pen on paper). The paper is flattened, the ink blurred and
    thresholded so the dry, broken underline reads as one stroke, then grown
    by --grow source pixels so the thin pen holds up at masthead size.

l-arte-e-facile.svg (Italian)
    L'ARTE / È / FACILE from the front of the "Art is Easy" bag (marker on
    crumpled orange paper), reset on one line. Crinkle sheen inside the ink
    is closed up. Each letter keeps its own height off the baseline, but the
    line is spaced like the English: letter gaps are scaled together, keeping
    Chiari's rhythm, until their average matches ART IS EASY's, and word gaps
    match its word gaps, both measured against cap height.

Both marks are scaled to one cap height and share a viewBox height and
baseline, so set at the same CSS height their letters match in size and sit on
the same line. The script prints each viewBox; its width / height is the
aspect ratio to use in app/styles/custom.css.

Both sources are the IIIF full/max images:

  letter  https://images-understory.dc.library.northwestern.edu/iiif/3/image/8e00e6da-341a-4ed5-a4a3-d29c4a6958cc/d813e4cb-606b-41f9-ae7c-6dce406dddc9/full/max/0/default.jpg
  bag     https://images-understory.dc.library.northwestern.edu/iiif/3/image/fe93e84d-8d79-4f01-9bd4-2c5892b70bd1/dd445ce7-cc2b-4598-adce-1a0d3e64be88/full/max/0/default.jpg

The crop boxes below are in those images' pixels (1758x2200 and 2262x3696).
"""
import argparse
import os
import numpy as np
from PIL import Image
from scipy import ndimage
import potrace

ap = argparse.ArgumentParser()
ap.add_argument("letter"); ap.add_argument("bag")
ap.add_argument("--out", default="assets/images/glyphs")
ap.add_argument("--grow", type=float, default=1.0, help="English stroke growth, in source pixels")
a = ap.parse_args()


def disk(r):
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    return (xx ** 2 + yy ** 2) <= r ** 2


def drop_specks(ink, min_area):
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    areas = ndimage.sum(ink, lab, range(1, n + 1))
    return np.isin(lab, 1 + np.nonzero(areas >= min_area)[0])


def smooth(ink, sigma):
    """Round off nicks and burrs smaller than sigma without changing the weight."""
    return ndimage.gaussian_filter(np.pad(ink, 12).astype(float), sigma)[12:-12, 12:-12] > 0.5


PAD = 4


def extent(ink, scale):
    """Ink bounds (x0, y0, x1, y1) in output units, padded."""
    ys, xs = np.nonzero(ink)
    return (xs.min() * scale - PAD, ys.min() * scale - PAD,
            (xs.max() + 1) * scale + PAD, (ys.max() + 1) * scale + PAD)


def trace(ink, scale, out, label, top, bottom):
    """Write ink (True = ink) as one compound path, scale = output units per mask px.
    The viewBox spans the ink's width and top..bottom (output units) in height."""
    path = potrace.Bitmap(~ink).trace(turdsize=8, alphamax=1.0, opticurve=True, opttolerance=0.2)
    f = lambda p: f"{p.x * scale:.1f} {p.y * scale:.1f}"
    d = []
    for c in path:
        d.append("M" + f(c.start_point))
        for s in c.segments:
            d.append(("L" + f(s.c) + " L" + f(s.end_point)) if s.is_corner else
                     ("C" + f(s.c1) + " " + f(s.c2) + " " + f(s.end_point)))
        d.append("Z")
    x0, _, x1, _ = extent(ink, scale)
    x0, y0, w, h = round(x0), round(top), round(x1 - x0), round(bottom - top)
    with open(out, "w") as fh:
        fh.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" '
                 f'role="img" aria-label="{label}"><path fill="#000" fill-rule="evenodd" d="{" ".join(d)}"/></svg>\n')
    print(out, f"viewBox {x0} {y0} {w} {h}", "aspect", f"{w / h:.4f}", "paths", len(path))


# English: pen on paper. Work at 2x so the traced curves come out smooth.
UP = 2
g = np.asarray(Image.open(a.letter).convert("L").crop((95, 870, 1325, 1165)), dtype=float)
g = g / ndimage.median_filter(g, size=61) * 220          # flatten paper tone and shading
g = ndimage.zoom(g, UP, order=3)
ink = ndimage.gaussian_filter(g, 2.5 * UP) < 196          # the light underline survives at this level
ink = drop_specks(ink, 400 * UP * UP)
if a.grow:
    ink = ndimage.binary_dilation(np.pad(ink, 8), structure=disk(round(a.grow * UP)))
    ink = ink[8:-8, 8:-8]
en = smooth(ink, 2.0 * UP)

# Its spacing, in source px. The underline (with the Y's tail through it) is
# the one component wider than half the line; the rest are letters.
lab, n = ndimage.label(en, structure=np.ones((3, 3)))
boxes = sorted((sl for sl in ndimage.find_objects(lab) if sl[1].stop - sl[1].start < en.shape[1] / 2),
               key=lambda sl: sl[1].start)
en_cap = np.median([sl[0].stop - sl[0].start for sl in boxes]) / UP
en_base = np.median([sl[0].stop for sl in boxes]) / UP
gaps = sorted((b[1].start - a_[1].stop) / UP for a_, b in zip(boxes, boxes[1:]))
en_letter_gap = np.mean(gaps[:-2]) / en_cap           # three words: the two widest gaps are word spaces
en_word_gap = np.mean(gaps[-2:]) / en_cap
print(f"ART IS EASY: cap {en_cap:.0f}px, letter gap {en_letter_gap:.3f} cap, word gap {en_word_gap:.3f} cap")

# Italian: marker on orange. The red channel separates black ink from the bag.
X0, Y0 = 530, 615
r = np.asarray(Image.open(a.bag).convert("RGB").crop((X0, Y0, 1800, 1630)), dtype=float)[..., 0]
ink = ndimage.gaussian_filter(r, 1.5) < 125
ink = ndimage.binary_closing(np.pad(ink, 8), structure=disk(4))[8:-8, 8:-8]   # crinkles across strokes
holes = ndimage.binary_fill_holes(ink) & ~ink
hl, hn = ndimage.label(holes)
ink |= np.isin(hl, 1 + np.nonzero(ndimage.sum(holes, hl, range(1, hn + 1)) < 400)[0])  # sheen, not counters
ink = drop_specks(ink, 150)
ink = smooth(ink, 2.0)

# Split into the three written lines by page y, and each line into letters
# (an accent joins the letter it sits over).
lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
objs = ndimage.find_objects(lab)
area = lambda i: int((lab[objs[i - 1]] == i).sum())
LINES = [(615, 990), (990, 1285), (1285, 1630)]          # L'ARTE, È, FACILE
words, heights = [], []
for top, bottom in LINES:
    ids = sorted((i + 1 for i, sl in enumerate(objs) if top <= (sl[0].start + sl[0].stop) / 2 + Y0 < bottom),
                 key=lambda i: objs[i - 1][1].start)
    letters = [i for i in ids if area(i) > 3000]            # not the apostrophe or accent
    heights += [objs[i - 1][0].stop - objs[i - 1][0].start for i in letters]
    base = np.median([objs[i - 1][0].stop for i in letters])
    glyphs = []
    for i in ids:
        x0, x1 = objs[i - 1][1].start, objs[i - 1][1].stop
        if glyphs and min(x1, glyphs[-1][2]) - max(x0, glyphs[-1][1]) > (x1 - x0) / 2:
            glyphs[-1] = (glyphs[-1][0] + [i], min(x0, glyphs[-1][1]), max(x1, glyphs[-1][2]))
        else:
            glyphs.append(([i], x0, x1))
    out = []
    for gids, x0, x1 in glyphs:
        m = np.isin(lab, gids)
        ys = np.nonzero(m.any(1))[0]
        out.append((m[ys[0]:ys[-1] + 1, x0:x1], ys[0] - base, x0, x1))
    words.append(out)
it_cap = np.median(heights)

# Space it like the English, measured in cap heights.
it_gaps = [b[2] - a_[3] for w in words for a_, b in zip(w, w[1:])]
squeeze = en_letter_gap * it_cap / np.mean(it_gaps)
word_gap = round(en_word_gap * it_cap)
print(f"L'ARTE È FACILE: cap {it_cap:.0f}px, letter gaps x{squeeze:.2f}, word gap {word_gap}px")
above = int(max(-dy for w in words for _, dy, _, _ in w))
below = int(max(m.shape[0] + dy for w in words for m, dy, _, _ in w))
room = sum(x1 - x0 for w in words for _, _, x0, x1 in w) + sum(max(g, 0) for g in it_gaps) + 2 * word_gap
line = np.zeros((above + below, room), bool)
x = 0
for wi, w in enumerate(words):
    for gi, (m, dy, x0, x1) in enumerate(w):
        if gi:
            x += round((x0 - w[gi - 1][3]) * squeeze)
        elif wi:
            x += word_gap
        y = int(above + dy)
        line[y:y + m.shape[0], x:x + m.shape[1]] |= m
        x += m.shape[1]
line = line[:, :x]

# One cap height and one baseline for both: scale the Italian to the English
# cap, then give both viewBoxes the same reach above and below the baseline.
s_it = en_cap / it_cap
_, en_y0, _, en_y1 = extent(en, 1 / UP)
_, it_y0, _, it_y1 = extent(line, s_it)
it_base = above * s_it
up = max(en_base - en_y0, it_base - it_y0)
down = max(en_y1 - en_base, it_y1 - it_base)
trace(en, 1 / UP, os.path.join(a.out, "art-is-easy.svg"), "Art is easy", en_base - up, en_base + down)
trace(line, s_it, os.path.join(a.out, "l-arte-e-facile.svg"), "L'arte è facile", it_base - up, it_base + down)
