"""Draw the library of hover annotations: annotations.py

Thirty marks in ten families, after the colored marker and brush gestures
Chiari laid over printed scores: dense scribble blocks, coils, hatching,
long arcs, underlines, spring zigzags, tangles, ticks, broad dry brush
swipes and dabs. Three variants of each, from different seeds.

Every mark is black on transparent and used as a CSS mask, so any palette
color can paint it. The viewBox is 280 × 50, about the shape of a search
result row, and masks stretch to the row.

Each mark is also written turned on its side (annotate-v-NN.svg, 50 × 280),
for marks that run down the edge of a card.

Writes assets/images/marks/annotate-01.svg … -30.svg, the -v- versions,
and app/styles/annotations.css (one mask rule per mark and direction).
"""
import math, os, random, re

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


def scribble_block(rng):
    """A tight zigzag scribble worked back and forth over a patch, like the
    red clusters: visible strokes with paper between them, not a solid bar."""
    x0, x1 = rng.uniform(10, 70), rng.uniform(130, 240)
    top, bot = rng.uniform(3, 9), rng.uniform(41, 47)
    passes = rng.randint(2, 3)
    pts = []
    for p in range(passes):
        teeth = rng.randint(9, 15)
        a, b = (x0, x1) if p % 2 == 0 else (x1, x0)
        for i in range(teeth * 2 + 1):
            u = i / (teeth * 2)
            y = (top if i % 2 else bot) + rng.uniform(-3, 3)
            pts.append((a + (b - a) * u + rng.uniform(-3, 3), y))
    fine = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        for k in range(5):
            fine.append((ax + (bx - ax) * k / 5, ay + (by - ay) * k / 5))
    fine.append(pts[-1])
    return [stroke(rng, fine, rng.uniform(3.6, 4.6), dry=0.95, jag=0.3)]


def coil(rng):
    """A chain of overlapping loops pulled along the row."""
    x0 = rng.uniform(10, 50)
    span = rng.uniform(150, 230)
    r = rng.uniform(9, 14)
    turns = rng.uniform(5, 8)
    pts = []
    for i in range(240):
        t = i / 239 * turns * 2 * math.pi
        pts.append((x0 + span * i / 239 + r * 0.9 * math.cos(t), 25 + r * math.sin(t) + rng.uniform(-0.4, 0.4)))
    return [stroke(rng, pts, rng.uniform(4, 5.5))]


def hatching(rng):
    """A run of short diagonal strokes across the row."""
    out = []
    n = rng.randint(6, 11)
    lean = rng.uniform(0.5, 1.1) * rng.choice([1, -1])
    x = rng.uniform(10, 30)
    for _ in range(n):
        h = rng.uniform(26, 40)
        y0 = rng.uniform(4, 50 - h - 2)
        pts = [(x + lean * h * u + rng.uniform(-0.6, 0.6), y0 + h * u) for u in [i / 14 for i in range(15)]]
        out.append(stroke(rng, pts[::rng.choice([1, -1])], rng.uniform(6, 9)))
        x += rng.uniform(16, 26)
        if x > W - 20:
            break
    return out


def arc(rng):
    """One long thin sweep across the row."""
    up = rng.choice([1, -1])
    a, b = (rng.uniform(4, 20), 25 + up * rng.uniform(10, 18)), (rng.uniform(250, 276), 25 - up * rng.uniform(10, 20))
    sag = rng.uniform(12, 20) * up
    pts = []
    for i in range(80):
        u = i / 79
        pts.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u + sag * math.sin(math.pi * u)))
    return [stroke(rng, pts, rng.uniform(3.5, 5))]


def underline(rng):
    """A long underline with a slight wave, sitting low in the row."""
    y = rng.uniform(37, 44)
    x0, x1 = rng.uniform(4, 30), rng.uniform(220, 276)
    wave = wobble(rng, n=2, amp=1.6)
    pts = [(x0 + (x1 - x0) * i / 59, y + wave(i / 59 * 6)) for i in range(60)]
    out = [stroke(rng, pts, rng.uniform(6, 8))]
    if rng.random() < 0.5:  # sometimes gone over twice
        pts2 = [(x + rng.uniform(-1, 1), yy + rng.uniform(2.5, 4)) for x, yy in pts[rng.randint(5, 20):rng.randint(40, 58)]]
        out.append(stroke(rng, pts2, rng.uniform(4, 5.5)))
    return out


def spring(rng):
    """A sharp zigzag spring, tall and quick."""
    x0, x1 = rng.uniform(10, 60), rng.uniform(170, 260)
    teeth = rng.randint(7, 12)
    top, bot = rng.uniform(4, 10), rng.uniform(40, 46)
    pts = []
    for i in range(teeth * 2 + 1):
        u = i / (teeth * 2)
        pts.append((x0 + (x1 - x0) * u + rng.uniform(-2, 2), (top if i % 2 else bot) + rng.uniform(-2, 2)))
    # Subdivide so the brush bends at each tooth.
    fine = []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        for k in range(6):
            fine.append((ax + (bx - ax) * k / 6, ay + (by - ay) * k / 6))
    fine.append(pts[-1])
    return [stroke(rng, fine, rng.uniform(4.5, 6))]


