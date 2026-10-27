"""Draw the library of hover annotations: annotations.py

Twenty distinct marks after the colored marker and brush gestures Chiari
laid over printed scores. Each is its own gesture, not a variant of
another: scribble fill, coil, hatching, arc, underline, spring, tangle,
ticks, brush swipes, dabs, cross-hatch, open oval, strike, verticals,
spiral, wave, hook, crossing diagonals, taps and lasso.

Every mark is black on transparent and used as a CSS mask, so any palette
color can paint it (see [data-fx-ann-color] in app/styles/custom.css). The
viewBox is 280 × 50, and every use keeps that shape: marks are never
turned or squeezed, so they read as drawn.

Writes assets/images/marks/annotate-01.svg … -20.svg and
app/styles/annotations.css (one mask rule per mark).
"""
import glob, math, os, random

from paint_circle import brush, wobble

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "../../../assets/images/marks")
CSS = os.path.join(HERE, "../../styles/annotations.css")
W, H = 280, 50


def stroke(rng, pts, width, taper=True, worn=True, dry=0.9, jag=0.4):
    """Brush a centreline: pressure lands, loads and lifts like a marker."""
    widths = []
    n = len(pts) - 1
    w_w = wobble(rng, n=2, amp=width * 0.12)
    for i in range(n + 1):
        u = i / max(1, n)
        press = min(1, u / 0.08) * (1 - max(0, (u - 0.82) / 0.18) ** 1.4) if taper else 1
        widths.append(max(0.4, width * (0.55 + 0.45 * press) + w_w(u * 6)))
    return brush(rng, pts, widths, width, "#000", jag=jag, dry=dry, worn=worn)


def line(a, b, n=20):
    """Points from a to b."""
    return [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]


def subdivide(pts, k=5):
    """Add points between corners so the brush bends at each one."""
    fine = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        fine += [(ax + (bx - ax) * j / k, ay + (by - ay) * j / k) for j in range(k)]
    return fine + [pts[-1]]


def bristles(rng, x0, y0, length, angle, width, lanes):
    """A broad brush stroke as parallel bristle lanes: each lane is a thin
    stroke that starts, thins and runs dry at its own point, so the stroke
    reads streaky like paint dragged from a loaded brush."""
    out = []
    ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    nx, ny = -sa, ca
    wave = wobble(rng, n=2, amp=1.8)
    for k in range(lanes):
        off = (k / max(1, lanes - 1) - 0.5) * width + rng.uniform(-0.8, 0.8)
        core = 1 - abs(off) / (width * 0.6)  # middle lanes carry more paint
        start = rng.uniform(0, 0.12) + (1 - core) * 0.08
        end = rng.uniform(0.7, 1.0) * (0.75 + 0.25 * core)
        pts = []
        for i in range(36):
            u = start + (end - start) * i / 35
            d = length * u
            pts.append((x0 + ca * d + nx * (off + wave(u * 5) * 0.5), y0 + sa * d + ny * (off + wave(u * 5) * 0.5)))
        out.append(stroke(rng, pts, width / lanes * rng.uniform(1.3, 1.9), dry=rng.uniform(0.6, 0.85), jag=0.25))
    return out


# --- The twenty gestures --------------------------------------------------


def scribble_fill(rng):
    """Horizontal back-and-forth over a patch, lines apart, like a quick fill."""
    x0, x1, rows = rng.uniform(16, 40), rng.uniform(190, 240), 6
    pts = []
    for r in range(rows):
        y = 6 + r * 7.4 + rng.uniform(-0.8, 0.8)
        a, b = (x0 + rng.uniform(-6, 6), x1 + rng.uniform(-8, 6))
        if r % 2:
            a, b = b, a
        pts += [(a + (b - a) * j / 9, y + math.sin(j / 9 * 3) * 0.9) for j in range(10)]
    return [stroke(rng, pts, 3.4, dry=0.95, jag=0.25)]


