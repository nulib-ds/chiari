"""Draw hand-made paint-marker marks: loops for circling words, and the
search field's magnifying glass. paint_circle.py

Each loop is a filled brush stroke rather than an outline: the centreline
wobbles around an ellipse and stops short of its start, leaving the circle
open, as a quick hand does. The width swells and
thins with pressure, edges are ragged, and the tail runs dry into broken
dabs and stray bristle fibres. Every variant uses its own seed, tilt, start
angle and overshoot, so two circles never look alike.

Writes assets/images/marker/paint-circle-<name>.svg (black) and
paint-circle-pink-<name>.svg. The viewBox is 4:1,
close to the shape of a circled word, so stretching barely distorts it.
Also writes paint-magnifier.svg, paint-close-pink.svg (the search field's
clear button), and paint-frame.svg with paint-frame-mask.svg (a sketched box
for panels and the matching fill that masks a panel to it, both used as
9-slice images) with the same brush, and paint-block.svg (a solid black block
laid in flat-brush strokes, the background of the /search Filter button).
"""
import math, os, random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../assets/images/marker")
W, H = 240, 60

VARIANTS = {
    # name: seed, tilt (deg), start angle (rad), overshoot (rad; negative
    # leaves the loop open by that much), max width
    "a": dict(seed=11, tilt=-2.5, start=2.5, overshoot=-0.45, width=6.2),
    "b": dict(seed=29, tilt=3.0, start=-0.4, overshoot=-0.6, width=5.4),
}

# Each loop is drawn in black (for <Mark>) and in pink (the current language).
COLORS = {"": "#000", "pink-": "#E5199A"}


def wobble(rng, n=3, amp=1.0):
    """Sum of a few low-frequency sines: a slow, uneven hand tremor."""
    waves = [(rng.uniform(1, 4), rng.uniform(0, 2 * math.pi), rng.uniform(0.3, 1) * amp) for _ in range(n)]
    return lambda t: sum(a * math.sin(f * t + p) for f, p, a in waves)


def brush(rng, centre, widths, width, color, jag=0.6, dry=0.86, worn=True):
    """Outline a brush stroke along `centre` with the given `widths`: a solid
    body with ragged edges, a dry tail broken into dabs after `dry` of the
    length, and stray bristle fibres off the end. worn=False draws the whole
    stroke solid, with no dry tail or fibres. Returns (fill paths, fibre
    elements)."""
    steps = len(centre) - 1

    def side(sign, lo, hi):
        pts = []
        for i in range(lo, hi):
            (x0, y0), (x1, y1) = centre[max(0, i - 1)], centre[min(steps, i + 1)]
            nx, ny = -(y1 - y0), x1 - x0
            n = math.hypot(nx, ny) or 1
            half = widths[i] / 2 + rng.uniform(-jag, jag)  # ragged bristle edge
            pts.append((centre[i][0] + sign * nx / n * half, centre[i][1] + sign * ny / n * half))
        return pts

    def poly(lo, hi):
        pts = side(1, lo, hi) + side(-1, lo, hi)[::-1]
        return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"

    if not worn:
        return [poly(0, steps + 1)], []

    # Solid body, then the dry tail broken into a few dabs with gaps.
    body_end = int(steps * dry)
    paths = [poly(0, body_end)]
    i = body_end + 2
    while i < steps - 3:
        n = rng.randint(3, 7)
        paths.append(poly(i, min(steps, i + n)))
        i += n + rng.randint(1, 3)

    # Stray fibres trailing off the end, offset across the stroke width.
    fibres = []
    for k in range(rng.randint(3, 5)):
        off = rng.uniform(-0.45, 0.45) * width
        lo, hi = int(steps * rng.uniform(dry - 0.06, dry + 0.02)), steps
        pts = []
        for j in range(lo, hi, 4):
            (x0, y0), (x1, y1) = centre[max(0, j - 1)], centre[min(steps, j + 1)]
            nx, ny = -(y1 - y0), x1 - x0
            n = math.hypot(nx, ny) or 1
            pts.append((centre[j][0] + nx / n * off, centre[j][1] + ny / n * off))
        fibres.append(
            f'<path d="M{" L".join(f"{x:.1f} {y:.1f}" for x, y in pts)}" fill="none" stroke="{color}" '
            f'stroke-width="{rng.uniform(0.35, 0.8):.2f}" stroke-linecap="round" opacity="{rng.uniform(0.6, 0.9):.2f}"/>'
        )
    return paths, fibres


