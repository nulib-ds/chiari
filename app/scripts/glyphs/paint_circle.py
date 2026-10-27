"""Draw hand-made paint-marker loops for circling words: paint_circle.py

Each loop is a filled brush stroke rather than an outline: the centreline
wobbles around an ellipse and stops short of its start, leaving the circle
open, as a quick hand does. The width swells and
thins with pressure, edges are ragged, and the tail runs dry into broken
dabs and stray bristle fibres. Every variant uses its own seed, tilt, start
angle and overshoot, so two circles never look alike.

Writes assets/images/marker/paint-circle-<name>.svg. The viewBox is 4:1,
close to the shape of a circled word, so stretching barely distorts it.
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


def wobble(rng, n=3, amp=1.0):
    """Sum of a few low-frequency sines: a slow, uneven hand tremor."""
    waves = [(rng.uniform(1, 4), rng.uniform(0, 2 * math.pi), rng.uniform(0.3, 1) * amp) for _ in range(n)]
    return lambda t: sum(a * math.sin(f * t + p) for f, p, a in waves)


def loop(seed, tilt, start, overshoot, width):
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

    def side(sign, lo, hi):
        pts = []
        for i in range(lo, hi):
            (x0, y0), (x1, y1) = centre[max(0, i - 1)], centre[min(steps, i + 1)]
            nx, ny = -(y1 - y0), x1 - x0
            n = math.hypot(nx, ny) or 1
            jag = rng.uniform(-0.6, 0.6)  # ragged bristle edge
            half = widths[i] / 2 + jag
            pts.append((centre[i][0] + sign * nx / n * half, centre[i][1] + sign * ny / n * half))
        return pts

    def poly(lo, hi):
        pts = side(1, lo, hi) + side(-1, lo, hi)[::-1]
        return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"

    # Solid body, then the dry tail broken into a few dabs with gaps.
    body_end = int(steps * 0.86)
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
        lo, hi = int(steps * rng.uniform(0.8, 0.88)), steps
        pts = []
        for j in range(lo, hi, 4):
            (x0, y0), (x1, y1) = centre[max(0, j - 1)], centre[min(steps, j + 1)]
            nx, ny = -(y1 - y0), x1 - x0
            n = math.hypot(nx, ny) or 1
            pts.append((centre[j][0] + nx / n * off, centre[j][1] + ny / n * off))
        fibres.append(
            f'<path d="M{" L".join(f"{x:.1f} {y:.1f}" for x, y in pts)}" fill="none" stroke="#000" '
            f'stroke-width="{rng.uniform(0.35, 0.8):.2f}" stroke-linecap="round" opacity="{rng.uniform(0.6, 0.9):.2f}"/>'
        )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="none">'
            f'<path fill="#000" d="{" ".join(paths)}"/>{"".join(fibres)}</svg>\n')


for name, params in VARIANTS.items():
    path = os.path.join(OUT, f"paint-circle-{name}.svg")
    open(path, "w").write(loop(**params))
    print(os.path.normpath(path))
