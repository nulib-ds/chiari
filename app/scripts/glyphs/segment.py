"""Find the letters in one line of handwriting and number them.

segment.py page.png x0 y0 x1 y1 sheet.png [--merge 0.35] [--min-area 60]

Thresholds the line, takes connected ink, merges pieces whose horizontal
extents overlap by more than --merge of the narrower piece (so a T's bar and
stem, or an E's loose arms, become one letter), and prints each letter's box
in page coordinates. The sheet shows the line with numbered boxes, so a
letter can be named by its number in sources.json.
"""
import argparse, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("page"); ap.add_argument("box", nargs=4, type=int); ap.add_argument("sheet")
ap.add_argument("--merge", type=float, default=0.35)
ap.add_argument("--min-area", type=int, default=60)
a = ap.parse_args()
x0, y0, x1, y1 = a.box
im = Image.open(a.page).convert("L").crop((x0, y0, x1, y1))
g = np.asarray(im.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float64)
hist, _ = np.histogram(g, bins=256, range=(0, 256))
w = np.cumsum(hist); m = np.cumsum(hist * np.arange(256))
t = int(np.argmax((m[-1] * w / w[-1] - m) ** 2 / np.maximum(w * (w[-1] - w), 1)))
lab, n = ndimage.label(g < t, structure=np.ones((3, 3)))
boxes = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    if (lab[sl] == i).sum() < a.min_area: continue
    boxes.append([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])
boxes.sort()
merged = []
for b in boxes:
    if merged:
        p = merged[-1]
        overlap = min(p[2], b[2]) - max(p[0], b[0])
        if overlap > a.merge * min(p[2] - p[0], b[2] - b[0]):
            merged[-1] = [min(p[0], b[0]), min(p[1], b[1]), max(p[2], b[2]), max(p[3], b[3])]
            continue
    merged.append(b)
sheet = im.convert("RGB"); d = ImageDraw.Draw(sheet)
out = []
for k, (bx0, by0, bx1, by1) in enumerate(merged):
    d.rectangle([bx0 - 2, by0 - 2, bx1 + 2, by1 + 2], outline=(255, 0, 0))
    d.text((bx0, max(0, by0 - 12)), str(k), fill=(0, 0, 255))
    out.append([x0 + bx0 - 2, y0 + by0 - 2, x0 + bx1 + 2, y0 + by1 + 2])
sheet.save(a.sheet)
print(json.dumps({str(k): b for k, b in enumerate(out)}))