def loop(seed, tilt, start, overshoot, width, color="#000"):
    rng = random.Random(seed)
    cx, cy, rx, ry = W / 2, H / 2, W / 2 - 9, H / 2 - 7
    rx_w, ry_w, w_w = wobble(rng, n=4, amp=4.2), wobble(rng, n=4, amp=2.3), wobble(rng, amp=1.3)
    ct, st = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    span = 2 * math.pi + overshoot
    steps = 220
    centre, widths = [], []
    for i in range(steps + 1):
        u = i / steps
        t = start + span * u
        drift = 1 + 0.06 * u  # the hand spirals out a little, so the ends don't meet
        x = (rx + rx_w(t)) * drift * math.cos(t)
        y = (ry + ry_w(t)) * drift * math.sin(t)
        centre.append((cx + x * ct - y * st, cy + x * st + y * ct))
        # Pressure: lands thin, loads up, fades as the brush runs dry.
        press = min(1, u / 0.08) * (1 - max(0, (u - 0.78) / 0.22) ** 1.6)
        widths.append(max(0.25, width * (0.55 + 0.45 * press) + w_w(t) * press))

    paths, fibres = brush(rng, centre, widths, width, color)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none">'
            f'<path fill="{color}" d="{" ".join(paths)}"/>{"".join(fibres)}</svg>\n')


def magnifier(seed=5, width=6.0, color="#000"):
    """A magnifying glass written in two strokes on a 48 × 48 square: a lens
    loop that overshoots where it closes, then a handle pulled down and out.
    Width matches the search underline at icon size."""
    rng = random.Random(seed)
    cx, cy, r = 19.5, 19.5, 12.5
    r_w, w_w = wobble(rng, n=3, amp=0.9), wobble(rng, amp=0.5)
    steps, start, span = 140, -2.4, 2 * math.pi + 0.35
    lens, lens_w = [], []
    for i in range(steps + 1):
        u = i / steps
        t = start + span * u
        rr = (r + r_w(t)) * (1 + 0.04 * u)
        lens.append((cx + rr * math.cos(t), cy + rr * math.sin(t)))
        press = min(1, u / 0.06) * (1 - max(0, (u - 0.85) / 0.15) ** 1.4)
        lens_w.append(max(0.4, width * (0.6 + 0.4 * press) + w_w(t) * press))
    steps = 40
    handle, handle_w = [], []
    for i in range(steps + 1):
        u = i / steps
        bow = 1.2 * math.sin(math.pi * u)  # a slight curve, as a wrist pulls it
        handle.append((29 + 14 * u + bow, 29.5 + 13.5 * u - bow))
        handle_w.append(max(0.4, width * 1.15 * (1 - max(0, (u - 0.7) / 0.3) ** 1.3)))
    lp, lf = brush(rng, lens, lens_w, width, color, jag=0.3, dry=0.9)
    hp, hf = brush(rng, handle, handle_w, width, color, jag=0.3, dry=0.82)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
            f'<path fill="{color}" d="{" ".join(lp + hp)}"/>{"".join(lf + hf)}</svg>\n')


def close(seed=13, width=6.0, color="#E5199A"):
    """A clear (×) mark written in two crossing strokes on a 48 × 48 square,
    each slightly bowed and running dry at the end."""
    rng = random.Random(seed)
    strokes = [((10, 11), (38, 37), 1.6), ((37, 10), (11, 38), -1.4)]
    paths, fibres = [], []
    for (x0, y0), (x1, y1), bow in strokes:
        steps = 44
        centre, widths = [], []
        for i in range(steps + 1):
            u = i / steps
            b = bow * math.sin(math.pi * u)
            centre.append((x0 + (x1 - x0) * u + b, y0 + (y1 - y0) * u - b))
            press = min(1, u / 0.1) * (1 - max(0, (u - 0.72) / 0.28) ** 1.3)
            widths.append(max(0.4, width * (0.65 + 0.35 * press)))
        p, f = brush(rng, centre, widths, width, color, jag=0.3, dry=0.84)
        paths += p
        fibres += f
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
            f'<path fill="{color}" d="{" ".join(paths)}"/>{"".join(fibres)}</svg>\n')


