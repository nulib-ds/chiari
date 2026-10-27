"""Set traced glyphs into a word: word.py WORD out.svg [--glyphs dir] [--tracking 14] [--paint]

Glyphs come from glyph.py (100-unit cap height, baseline at y=0). Letters sit
on a shared baseline with --tracking units between them. --paint adds an SVG
filter that roughens the edge slightly and knocks dry-brush streaks out of the
fill, so the word reads as painted rather than printed.
"""
import argparse, json, os
ap = argparse.ArgumentParser()
ap.add_argument("word"); ap.add_argument("out")
ap.add_argument("--glyphs", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "glyphs"))
ap.add_argument("--tracking", type=float, default=14)
ap.add_argument("--paint", action="store_true")
ap.add_argument("--color", default="#000")
a = ap.parse_args()

x, parts, descent = 0.0, [], 0.0
for ch in a.word:
    if ch == " ":
        x += 45; continue
    path = os.path.join(a.glyphs, f"{ch.upper()}.json")
    if not os.path.exists(path):
        raise SystemExit(f"no glyph for {ch!r}; trace it into {a.glyphs}")
    g = json.load(open(path))
    parts.append(f'<path transform="translate({x:.1f} 0)" d="{g["d"]}"/>')
    descent = max(descent, g.get("descent", 0))
    x += g["advance"] + a.tracking
width = x - a.tracking
pad = 6
vb = f"{-pad} {-100 - pad} {width + 2 * pad:.1f} {100 + descent + 2 * pad:.1f}"
paint = ""
if a.paint:
    # Edge: low-frequency displacement wobbles the outline like wet paint.
    # Fill: isotropic noise thresholded high, so only sparse dry flecks drop
    # out and the letter stays mostly solid.
    paint = """<defs><filter id="paint" x="-5%" y="-10%" width="110%" height="120%">
  <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="edge"/>
  <feDisplacementMap in="SourceGraphic" in2="edge" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="rough"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.22 0.4" numOctaves="3" seed="3" result="grain"/>
  <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -16 12.2" result="dry"/>
  <feComposite in="rough" in2="dry" operator="in"/>
</filter></defs>"""
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{a.word.title()}">'
       f'{paint}<g fill="{a.color}"{" filter=\"url(#paint)\"" if a.paint else ""}>{"".join(parts)}</g></svg>\n')
open(a.out, "w").write(svg)
print(a.out, "width", round(width, 1))
