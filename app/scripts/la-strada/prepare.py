#!/usr/bin/env python3
"""Prepare the La Strada exhibit from a photograph of the typescript.

Writes, into assets/la-strada/:

  score.jpg         the sheet, cropped and scaled to the canvas size
  score-ground.webp the same sheet with every "action" erased, so slips cut
                    from score.jpg can fall off it without leaving a copy behind,
                    and cut out of its background, so it lies on the page as paper
  score-ink.png     only the actions' type, on transparency: what a slip is once
                    it has left the paper
  manifest.json     IIIF Presentation 3 manifest: one canvas per image, and an
                    annotation per phrase (text, sound, and where and when it is:
                    a region of the sheet, and a time on the piece's clock)

The caption's facts (creator, date, the item's page, the holder and any rights
statement) come from phrases.json's `credit` and are written as the manifest's
own metadata, homepage, provider and rights.

The typewriter's grid is measured from the typing itself (its character width,
its line height and its tilt in the photograph) and carried on the canvas as a
service, so the exhibit can snap to it. Chiari's indents are reported but only
snapped to if phrases.json names a `grid.tab`.

The sheet is the clock. The piece lasts `duration` seconds (the score's 30'), the
top of the typed area is 0 and the bottom is the end, so a phrase's place on the
sheet is its time, and each annotation's target says both: xywh=...&t=start,end.
Its end is the length of its recordings end to end, or its seconds of silence,
or a few seconds if it is only announced.

phrases.json is the source of truth. Each phrase has a rough `box` in the
cropped photo's pixels. It only has to enclose the phrase and keep clear of its
neighbours: the script finds the ink inside it and fits the region to that, so
a new scan needs new boxes but not hand-measured ones.

    python prepare.py PHOTO [--out assets/la-strada]

Needs pillow, numpy and scipy (the glyphs virtualenv has them).
"""
import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

PAD = 14          # paper kept around the ink, in cropped-photo pixels
INK = 0.85        # a pixel darker than this fraction of its paper is ink
GRAIN = 0.9       # erased paper gets noise to match the surrounding grain
ANNOUNCED = 4.0   # seconds given to an action that is only said, not recorded
TYPE = (28, 28, 31)  # the colour of typed ink, once it is off the paper
SCALES = (4, 8, 16, 32)  # how far, in pixels, paper is borrowed from to fill ink
CREASE_WINDOW = 50  # context, in pixels, in which a crease shows itself as one
REACH = 420       # how far in from the crop's edge to look for the sheet's edge
STEEP = 1.2       # brightness change per pixel that marks the sheet's edge


