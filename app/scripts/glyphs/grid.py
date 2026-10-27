"""Crop with a coordinate grid: grid.py page.png x0 y0 x1 y1 out.png [step]
Labels are page pixel coordinates, so letter boxes can be read off directly."""
import sys
from PIL import Image, ImageDraw
src, x0, y0, x1, y1, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
step = int(sys.argv[7]) if len(sys.argv) > 7 else 50
im = Image.open(src).convert("RGB").crop((x0, y0, x1, y1))
d = ImageDraw.Draw(im)
for x in range((x0 // step + 1) * step, x1, step):
    d.line([(x - x0, 0), (x - x0, im.height)], fill=(255, 0, 0) if x % (step * 2) == 0 else (255, 170, 170), width=1)
    if x % (step * 2) == 0: d.text((x - x0 + 2, 2), str(x), fill=(200, 0, 0))
for y in range((y0 // step + 1) * step, y1, step):
    d.line([(0, y - y0), (im.width, y - y0)], fill=(0, 0, 255) if y % (step * 2) == 0 else (170, 170, 255), width=1)
    if y % (step * 2) == 0: d.text((2, y - y0 + 2), str(y), fill=(0, 0, 200))
im.save(out)
print(im.size)