def frame(seed=21, width=13.0, color="#000"):
    """A box drawn in marker on a 120 × 120 square, for use as a 9-slice
    border image (slice 24). Lightly worn rather than tattered: each side is
    one solid stroke with a gentle tremor, a slight swell in weight, a touch
    of skew and a small, uneven overshoot at the corners. Lines sit 14 units
    in, so the stroke stays inside the 24-unit corner slices.

    Returns (frame svg, mask svg). The mask is the same strokes plus the
    paper inside them, so masking a panel with it keeps the whole stroke and
    stops the paper at the line."""
    rng = random.Random(seed)
    d = 14
    o = lambda: rng.uniform(1.5, 4.5)   # corner overshoot
    k = lambda: rng.uniform(-0.6, 0.6)  # skew
    sides = [
        (d - o(), d + k(), 120 - d + o(), d + k()),              # top, left to right
        (120 - d + k(), d - o(), 120 - d + k(), 120 - d + o()),  # right, top to bottom
        (120 - d + o(), 120 - d + k(), d - o(), 120 - d + k()),  # bottom, right to left
        (d + k(), 120 - d + o(), d + k(), d - o()),              # left, bottom to top
    ]
    paths, fibres = [], []
    for x0, y0, x1, y1 in sides:
        steps = 60
        dx, dy = x1 - x0, y1 - y0
        n = math.hypot(dx, dy)
        nx, ny = -dy / n, dx / n
        tremor = wobble(rng, n=3, amp=0.55)
        bow = rng.uniform(-0.6, 0.6)
        w_w = wobble(rng, n=2, amp=width * 0.07)
        centre, widths = [], []
        for i in range(steps + 1):
            u = i / steps
            off = bow * math.sin(math.pi * u) + tremor(u * 2 * math.pi)
            centre.append((x0 + dx * u + nx * off, y0 + dy * u + ny * off))
            ends = min(1, u / 0.05, (1 - u) / 0.05)  # rounded-off ends, no taper to dry
            widths.append(max(0.5, width * (0.8 + 0.2 * ends) + w_w(u * 2 * math.pi)))
        p, f = brush(rng, centre, widths, width, color, jag=0.22, worn=False)
        paths += p
        fibres += f
    # Explicit size: 9-slice numbers are in image pixels, so the SVG must have
    # intrinsic dimensions or the browser scales it to the whole box.
    head = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">'
    drawn = f'{head}<path fill="{color}" d="{" ".join(paths)}"/>{"".join(fibres)}</svg>\n'
    inside = f"M{d} {d} L{120 - d} {d} L{120 - d} {120 - d} L{d} {120 - d} Z"
    # Separate paths: overlapping shapes in one path can cancel out under the
    # nonzero rule where their windings differ; separate elements always add.
    mask = (f'{head}<path fill="#000" d="{inside}"/><path fill="#000" d="{" ".join(paths)}"/>'
            f'{"".join(fibres)}</svg>\n')
    return drawn, mask


def block(seed=41, w=200, h=60, color="#000"):
    """A blocky patch of black laid in with a flat brush: overlapping
    horizontal strokes, each a little off true in length and height, so the
    edges are ragged and the corners are square but not exact. Stretches to
    any button; the inset keeps the rough edge inside the viewBox."""
    rng = random.Random(seed)
    rows = 5
    band = (h - 8) / rows
    parts = []
    for r in range(rows):
        y = 4 + band * (r + 0.5) + rng.uniform(-0.8, 0.8)
        x0 = 4 + rng.uniform(0, 3.5)
        x1 = w - 4 - rng.uniform(0, 3.5)
        n = 30
        wob = wobble(rng, n=2, amp=0.9)
        centre = [(x0 + (x1 - x0) * i / n, y + wob(i / n * 6)) for i in range(n + 1)]
        widths = [band * 1.35 + rng.uniform(-0.6, 0.6) for _ in centre]
        paths, _ = brush(rng, centre, widths, band * 1.35, color, jag=1.1, worn=False)
        parts += paths
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="none">'
            f'<path fill="{color}" d="{" ".join(parts)}"/></svg>\n')


if __name__ == "__main__":
    # Importable: annotations.py reuses brush() and wobble().
    for prefix, color in COLORS.items():
        for name, params in VARIANTS.items():
            path = os.path.join(OUT, f"paint-circle-{prefix}{name}.svg")
            open(path, "w").write(loop(**params, color=color))
            print(os.path.normpath(path))

    path = os.path.join(OUT, "paint-magnifier.svg")
    open(path, "w").write(magnifier())
    print(os.path.normpath(path))

    path = os.path.join(OUT, "paint-close-pink.svg")
    open(path, "w").write(close())
    print(os.path.normpath(path))

    drawn, mask = frame()
    for name, svg in (("paint-frame.svg", drawn), ("paint-frame-mask.svg", mask)):
        path = os.path.join(OUT, name)
        open(path, "w").write(svg)
        print(os.path.normpath(path))

    path = os.path.join(OUT, "paint-block.svg")
    open(path, "w").write(block())
    print(os.path.normpath(path))