def paper_ratio(rgb):
    """Brightness divided by the paper's own, so shading and creases flatten."""
    gray = np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.float32)
    h, w = gray.shape
    b = 8
    blocks = gray[: h // b * b, : w // b * b].reshape(h // b, b, w // b, b).mean((1, 3))
    # Type is sparse, so a high percentile of the neighbourhood is bare paper.
    paper = ndi.gaussian_filter(ndi.percentile_filter(blocks, 75, size=9), 1.5)
    paper = np.asarray(Image.fromarray(paper.astype(np.float32), "F").resize((w, h), Image.BILINEAR))
    return gray / np.maximum(paper, 1)


def look(ratio, item):
    """Ink and creases inside an item's box (both box-shaped masks)."""
    x0, y0, x1, y1 = item["box"]
    # A crease spans the whole of a window taller and wider than the box; type
    # never does, even where a letter nearly fills a one-line box.
    wy0, wx0 = max(y0 - CREASE_WINDOW, 0), max(x0 - CREASE_WINDOW, 0)
    window = ratio[wy0 : y1 + CREASE_WINDOW, wx0 : x1 + CREASE_WINDOW] < INK
    columns = ndi.binary_dilation(window.mean(axis=0) > 0.85, iterations=2)[x0 - wx0 : x1 - wx0]
    rows = ndi.binary_dilation(window.mean(axis=1) > 0.85, iterations=2)[y0 - wy0 : y1 - wy0]
    crease = np.zeros((y1 - y0, x1 - x0), bool)
    crease[:, columns] = True
    crease[rows, :] = True
    ink = ratio[y0:y1, x0:x1] < item.get("threshold", INK)
    ink = ndi.binary_opening(ink & ~crease, structure=np.ones((2, 2)))
    return ink, crease


def fit(ratio, item):
    """The ink's rectangle with a margin of paper, kept inside the item's box
    so that neighbouring lines never share a slip."""
    x0, y0, x1, y1 = item["box"]
    ys, xs = np.where(look(ratio, item)[0])
    if not len(xs):
        raise SystemExit(f"No ink found for {item['id']}; check its box.")
    return [
        max(x0, x0 + xs.min() - PAD),
        max(y0, y0 + ys.min() - PAD),
        min(x1, x0 + xs.max() + PAD + 1),
        min(y1, y0 + ys.max() + PAD + 1),
    ]


def erase(rgb, ratio, items):
    """Paint paper over each item's ink, from the paper around it."""
    out = rgb.astype(np.float32)
    rng = np.random.default_rng(1964)
    for item in items:
        x0, y0, x1, y1 = item["box"]
        sl = (slice(y0, y1), slice(x0, x1))
        ink, crease = look(ratio, item)
        mask = ndi.binary_dilation(ink, iterations=3)
        keep = (~mask & ~crease).astype(np.float32)
        window = out[sl]
        for c in range(3):
            # Borrow paper from as near as there is enough of it.
            fill = np.full(mask.shape, np.nan, np.float32)
            for scale in SCALES:
                weight = ndi.gaussian_filter(keep, scale)
                smooth = ndi.gaussian_filter(window[..., c] * keep, scale) / np.maximum(weight, 1e-3)
                near = mask & np.isnan(fill) & (weight > 0.15)
                fill[near] = smooth[near]
                if scale == SCALES[0]:
                    grain = (window[..., c] - smooth)[keep > 0].std()
            fill[np.isnan(fill)] = np.median(window[..., c][keep > 0])
            window[..., c][mask] = fill[mask] + rng.normal(0, grain * GRAIN, mask.sum())
    return np.clip(out, 0, 255).astype(np.uint8)


def edge_of(profiles):
    """Where the sheet begins along each profile, which run from the outside in."""
    steps = np.abs(np.diff(profiles, axis=1))
    steps[:, :6] = 0  # the photograph's own border
    hit = steps > STEEP
    first = np.where(hit.any(1), hit.argmax(1), profiles.shape[1])
    # Take the steepest point just past the first hit, which is the edge itself.
    return np.array([f + steps[i, f : f + 14].argmax() if f < profiles.shape[1] else f for i, f in enumerate(first)])


def sheet_alpha(rgb):
    """Opacity for the sheet alone: 1 on paper (the whole stack of it that was
    photographed), 0 on the surface it lay on, soft at the edge.

    The sheet is the first thing met from each side, so this follows the paper's
    own edge, torn ledges and bent corners included. The crop has to leave some
    of the surface showing all the way round.
    """
    gray = ndi.gaussian_filter(np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.float32), 2.5)
    h, w = gray.shape
    reach = lambda a: ndi.gaussian_filter1d(ndi.median_filter(a.astype(np.float32), size=41, mode="nearest"), 6)
    left = reach(edge_of(gray[:, :REACH]))
    right = w - 1 - reach(edge_of(gray[:, ::-1][:, :REACH]))
    top = reach(edge_of(gray[:REACH, :].T))
    bottom = h - 1 - reach(edge_of(gray[::-1, :][:REACH, :].T))
    rows, cols = np.mgrid[0:h, 0:w]
    sheet = (cols >= left[:, None]) & (cols <= right[:, None]) & (rows >= top[None, :]) & (rows <= bottom[None, :])
    # Shed what the paper's own shadow leaves sticking out past its edge, then
    # draw in a little more, so no fringe of the surface comes along.
    y, x = np.ogrid[-12:13, -12:13]
    sheet = ndi.binary_opening(sheet, structure=x * x + y * y <= 144)
    return ndi.gaussian_filter(ndi.binary_erosion(sheet, iterations=3).astype(np.float32), 1.2)


def typed(ratio, items):
    """Each item's type alone, as transparency: the darker the paper was, the more opaque."""
    alpha = np.zeros(ratio.shape, np.float32)
    for item in items:
        x0, y0, x1, y1 = item["box"]
        ink, crease = look(ratio, item)
        # A little past the ink, so the soft edge of each stroke comes along.
        reach = ndi.binary_dilation(ink, iterations=2) & ~crease
        seen = np.clip((0.96 - ratio[y0:y1, x0:x1]) / (0.96 - 0.15), 0, 1)
        alpha[y0:y1, x0:x1] = np.where(reach, seen, alpha[y0:y1, x0:x1])
    return (alpha * 255).astype(np.uint8)