def coil(rng):
    """A chain of overlapping loops pulled along the row."""
    x0, span, r, turns = 18, 200, 12, 6.5
    pts = [(x0 + span * i / 239 + r * 0.9 * math.cos(i / 239 * turns * 2 * math.pi),
            25 + r * math.sin(i / 239 * turns * 2 * math.pi)) for i in range(240)]
    return [stroke(rng, pts, 4.8)]


def hatching(rng):
    """A run of short parallel diagonal dashes."""
    out, x = [], 20
    for _ in range(9):
        y0 = rng.uniform(8, 14)
        out.append(stroke(rng, line((x, y0 + 26), (x + 14, y0), 12), rng.uniform(6.5, 8)))
        x += rng.uniform(22, 27)
    return out


def arc(rng):
    """One long thin sweep rising across the row."""
    pts = [(8 + 264 * u, 40 - 26 * u - 14 * math.sin(math.pi * u)) for u in [i / 79 for i in range(80)]]
    return [stroke(rng, pts, 4.2)]


def underline(rng):
    """A low underline, gone over twice for part of its length."""
    wave = wobble(rng, n=2, amp=1.2)
    pts = [(10 + 250 * i / 59, 41 + wave(i / 59 * 6)) for i in range(60)]
    again = [(x + rng.uniform(-0.6, 0.6), y - 4) for x, y in pts[12:46]]
    return [stroke(rng, pts, 7), stroke(rng, again, 4.6)]


def spring(rng):
    """A tall, sharp zigzag."""
    pts = [(24 + 210 * i / 20 + rng.uniform(-1.5, 1.5), (6 if i % 2 else 44) + rng.uniform(-2, 2)) for i in range(21)]
    return [stroke(rng, subdivide(pts, 6), 5.2)]


def tangle(rng):
    """A knotted scribble around one spot."""
    pts, t = [], 0.0
    for i in range(320):
        t += 0.11 + rng.uniform(-0.02, 0.02)
        pts.append((140 + (40 + 30 * math.sin(i / 37)) * math.cos(t * 1.3), 25 + (14 + 6 * math.sin(i / 23)) * math.sin(t * 2.1)))
    return [stroke(rng, pts, 3.0, dry=0.96, jag=0.25)]


def ticks(rng):
    """Quick check-mark flicks."""
    out = []
    for x in (30, 95, 160, 225):
        pts = line((x, 26), (x + 8, 40), 8) + line((x + 8, 40), (x + 30, 6), 14)[1:]
        out.append(stroke(rng, pts, rng.uniform(5.5, 6.5)))
    return out


def brush_swipes(rng):
    """Two broad, streaky swipes on a diagonal, dragging dry toward the end."""
    return bristles(rng, 14, 30, 150, -9, 20, 8) + bristles(rng, 130, 26, 140, -4, 18, 7)


def dabs(rng):
    """Short broad dabs set down at an angle and lifted."""
    out, x = [], 18
    for _ in range(4):
        length = rng.uniform(30, 42)
        out += bristles(rng, x, rng.uniform(18, 32), length, rng.uniform(-28, 6), 15, 6)
        x += length + rng.uniform(22, 32)
    return out


def cross_hatch(rng):
    """An X-hatched patch: one set of diagonals, then the other across it."""
    out = []
    for i in range(7):
        x = 70 + i * 20
        out.append(stroke(rng, line((x, 44), (x + 24, 6), 10), 3.6, dry=0.95))
    for i in range(7):
        x = 74 + i * 20
        out.append(stroke(rng, line((x, 6), (x + 24, 44), 10), 3.6, dry=0.95))
    return out


def oval(rng):
    """A single loose ring, open where the pen lifts, as when circling."""
    start, span = 2.6, 2 * math.pi - 0.5
    pts = [(140 + 112 * math.cos(start + span * u), 25 + 18 * math.sin(start + span * u) * (1 + 0.05 * u))
           for u in [i / 119 for i in range(120)]]
    return [stroke(rng, pts, 4.4)]


def strike(rng):
    """One fast slash through the middle, hooking back at the end."""
    pts = line((16, 30), (238, 20), 40)
    pts += [(238 + 14 * math.sin(u * math.pi / 2), 20 + 12 * (1 - math.cos(u * math.pi / 2))) for u in [i / 10 for i in range(1, 11)]]
    return [stroke(rng, pts, 5.8)]


