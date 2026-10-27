"""Rebuild every glyph listed in sources.json: build.py pages_dir [--only A,B]

sources.json maps an id (a letter, or a variant like "E.2") to
{"page": "p-056.png", "box": [x0, y0, x1, y1], "clip": bool, "baseline": px}.
All glyphs are traced at the same --weight so they set together.
"""
import argparse, json, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("pages"); ap.add_argument("--only", default="")
ap.add_argument("--weight", default="0.15")
a = ap.parse_args()
src = json.load(open(os.path.join(here, "sources.json")))
only = set(filter(None, a.only.split(",")))
for gid, s in src.items():
    if gid.startswith("_") or (only and gid not in only): continue
    cmd = [sys.executable, "-I", os.path.join(here, "glyph.py"), os.path.join(a.pages, s["page"]),
           *map(str, s["box"]), "--char", gid.split(".")[0], "--id", gid,
           "--weight", a.weight, "--out", os.path.join(here, "glyphs")]
    if s.get("clip"): cmd.append("--clip")
    if s.get("baseline") is not None: cmd += ["--baseline", str(s["baseline"])]
    subprocess.run(cmd, check=True)