def measure_grid(ratio, items, scale, tab=None):
    """The typewriter's grid as it stands in the photograph, in canvas pixels.

    The typing is tilted a little in the photo, so the grid is measured along
    and across the lines: u runs along them and v across (u = x + skew*y,
    v = y - skew*x). Every phrase's first character should stand on a column
    and its first line on a row, and the pitches are those that put them there.
    """
    found = []
    for item in items:
        ink = look(ratio, item)[0]
        ys, xs = np.where(ink)
        found.append((item, xs + item["box"][0], ys + item["box"][1]))

    # Tilt: the slope of the longest single lines.
    slopes = []
    for _, xs, ys in found:
        first = ys < ys.min() + 36
        if xs[first].max() - xs[first].min() > 500:
            columns = np.unique(xs[first])
            slopes.append(np.polyfit(columns, [ys[first][xs[first] == c].mean() for c in columns], 1)[0])
    skew = float(np.median(slopes)) if slopes else 0.0

    def fit(values, low, high, step):
        """The period in [low, high] that puts the most values on a whole number of periods."""
        score = lambda p: abs(np.exp(2j * np.pi * values / p).mean())
        period = max(np.arange(low, high, step), key=score)
        phase = np.angle(np.exp(2j * np.pi * values / period).mean()) / (2 * np.pi) * period
        return period, phase, score(period)

    u = np.array([xs[ys < ys.min() + 36].min() + skew * ys[ys < ys.min() + 36][xs[ys < ys.min() + 36].argmin()] for _, xs, ys in found], float)
    v = np.array([(ys - skew * xs)[ys < ys.min() + 36].min() for _, xs, ys in found], float)
    char, u_phase, u_fit = fit(u, 19.0, 22.0, 0.005)
    # The line height is first read from the blocks of several lines, where it
    # can't be mistaken for a fraction or a multiple of itself.
    reads = []
    for item, xs, ys in found:
        if item["text"].count("\n") >= 2:
            profile = np.bincount((ys - ys.min()).astype(int)).astype(float)
            profile -= profile.mean()
            auto = np.correlate(profile, profile, "full")[len(profile) - 1:]
            low, high = int(1.6 * char), int(2.6 * char)
            if len(auto) > high:
                reads.append(low + int(np.argmax(auto[low:high])))
    near = float(np.median(reads)) if reads else 2.1 * char
    line, v_phase, v_fit = fit(v, 0.93 * near, 1.07 * near, 0.01)
    columns = np.round((u - u_phase) / char).astype(int)
    rows = np.round((v - v_phase) / line).astype(int)
    left, top = columns.min(), rows.min()

    # Does Chiari tab? Count how many of the distinct indents fall on every Nth column.
    indents = sorted(set((columns - left).tolist()))
    print(f"Grid: {char:.2f} px a character, {line:.2f} px a line, tilt {np.degrees(np.arctan(skew)):+.2f} deg; "
          f"first characters sit within {np.std((u - u_phase) / char - columns):.2f} of a column, "
          f"first lines within {np.std((v - v_phase) / line - rows):.2f} of a row")
    print(f"Indents, in columns from the left margin: {indents}")
    for every in range(2, 11):
        on = sum(c % every == 0 for c in indents)
        print(f"  every {every:2d}: {on}/{len(indents)} indents on a stop (by chance about {len(indents) / every:.0f})")

    # Slips are cut PAD outside the type, so the grid is given for a slip's corner.
    grid = {
        "characterWidth": round(char * scale, 3),
        "lineHeight": round(line * scale, 3),
        "skew": round(skew, 5),
        "originX": round((u_phase + left * char - PAD * (1 + skew)) * scale, 3),
        "originY": round((v_phase + top * line - PAD * (1 - skew)) * scale, 3),
    }
    if tab:
        grid["tab"] = tab
    return grid


def audio_length(path):
    """Seconds of sound in a file, from afinfo (macOS) or ffprobe; None if neither is installed."""
    for command in (["afinfo", str(path)], ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]):
        if shutil.which(command[0]):
            out = subprocess.run(command, capture_output=True, text=True).stdout
            found = re.search(r"estimated duration: ([\d.]+)", out) or re.match(r"\s*([\d.]+)\s*$", out)
            if found:
                return float(found.group(1))
    return None