def verticals(rng):
    """A tight cluster of tall strokes leaning together, like marks over notes."""
    out = []
    for i in range(8):
        x = 100 + i * 9 + rng.uniform(-2, 2)
        lean = rng.uniform(4, 9)
        out.append(stroke(rng, line((x + lean, 4 + rng.uniform(0, 4)), (x, 46 - rng.uniform(0, 4)), 14), rng.uniform(5, 6.5)))
    return out


def spiral(rng):
    """A spiral wound inward on one spot, like a coil seen end on."""
    pts = []
    for i in range(220):
        u = i / 219
        t = u * 5.5 * 2 * math.pi
        r = 1 - 0.85 * u
        pts.append((140 + 60 * r * math.cos(t), 25 + 19 * r * math.sin(t)))
    return [stroke(rng, pts, 3.2, dry=0.97, jag=0.25)]


def wave(rng):
    """A long, even wave across the row."""
    pts = [(10 + 260 * u, 25 + 14 * math.sin(u * 4.5 * 2 * math.pi)) for u in [i / 159 for i in range(160)]]
    return [stroke(rng, pts, 4.4)]


def hook(rng):
    """A long stroke that curls back on itself at the tail."""
    pts = [(12 + 200 * u, 38 - 10 * u) for u in [i / 39 for i in range(40)]]
    for i in range(1, 31):
        t = i / 30 * 1.6 * math.pi
        pts.append((212 + 22 * math.sin(t), 28 - 22 * (1 - math.cos(t)) / 2))
    return [stroke(rng, pts, 5.2)]


def crossing_diagonals(rng):
    """Two long lines crossing steeply over the row."""
    return [stroke(rng, line((30, 46), (250, 4), 40), 4.2), stroke(rng, line((60, 4), (230, 46), 40), 4.2)]


def taps(rng):
    """Scattered taps of the marker tip."""
    out = []
    for _ in range(14):
        x, y = rng.uniform(16, 264), rng.uniform(8, 42)
        a = rng.uniform(0, math.pi)
        out.append(stroke(rng, line((x, y), (x + 3 * math.cos(a), y + 3 * math.sin(a)), 4), rng.uniform(7, 9.5), dry=1))
    return out


def lasso(rng):
    """One loop thrown at the start, trailing off in a long tail."""
    pts = [(46 + 30 * math.cos(t), 25 + 16 * math.sin(t)) for t in [math.pi * 0.2 + i / 60 * 2.1 * math.pi for i in range(61)]]
    end = pts[-1]
    tail = wobble(rng, n=2, amp=2)
    pts += [(end[0] + 200 * u, end[1] + 8 * u + tail(u * 5)) for u in [i / 40 for i in range(1, 41)]]
    return [stroke(rng, pts, 4.4)]


GESTURES = [scribble_fill, coil, hatching, arc, underline, spring, tangle, ticks, brush_swipes, dabs,
            cross_hatch, oval, strike, verticals, spiral, wave, hook, crossing_diagonals, taps, lasso]


def svg(parts):
    paths, fibres = [], []
    for p, f in parts:
        paths += p
        fibres += f
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none">'
            f'<path fill="#000" d="{" ".join(paths)}"/>{"".join(fibres)}</svg>\n')


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, "annotate-*.svg")):  # drop marks no longer drawn
        os.remove(old)
    rules = ["/* Generated by app/scripts/glyphs/annotations.py: one mask per hover",
             " * annotation. Edit the generator, not this file. */", ""]
    for i, gesture in enumerate(GESTURES, 1):
        name = f"annotate-{i:02d}.svg"
        open(os.path.join(OUT, name), "w").write(svg(gesture(random.Random(2000 + i))))
        url = f'url("../images/marks/{name}")'
        rules.append(f'[data-fx-ann="{i}"]::after {{ -webkit-mask-image: {url}; mask-image: {url}; }}')
        print(f"{i:02d}", gesture.__name__)
    open(CSS, "w").write("\n".join(rules) + "\n")
    print(os.path.normpath(CSS))
