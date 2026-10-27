"""Contact sheet of traced glyph masks: sheet.py dir out.png CHARS..."""
import sys, os
from PIL import Image, ImageDraw
d, out, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
ims = [Image.open(os.path.join(d, f"{i}.png")).convert("L") for i in ids]
h = 200
ims = [im.resize((max(1, int(im.width * h / im.height)), h)) for im in ims]
W = sum(im.width for im in ims) + 30 * (len(ims) + 1)
sheet = Image.new("L", (W, h + 60), 255); x = 30
dr = ImageDraw.Draw(sheet)
for i, im in zip(ids, ims):
    sheet.paste(im, (x, 20)); dr.text((x, h + 30), i, fill=0); x += im.width + 30
sheet.save(out); print(sheet.size)