def recordings(item, out):
    """An item's recordings as parts, played one after another, each a list of
    (path, seconds) takes to choose between. In phrases.json `audio` is a path, or
    a list of parts, each a path or a list of alternative paths."""
    audio = item.get("audio", [])
    parts = [audio] if isinstance(audio, str) else audio
    return [[(path, audio_length(out / path)) for path in ([part] if isinstance(part, str) else part)] for part in parts]


def timing(spec):
    """Each item's start and end, in seconds. The typed area runs top to bottom
    over the piece, so how far down the sheet a phrase stands is when it comes."""
    top = min(i["region"][1] for i in spec["actions"])
    bottom = max(i["region"][3] for i in spec["actions"])
    times = {}
    for item in spec["actions"]:
        start = (item["region"][1] - top) / (bottom - top) * spec["duration"]
        length = sum(max(seconds or ANNOUNCED for _, seconds in part) for part in item["sounds"]) or item.get("silent") or ANNOUNCED
        times[item["id"]] = (start, min(start + length, spec["duration"]))
    for item in spec["frame"]:
        times[item["id"]] = (0, spec["duration"])  # the instructions and title hold for the whole piece
    return times


def target(base, item, scale, when):
    """Where and when an item is on the sheet's canvas: xywh=...&t=start,end."""
    x0, y0, x1, y1 = (round(v * scale) for v in item["region"])
    start, end = when
    return f"{base}/canvas/score#xywh={x0},{y0},{x1 - x0},{y1 - y0}&t={start:.1f},{end:.1f}"


def chapter(base, item, scale, when):
    """The item as a chapter: a Range that names its place and its time, which
    Clover reads as a chapter on the canvas's timeline and a region drawn on
    the sheet. It is built from the same target as the annotation."""
    return {
        "id": f"{base}/range/{item['id']}",
        "type": "Range",
        "label": {"en": [item["text"].replace("\n", " ")]},
        "items": [{"id": target(base, item, scale, when), "type": "Canvas"}],
    }


def annotation(base, item, scale, when):
    bodies = [{"type": "TextualBody", "value": item["text"], "format": "text/plain", "language": "en"}]
    if item.get("speech"):
        bodies.append({"type": "TextualBody", "purpose": "speech", "value": item["speech"], "language": "en"})
    # A silent action is performed as that many seconds of silence.
    if item.get("silent"):
        bodies.append({"type": "TextualBody", "purpose": "silence", "value": str(item["silent"]), "format": "text/plain"})
    # Each part is a Sound, or a Choice of Sounds when there are takes to pick from.
    for part in item.get("sounds", []):
        sounds = []
        for path, seconds in part:
            sound = {"type": "Sound", "id": f"{base}/{path}", "format": item.get("format", "audio/mpeg")}
            if seconds:
                sound["duration"] = round(seconds, 2)
            sounds.append(sound)
        bodies.append(sounds[0] if len(sounds) == 1 else {"type": "Choice", "items": sounds})
    return {
        "id": f"{base}/annotation/{item['id']}",
        "type": "Annotation",
        "motivation": "supplementing",
        "body": bodies,
        "target": target(base, item, scale, when),
    }


def credit(spec):
    """What a caption needs, as IIIF: who made it, when, where its item is, who holds it, and on what terms."""
    info = spec.get("credit", {})
    site = spec["base"].rsplit("/", 1)[0]
    out = {"metadata": [
        {"label": {"en": [label]}, "value": {"en": [info[key]]}}
        for label, key in (("Creator", "creator"), ("Date", "date"), ("Material Type", "kind")) if info.get(key)
    ]}
    if info.get("item"):
        out["homepage"] = [{"id": f"{site}/{info['item']}", "type": "Text", "label": {"en": [info.get("title", spec["label"])]}, "format": "text/html"}]
    if info.get("source"):
        out["provider"] = [{"id": info.get("sourceUrl", site), "type": "Agent", "label": {"en": [info["source"]]}}]
    if info.get("rights"):
        out["rights"] = info["rights"]
    return out


