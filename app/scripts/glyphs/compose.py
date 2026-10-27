"""Build letters Chiari never wrote in the source (J, K, W, Y) from his traced
strokes: compose.py [--out glyphs]

Each recipe places transformed copies of traced glyphs. Overlapping outlines
merge under nonzero fill, so strokes join like a single pen. Results are
marked "constructed": true with their recipe, and overwrite only J/K/W/Y.
"""
import argparse, json, math, os, re
here = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument("--out", default=os.path.join(here, "glyphs")); a = ap.parse_args()
G = {c: json.load(open(os.path.join(a.out, f"{c}.json"))) for c in "IUV"}

def points(d):
    return [(float(x), float(y)) for x, y in re.findall(r"(-?[\d.]+) (-?[\d.]+)", d)]

def transform(d, sx=1, sy=1, rot=0, tx=0, ty=0):
    """Scale about the origin (left of baseline), rotate (degrees), translate."""
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    def f(m):
        x, y = float(m.group(1)) * sx, float(m.group(2)) * sy
        return f"{x * c - y * s + tx:.1f} {x * s + y * c + ty:.1f}"
    return re.sub(r"(-?[\d.]+) (-?[\d.]+)", f, d)

def extent(d):
    p = points(d); xs = [x for x, _ in p]; ys = [y for _, y in p]
    return min(xs), max(xs), min(ys), max(ys)

V, I, U = G["V"], G["I"], G["U"]
v_pts = points(V["d"])
v_point = sum(x for x, y in v_pts if y > -10) / max(1, sum(1 for _, y in v_pts if y > -10))  # V's vertex x
i_mid = I["advance"] / 2
u_pts = points(U["d"])
u_right = sum(x for x, y in u_pts if y < -55 and x > U["advance"] / 2) / max(1, sum(1 for x, y in u_pts if y < -55 and x > U["advance"] / 2))

out = {}
# W: two V's, the second overlapping the first's right arm.
w2 = V["advance"] * 0.58
out["W"] = ([transform(V["d"]), transform(V["d"], tx=w2)], w2 + V["advance"],
            "V + V offset 0.58 × V")
# Y: V in the top 55%, standing on an I stem under its vertex.
vy = 0.55
y_parts = [transform(V["d"], sy=vy, ty=-(1 - vy) * 100),
           transform(I["d"], sy=0.5, tx=v_point - i_mid)]
out["Y"] = (y_parts, V["advance"], "V (top 55%) + I stem (lower 50%) under V's vertex")
# K: I stem with a V turned 90° (vertex left, opening right) for the arms.
k_arm = transform(V["d"], rot=90)
x0, x1, y0, y1 = extent(k_arm)
arm_h = 100 / (y1 - y0)
k_arm = transform(V["d"], sx=1, sy=1, rot=90)
k_arm = transform(k_arm, sx=0.85, sy=arm_h)
x0, x1, y0, y1 = extent(k_arm)
k_arm = transform(k_arm, tx=i_mid - x0 + 2, ty=-100 - y0)
out["K"] = ([transform(I["d"]), k_arm], i_mid + 2 + (x1 - x0), "I stem + V rotated 90° as arms")
# J: I stem whose foot is a small U, so the U's left arm becomes the hook.
js = 0.42
j_u = transform(U["d"], sx=js, sy=js)
j_tx = i_mid + 1 - u_right * js
j_parts = [transform(j_u, tx=max(0, j_tx)), transform(I["d"], tx=max(0, -j_tx))]
out["J"] = (j_parts, max(U["advance"] * js, i_mid * 2) + abs(min(0, j_tx)), "I stem + U at 42% as the foot")

for ch, (parts, adv, recipe) in out.items():
    rec = {"char": ch, "id": ch, "d": " ".join(parts), "advance": round(adv, 1), "descent": 0,
           "constructed": True, "recipe": recipe, "source": "composed from traced " + ", ".join(sorted("IUV"))}
    json.dump(rec, open(os.path.join(a.out, f"{ch}.json"), "w"), indent=1)
    print(ch, rec["advance"], recipe)