def tangle(rng):
    """A knotted scribble around one spot, overlapping lines."""
    cx, cy = rng.uniform(70, 210), 25
    pts = []
    t = 0.0
    for i in range(320):
        t += 0.11 + rng.uniform(-0.02, 0.02)
        rx = 40 + 30 * math.sin(i / 37)
        ry = 14 + 6 * math.sin(i / 23)
        pts.append((cx + rx * math.cos(t * 1.3), cy + ry * math.sin(t * 2.1)))
    return [stroke(rng, pts, rng.uniform(2.6, 3.4), dry=0.96, jag=0.25)]


def ticks(rng):
    """A few quick check-mark flicks."""
    out = []
    x = rng.uniform(16, 50)
    for _ in range(rng.randint(3, 5)):
        s = rng.uniform(0.8, 1.2)
        a = (x, 26 * s)
        b = (x + 8 * s, 40)
        c = (x + 30 * s, rng.uniform(4, 10))
        pts = [(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u) for u in [i / 8 for i in range(9)]]
        pts += [(b[0] + (c[0] - b[0]) * u, b[1] + (c[1] - b[1]) * u) for u in [i / 14 for i in range(1, 15)]]
        out.append(stroke(rng, pts, rng.uniform(5, 7)))
        x += rng.uniform(48, 70)
        if x > W - 40:
            break
    return out


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
        # Middle lanes carry more paint and run further.
        core = 1 - abs(off) / (width * 0.6)
        start = rng.uniform(0, 0.12) + (1 - core) * 0.08
        end = rng.uniform(0.7, 1.0) * (0.75 + 0.25 * core)
        pts = []
        for i in range(36):
            u = start + (end - start) * i / 35
            d = length * u
            x = x0 + ca * d + nx * (off + wave(u * 5) * 0.5)
            y = y0 + sa * d + ny * (off + wave(u * 5) * 0.5)
            pts.append((x, y))
        lw = width / lanes * rng.uniform(1.3, 1.9)
        out.append(stroke(rng, pts, lw, dry=rng.uniform(0.6, 0.85), jag=0.25))
    return out


def brush_swipes(rng):
    """Two or three broad, streaky swipes on a diagonal, like the brushwork
    over a score: loaded at the start, dragging dry toward the end."""
    out = []
    for _ in range(rng.randint(2, 3)):
        length = rng.uniform(90, 170)
        angle = rng.uniform(-18, 6)
        x0 = rng.uniform(0, W - length * 0.9)
        y0 = rng.uniform(18, 34)
        out += bristles(rng, x0, y0, length, angle, rng.uniform(14, 22), rng.randint(6, 9))
    return out


def dabs(rng):
    """Short broad dabs of paint, set down at an angle and lifted."""
    out = []
    x = rng.uniform(6, 40)
    for _ in range(rng.randint(3, 5)):
        length = rng.uniform(26, 46)
        out += bristles(rng, x, rng.uniform(16, 34), length, rng.uniform(-30, 10), rng.uniform(12, 18), rng.randint(5, 7))
        x += length + rng.uniform(12, 30)
        if x > W - 30:
            break
    return out


FAMILIES = [scribble_block, coil, hatching, arc, underline, spring, tangle, ticks, brush_swipes, dabs]


def svg(parts, vertical=False):
    paths, fibres = [], []
    for p, f in parts:
        paths += p
        fibres += f
    body = f'<path fill="#000" d="{" ".join(paths)}"/>{"".join(fibres)}'
    w, h = W, H
    if vertical:
        # Turn the mark a quarter clockwise: (x, y) -> (H - y, x).
        body = re.sub(r"(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)",
                      lambda m: f"{H - float(m.group(2)):.1f} {float(m.group(1)):.1f}", body)
        w, h = H, W
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'{body}</svg>\n')


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    rules = ["/* Generated by app/scripts/glyphs/annotations.py: one mask per hover",
             " * annotation. Edit the generator, not this file. */", ""]
    for i in range(30):
        family = FAMILIES[i % len(FAMILIES)]
        parts = family(random.Random(1000 + i))
        for vertical in (False, True):
            name = f"annotate-{'v-' if vertical else ''}{i + 1:02d}.svg"
            open(os.path.join(OUT, name), "w").write(svg(parts, vertical))
            url = f'url("../images/marks/{name}")'
            sel = f'[data-fx-ann="{i + 1}"]' + ('[data-fx-ann-dir="v"]' if vertical else '')
            rules.append(f'{sel}::after {{ -webkit-mask-image: {url}; mask-image: {url}; }}')
        print(name, family.__name__)
    open(CSS, "w").write("\n".join(rules) + "\n")
    print(os.path.normpath(CSS))