def manifest(spec, grid):
    base, (w, h) = spec["base"], (spec["canvas"]["width"], spec["canvas"]["height"])
    scale = w / spec["crop"][2]
    times = timing(spec)

    def canvas(slug, label, image, format="image/jpeg", duration=None):
        return {
            "id": f"{base}/canvas/{slug}",
            "type": "Canvas",
            "label": {"en": [label]},
            "width": w,
            "height": h,
            **({"duration": duration} if duration else {}),
            "items": [{
                "id": f"{base}/page/paint/{slug}",
                "type": "AnnotationPage",
                "items": [{
                    "id": f"{base}/annotation/paint/{slug}",
                    "type": "Annotation",
                    "motivation": "painting",
                    "body": {"id": f"{base}/{image}", "type": "Image", "format": format, "width": w, "height": h},
                    "target": f"{base}/canvas/{slug}",
                }],
            }],
        }

    score = canvas("score", "La strada", "score.jpg", duration=spec["duration"])
    # The typewriter's grid, as a service of the canvas it was measured on.
    score["service"] = [{"id": f"{base}/canvas/score/grid", "type": "TypewriterGrid", **grid}]
    # The exhibit lifts "actions" off the sheet and leaves the "frame" (the
    # instructions and the title) where it is; the page ids tell them apart.
    # Each page lists its annotations in the order they come, top to bottom,
    # which is the order of time.
    score["annotations"] = [
        {"id": f"{base}/page/actions", "type": "AnnotationPage",
         "items": [annotation(base, i, scale, times[i["id"]]) for i in sorted(spec["actions"], key=lambda i: times[i["id"]])]},
        {"id": f"{base}/page/frame", "type": "AnnotationPage",
         "items": [annotation(base, i, scale, times[i["id"]]) for i in spec["frame"]]},
    ]
    return {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": f"{base}/manifest.json",
        "type": "Manifest",
        "label": {"en": [spec["label"]]},
        "summary": {"en": [spec["summary"]]},
        "requiredStatement": {"label": {"en": ["Note"]}, "value": {"en": [spec["note"]]}},
        **credit(spec),
        # The same actions as chapters, in the order of time, so a viewer lists them,
        # marks them on the timeline and draws their regions without the annotations.
        "structures": [{
            "id": f"{base}/range/score",
            "type": "Range",
            "label": {"en": [spec["label"]]},
            "items": [chapter(base, i, scale, times[i["id"]]) for i in sorted(spec["actions"], key=lambda i: times[i["id"]])],
        }],
        "items": [
            score,
            canvas("score-ground", "La strada, with its actions lifted off", "score-ground.webp", "image/webp"),
            canvas("score-ink", "La strada, the actions alone", "score-ink.png", "image/png"),
        ],
    }


def main():
    here = Path(__file__).parent
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("photo", type=Path)
    parser.add_argument("--phrases", type=Path, default=here / "phrases.json")
    parser.add_argument("--out", type=Path, default=here.parents[1].parent / "assets" / "la-strada")
    args = parser.parse_args()

    spec = json.loads(args.phrases.read_text())
    x, y, w, h = spec["crop"]
    rgb = np.asarray(Image.open(args.photo).convert("RGB").crop((x, y, x + w, y + h)))
    ratio = paper_ratio(rgb)
    for item in spec["actions"] + spec["frame"]:
        item["region"] = fit(ratio, item)
        item["sounds"] = recordings(item, args.out)
    ground = erase(rgb, ratio, spec["actions"])

    size = (spec["canvas"]["width"], spec["canvas"]["height"])
    args.out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).resize(size, Image.LANCZOS).save(args.out / "score.jpg", quality=85, optimize=True, progressive=True)
    cutout = np.dstack([ground, (sheet_alpha(rgb) * 255).astype(np.uint8)])
    Image.fromarray(cutout, "RGBA").resize(size, Image.LANCZOS).save(args.out / "score-ground.webp", quality=88, method=6)
    ink = Image.new("RGBA", size, TYPE + (0,))
    ink.putalpha(Image.fromarray(typed(ratio, spec["actions"])).resize(size, Image.LANCZOS))
    ink.save(args.out / "score-ink.png", optimize=True)
    grid = measure_grid(ratio, spec["actions"] + spec["frame"], size[0] / spec["crop"][2], spec.get("grid", {}).get("tab"))
    (args.out / "manifest.json").write_text(json.dumps(manifest(spec, grid), indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {args.out}: {len(spec['actions'])} actions, {len(spec['frame'])} frame pieces")


if __name__ == "__main__":
    main()
