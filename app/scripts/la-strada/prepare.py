#!/usr/bin/env python3
"""Prepare the La Strada exhibit from a scan of the typescript.

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

Slips are cut on the typewriter's grid. The carriage moves a whole character at
a time, so the columns are one grid across the sheet: their pitch is measured
from the typing, and each phrase says in phrases.json which columns its first
and last characters stand in. The platen was turned freely between blocks, so
lines keep to the line spacing only within a block, and each phrase's own
baseline places it. Every slip is therefore a whole number of characters wide
and of lines high, the same for every slip; the cell is centred on the type's
height, so a slip's text sits in it as every other slip's does. A slip keeps to
its own line's registration: it stands on the grid unless its type needs it
nudged a pixel or two to be held whole. Ink belongs to a phrase if it lies in
its cells, so the grit, pencil ticks and the fold around a line stay on the paper.

The canvas is scaled so that a character is `canvas.pitch` units wide, and set so
that the columns fall on whole units; the images are drawn at `images.pitch`
pixels a character, the same sheet at a size to send.

The sheet is the clock. The piece lasts `duration` seconds (the score's 30'), the
top of the typed area is 0 and the bottom is the end, so a phrase's place on the
sheet is its time, and each annotation's target says both: xywh=...&t=start,end.
Its end is the length of its recordings end to end, or its seconds of silence,
or a few seconds if it is only announced.

    python prepare.py SCAN [--out assets/la-strada]

Needs pillow, numpy and scipy (the glyphs virtualenv has them).
"""
import argparse
import io
import json
import re
import shutil
import subprocess
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None  # a scan of the whole sheet at 600 ppi is ninety megapixels

STRONG = 0.6      # darker than this fraction of its paper is the core of a stroke
INK = 0.85        # darker than this is ink, the soft edge of a stroke included
PAPER = 0.96      # lighter than this is paper
GRIT = 0.01       # a stroke smaller than this much of a character's square is grit, not type
BLOCK = 24        # pixels: blocks the paper's own brightness is estimated in
GRAIN = 6         # pixels: finer than this, paper is texture, borrowed for erased type
HALO = 10         # pixels: how far type tints the paper round it (the ribbon's ink spreading
                  # into the fibres, and the scan's coarser colour), so how far erasing reaches
SCALES = (6, 12, 24, 48)  # how far, in pixels, paper is borrowed from to fill ink
ANNOUNCED = 4.0   # seconds given to an action that is only said, not recorded


def load(path):
    """The scan as sRGB, and its colour profile to pass on."""
    image = Image.open(path)
    icc = image.info.get("icc_profile")
    rgb = image.convert("RGB")
    if icc:
        source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        if "srgb" not in ImageCms.getProfileDescription(source).lower():
            rgb = ImageCms.profileToProfile(rgb, source, ImageCms.createProfile("sRGB"), outputMode="RGB")
            icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    return np.asarray(rgb), icc


def paper_ratio(rgb):
    """Brightness divided by the paper's own, so shading and creases flatten."""
    gray = np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.float32)
    h, w = gray.shape
    b = BLOCK
    blocks = gray[: h // b * b, : w // b * b].reshape(h // b, b, w // b, b).mean((1, 3))
    # Type is sparse, so a high percentile of the neighbourhood is bare paper.
    paper = ndi.gaussian_filter(ndi.percentile_filter(blocks, 75, size=9), 1.5)
    paper = np.asarray(Image.fromarray(paper.astype(np.float32), "F").resize((w, h), Image.BILINEAR))
    return gray / np.maximum(paper, 1)


def window(ratio, item, margin):
    """The item's box with a margin, kept inside the sheet, as slices and their corner."""
    x0, y0, x1, y1 = item["box"]
    y0, x0 = max(y0 - margin, 0), max(x0 - margin, 0)
    y1, x1 = min(y1 + margin, ratio.shape[0]), min(x1 + margin, ratio.shape[1])
    return (slice(y0, y1), slice(x0, x1)), (x0, y0)


def measure_pitch(ratio, items):
    """The carriage's step: a first guess from how wide the phrases are for their
    characters, then the period that puts the most type on the same phase. Also
    that phase, where in a step a character's ink centres."""
    counts = np.zeros(ratio.shape[1])
    guesses = []
    for item in items:
        sl, (ox, _) = window(ratio, item, 0)
        core = ratio[sl] < STRONG
        cols = np.nonzero(core.any(0))[0]
        c0, c1 = item["columns"]
        if c1 > c0 + 10:
            guesses.append((cols.max() - cols.min()) / (c1 - c0 + 0.8))
        counts[ox : ox + core.shape[1]] += core.sum(0)
    x = np.arange(len(counts), dtype=float)
    z = lambda p: (counts * np.exp(2j * np.pi * x / p)).sum()
    guess = float(np.median(guesses))
    coarse = np.arange(0.96 * guess, 1.04 * guess, 0.01)
    best = coarse[np.argmax([abs(z(p)) for p in coarse])]
    fine = np.arange(best - 0.02, best + 0.02, 0.0005)
    pitch = float(fine[np.argmax([abs(z(p)) for p in fine])])
    return pitch, float(np.angle(z(pitch)) / (2 * np.pi) * pitch % pitch)


def drops(ratio, item, left, pitch):
    """How sharply the item's type stops, row by row: strongest at a baseline,
    where every letter but a descender ends. Within its own columns only."""
    sl, (ox, oy) = window(ratio, item, 0)
    c0, c1 = item["columns"]
    a = int(max(left + c0 * pitch - ox, 0))
    b = int(min(left + (c1 + 1) * pitch - ox, sl[1].stop - sl[1].start))
    soft = np.clip((PAPER - ratio[sl][:, a:b]) / (PAPER - STRONG), 0, 1).sum(1)
    return -np.gradient(ndi.gaussian_filter1d(soft, 1.2)), oy


def baselines(ratio, items, left, pitch):
    """Line spacing, and each item's first baseline. The spacing is the one that
    lines up the most baselines in the items of several lines; an item's first
    baseline is where its lines, that far apart, drop most sharply together."""
    profiles = {item["id"]: drops(ratio, item, left, pitch) for item in items}

    def fit(drop, lines, spacing):
        rows = np.arange(len(drop) - int((lines - 1) * spacing) - 1)
        if len(rows) < 3:
            return 0.0, -np.inf  # so many lines that far apart do not fit in the box
        score = sum(np.interp(rows + i * spacing, np.arange(len(drop)), drop) for i in range(lines))
        k = int(np.argmax(score))
        # Sub-pixel: the peak of a parabola through the best row and its neighbours.
        if 0 < k < len(score) - 1:
            a, b, c = score[k - 1], score[k], score[k + 1]
            k = k + (0.5 * (a - c) / (a - 2 * b + c) if a - 2 * b + c else 0)
        return k, score.max()

    several = [i for i in items if i.get("lines", 1) > 1]
    total = lambda s: sum(fit(profiles[i["id"]][0], i["lines"], s)[1] for i in several)
    coarse = np.arange(1.5 * pitch, 2.6 * pitch, 0.25)
    best = coarse[np.argmax([total(s) for s in coarse])]
    fine = np.arange(best - 0.5, best + 0.5, 0.02)
    spacing = float(fine[np.argmax([total(s) for s in fine])])
    for item in items:
        drop, oy = profiles[item["id"]]
        item["baseline"] = oy + fit(drop, item.get("lines", 1), spacing)[0]
    return spacing


def own_ink(ratio, item, left, pitch, spacing):
    """The item's type: the strokes whose middle lies in its columns and on one of
    its lines, which none of grit, the specks along a fold, a pencil tick beside a
    phrase or a neighbour's descender is. As a mask over the item's window, and its
    corner, and each stroke's top and bottom against the baseline of its line."""
    sl, (ox, oy) = window(ratio, item, int(spacing))
    ink = ndi.binary_opening(ratio[sl] < INK, structure=np.ones((2, 2)))
    labels, n = ndi.label(ink, structure=np.ones((3, 3)))
    if not n:
        return np.zeros_like(ink), (ox, oy), np.zeros((0, 2))
    index = np.arange(1, n + 1)
    cy, cx = (np.array(v) for v in zip(*ndi.center_of_mass(ink, labels, index)))
    darkest = ndi.minimum(ratio[sl], labels, index)
    area = ndi.sum(ink, labels, index)
    boxes = ndi.find_objects(labels)
    tops = np.array([b[0].start for b in boxes]) + oy
    bottoms = np.array([b[0].stop - 1 for b in boxes]) + oy
    c0, c1 = item["columns"]
    lines = item["baseline"] + spacing * np.arange(item.get("lines", 1))
    gap = np.abs((cy + oy)[:, None] - (lines[None, :] - 0.3 * spacing)).min(1)
    nearest = lines[np.abs((cy + oy)[:, None] - lines[None, :]).argmin(1)]
    ours = (cx + ox >= left + c0 * pitch) & (cx + ox < left + (c1 + 1) * pitch) & (gap < 0.55 * spacing)
    keep = (
        ours
        & (tops < nearest + 0.05 * spacing)  # nothing typed starts below its baseline
        & (darkest < 0.75)                     # type has a dark core; paper grain does not
        & (area >= GRIT * pitch * pitch)       # and is more than a speck
    )
    reach = np.column_stack([tops[keep] - nearest[keep], bottoms[keep] - nearest[keep]])
    # A letter struck unevenly breaks up: the pieces of it close by are its own, and so
    # is a faint tail below the baseline under it, however far the firm part ends above.
    # A piece of a mark that runs on past the line, like a scribble under it, is not.
    typed = np.isin(labels, index[keep])
    near = ndi.minimum(ndi.distance_transform_edt(~typed), labels, index)
    below = ((cy + oy) >= nearest) & ((cy + oy) <= nearest + 0.3 * spacing)
    marks, _ = ndi.label(ndi.binary_dilation(ink & ~typed, iterations=4))
    reaches = {i: s for i, s in enumerate(ndi.find_objects(marks), 1)}
    mark = ndi.maximum(marks, labels, index).astype(int)
    within = np.array([
        reaches[m][0].start + oy >= n - 0.85 * spacing and reaches[m][0].stop + oy <= n + 0.3 * spacing if m else True
        for m, n in zip(mark, nearest)
    ])
    pieces = ours & ~keep & within & ((near <= 0.2 * pitch) | (below & (near <= 0.45 * pitch)))
    return typed | np.isin(labels, index[pieces]), (ox, oy), reach


def place(ratio, items, left, pitch, spacing, actions):
    """Each item's cell on the grid, in scan pixels: [x, y, w, h]. A cell's top
    stands the same height above its first baseline for every item: centred on
    the type's height, between where its tall letters reach and where its
    descenders end. Across, the cell stands on the grid's columns unless the
    item's own type needs it moved a little to be held whole."""
    found = {}
    reach = []
    for item in items:
        mask, corner, strokes = own_ink(ratio, item, left, pitch, spacing)
        found[item["id"]] = (mask, corner)
        if item in actions:
            reach.append(strokes)
    reach = np.concatenate(reach)
    low, high = np.quantile(reach[:, 0], 0.01), np.quantile(reach[:, 1], 0.99)
    rise = (low + high) / 2 - spacing / 2  # from a baseline to the top of its cell
    for item in items:
        mask, (ox, oy) = found[item["id"]]
        c0, c1 = item["columns"]
        w, h = (c1 - c0 + 1) * pitch, item.get("lines", 1) * spacing
        x, y = left + c0 * pitch, item["baseline"] + rise
        # The strokes typed in these lines: those that reach into the cell's rows.
        labels, n = ndi.label(mask, structure=np.ones((3, 3)))
        rows = [i + 1 for i, s in enumerate(ndi.find_objects(labels)) if s[0].start + oy < y + h and s[0].stop + oy > y]
        ys, xs = np.nonzero(np.isin(labels, rows))
        xs, ys = xs + ox, ys + oy
        first, last = xs.max() + 1 - w, xs.min()
        # The position nearest the grid's that holds the type; centred on it if none does.
        held = min(max(x, first), last) if first <= last else (first + last) / 2
        item["cell"] = [held, y, w, h]
        item["nudge"] = held - x
        item["spill"] = int(((xs < held) | (xs >= held + w) | (ys < y) | (ys >= y + h)).sum())
        item["ink"] = (mask, (ox, oy))
    return rise, (low, high)


def inside(item, shape, corner):
    """Which pixels of a window at `corner` lie in the item's cell."""
    x, y, w, h = item["cell"]
    rows = np.arange(shape[0])[:, None] + corner[1] + 0.5
    cols = np.arange(shape[1])[None, :] + corner[0] + 0.5
    return (rows >= y) & (rows < y + h) & (cols >= x) & (cols < x + w)


def erase(rgb, ratio, items, sheet, type_mask):
    """Paint paper over each item's ink. The colour is borrowed from the paper
    around it, as near as there is enough of it; the grain from the same paper a
    few lines away, where there is no type, so the erased strokes are not smooth."""
    out = rgb.copy()
    # Paper to borrow from is paper well clear of any stroke and of its tint: the
    # phrases' type, however faint, and anything else as wide as a stroke. Grit is
    # part of the paper's own texture and may come along; it is not wide enough to
    # hold the disc a stroke holds.
    y, x = np.ogrid[-3:4, -3:4]
    strokes = ndi.binary_opening(ratio < 0.8, structure=x * x + y * y <= 9) | type_mask
    dark = ndi.binary_dilation(strokes, iterations=HALO + 2) | ~sheet
    rng = np.random.default_rng(1964)
    for item in items:
        ink, (ox, oy) = item["ink"]
        cell = inside(item, ink.shape, (ox, oy))
        mask = ndi.binary_dilation(ink, iterations=HALO) & cell
        # Fully paper over the strokes, and fade into the paper as the tint does.
        blend = np.maximum(ndi.gaussian_filter(mask.astype(np.float32), 2), ndi.binary_dilation(ink, iterations=3)) * cell
        sl = (slice(oy, oy + mask.shape[0]), slice(ox, ox + mask.shape[1]))
        keep = (~dark[sl]).astype(np.float32)
        region = out[sl].astype(np.float32)
        # A donor: the same window moved by whole lines or a few characters, with
        # no type under the mask nor near enough to it to show in its grain.
        ys, xs = np.nonzero(ndi.binary_dilation(mask, iterations=2 * GRAIN))
        donor = None
        line, char = item["cell"][3] / item.get("lines", 1), item["cell"][2] / (item["columns"][1] - item["columns"][0] + 1)
        steps = ((round(dy * line), round(dx * char)) for dy in range(-6, 7) for dx in (0, -8, 8, -16, 16) if dy or dx)
        for dy, dx in sorted(steps, key=lambda d: abs(d[0]) + abs(d[1])):
            y, x = ys + oy + dy, xs + ox + dx
            if y.min() < 0 or x.min() < 0 or y.max() >= rgb.shape[0] or x.max() >= rgb.shape[1] or dark[y, x].any():
                continue
            donor = (dy, dx)
            break
        item["donor"] = donor
        for c in range(3):
            # Borrow paper from as near as there is enough of it.
            fill = np.full(mask.shape, np.nan, np.float32)
            for scale in SCALES:
                weight = ndi.gaussian_filter(keep, scale)
                smooth = ndi.gaussian_filter(region[..., c] * keep, scale) / np.maximum(weight, 1e-3)
                near = mask & np.isnan(fill) & (weight > 0.15)
                fill[near] = smooth[near]
            fill[np.isnan(fill)] = np.median(region[..., c][keep > 0])
            if donor:
                dy, dx = donor
                patch = rgb[oy + dy : oy + dy + mask.shape[0], ox + dx : ox + dx + mask.shape[1], c].astype(np.float32)
                texture = patch - ndi.gaussian_filter(patch, GRAIN)
            else:
                plain = region[..., c] - ndi.gaussian_filter(region[..., c], GRAIN)
                texture = rng.normal(0, plain[keep > 0].std(), mask.shape)
            paper = np.where(mask, fill + texture, region[..., c])
            region[..., c] = region[..., c] * (1 - blend) + paper * blend
        out[sl] = np.clip(region, 0, 255).astype(np.uint8)
    return out


def typed(ratio, items, type_ratio):
    """Each item's type alone, as transparency: as opaque as it is dark, so that
    the type's colour laid over the paper at this opacity gives the scan back."""
    alpha = np.zeros(ratio.shape, np.float32)
    for item in items:
        mask, (ox, oy) = item["ink"]
        # A little past the ink, so the soft edge of each stroke comes along.
        reach = ndi.binary_dilation(mask, iterations=2) & inside(item, mask.shape, (ox, oy))
        sl = (slice(oy, oy + mask.shape[0]), slice(ox, ox + mask.shape[1]))
        seen = np.clip((PAPER - ratio[sl]) / (PAPER - type_ratio), 0, 1)
        alpha[sl] = np.where(reach, seen, alpha[sl])
    return alpha


def type_colour(rgb, ratio, items):
    """The colour of the type where it is darkest: its core, as the ink layer's colour."""
    pixels, ratios = [], []
    for item in items:
        mask, (ox, oy) = item["ink"]
        sl = (slice(oy, oy + mask.shape[0]), slice(ox, ox + mask.shape[1]))
        core = mask & (ratio[sl] < 0.42)
        pixels.append(rgb[sl][core])
        ratios.append(ratio[sl][core])
    return tuple(int(v) for v in np.median(np.concatenate(pixels), 0)), float(np.median(np.concatenate(ratios)))


def sheet_alpha(rgb):
    """Opacity for the sheet alone: 1 on paper, 0 on the board it lay on, soft at
    the edge. The sheet is the one large shape brighter than the board, whose
    outline is where the brightness is halfway between the two; fibres standing
    off the edge are shed, and the outline is drawn in a little, so no fringe of
    the board comes along. The crop has to leave some board showing all round."""
    gray = ndi.gaussian_filter(np.asarray(Image.fromarray(rgb).convert("L"), dtype=np.float32), 1.5)
    h, w = gray.shape
    board = np.median(np.concatenate([gray[:8].ravel(), gray[-8:].ravel(), gray[:, :8].ravel(), gray[:, -8:].ravel()]))
    paper = np.median(gray[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4])
    labels, _ = ndi.label(gray > (board + paper) / 2)
    sheet = ndi.binary_fill_holes(labels == np.bincount(labels.ravel())[1:].argmax() + 1)
    y, x = np.ogrid[-4:5, -4:5]
    sheet = ndi.binary_erosion(ndi.binary_opening(sheet, structure=x * x + y * y <= 16), iterations=2)
    return ndi.gaussian_filter(sheet.astype(np.float32), 1.5)


def under_paper(rgb, alpha):
    """The image with the board under it painted the colour of the paper at the
    sheet's edge, so that scaling it down blends the edge into paper, not board."""
    sheet = alpha > 0.5
    rim = sheet & ~ndi.binary_erosion(sheet, iterations=24)
    out = rgb.copy()
    out[~sheet] = np.median(rgb[rim], axis=0).astype(np.uint8)
    return out


def report_indents(items):
    """Does Chiari tab? Count how many of the distinct indents fall on every Nth column."""
    indents = sorted({item["columns"][0] for item in items})
    print(f"Indents, in columns from the left margin: {indents}")
    for every in range(2, 11):
        on = sum(c % every == 0 for c in indents)
        print(f"  every {every:2d}: {on}/{len(indents)} indents on a stop (by chance about {len(indents) / every:.0f})")


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
    bottom = max(i["region"][1] + i["region"][3] for i in spec["actions"])
    times = {}
    for item in spec["actions"]:
        start = (item["region"][1] - top) / (bottom - top) * spec["duration"]
        length = sum(max(seconds or ANNOUNCED for _, seconds in part) for part in item["sounds"]) or item.get("silent") or ANNOUNCED
        times[item["id"]] = (start, min(start + length, spec["duration"]))
    for item in spec["frame"]:
        times[item["id"]] = (0, spec["duration"])  # the instructions and title hold for the whole piece
    return times


def target(base, item, when):
    """Where and when an item is on the sheet's canvas: xywh=...&t=start,end."""
    x, y, w, h = item["region"]
    start, end = when
    return f"{base}/canvas/score#xywh={x},{y},{w},{h}&t={start:.1f},{end:.1f}"


def chapter(base, item, when):
    """The item as a chapter: a Range that names its place and its time, which
    Clover reads as a chapter on the canvas's timeline and a region drawn on
    the sheet. It is built from the same target as the annotation."""
    return {
        "id": f"{base}/range/{item['id']}",
        "type": "Range",
        "label": {"en": [item["text"].replace("\n", " ")]},
        "items": [{"id": target(base, item, when), "type": "Canvas"}],
    }


def annotation(base, item, when):
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
        "target": target(base, item, when),
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


def manifest(spec, size, pixels, grid):
    base, (w, h) = spec["base"], size
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
                    "body": {"id": f"{base}/{image}", "type": "Image", "format": format, "width": pixels[0], "height": pixels[1]},
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
    in_time = sorted(spec["actions"], key=lambda i: times[i["id"]])
    score["annotations"] = [
        {"id": f"{base}/page/actions", "type": "AnnotationPage", "items": [annotation(base, i, times[i["id"]]) for i in in_time]},
        {"id": f"{base}/page/frame", "type": "AnnotationPage", "items": [annotation(base, i, times[i["id"]]) for i in spec["frame"]]},
    ]
    return {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": f"{base}/manifest.json",
        "type": "Manifest",
        "label": {"en": [spec["label"]]},
        "summary": {"en": [spec["summary"]]},
        **({"requiredStatement": {"label": {"en": ["Note"]}, "value": {"en": [spec["note"]]}}} if spec.get("note") else {}),
        **credit(spec),
        # The same actions as chapters, in the order of time, so a viewer lists them,
        # marks them on the timeline and draws their regions without the annotations.
        "structures": [{
            "id": f"{base}/range/score",
            "type": "Range",
            "label": {"en": [spec["label"]]},
            "items": [chapter(base, i, times[i["id"]]) for i in in_time],
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
    parser.add_argument("scan", type=Path)
    parser.add_argument("--phrases", type=Path, default=here / "phrases.json")
    parser.add_argument("--out", type=Path, default=here.parents[1].parent / "assets" / "la-strada")
    args = parser.parse_args()

    spec = json.loads(args.phrases.read_text())
    actions, frame = spec["actions"], spec["frame"]
    items = actions + frame
    scan, icc = load(args.scan)
    x, y, w, h = spec["crop"]
    rgb = np.ascontiguousarray(scan[y : y + h, x : x + w])
    del scan
    ratio = paper_ratio(rgb)

    # The grid: the pitch from the actions' type, the left margin from the phrases
    # that begin at column 0, then the line spacing and every phrase's baseline.
    pitch, phase = measure_pitch(ratio, actions)
    edge = phase - pitch / 2
    starts = [np.nonzero((ratio[window(ratio, i, 0)[0]] < STRONG).any(0))[0].min() + i["box"][0] for i in actions if i["columns"][0] == 0]
    left = edge + pitch * np.floor((np.median(starts) - edge) / pitch + 0.15)
    spacing = baselines(ratio, items, left, pitch)
    rise, (low, high) = place(ratio, items, left, pitch, spacing, actions)
    print(f"Grid: {pitch:.3f} px a character ({600 / pitch:.2f} an inch at 600 ppi), {spacing:.2f} px a line; "
          f"tall letters reach {-low:.0f} px above the baseline and descenders {high:.0f} px below; a cell's top is {-rise:.1f} px above it")
    for item in items:
        note = f"  nudged {item['nudge']:+.1f} px" if abs(item["nudge"]) > 0.05 else ""
        spill = f"  {item['spill']} px of its ink outside its cell" if item["spill"] else ""
        print(f"  {item['id']:18s} columns {item['columns'][0]:3d}-{item['columns'][1]:3d}, {item.get('lines', 1)} line(s), baseline {item['baseline']:8.1f}{note}{spill}")
    cells = [(i["id"], i["cell"]) for i in items]
    for k, (a, (ax, ay, aw, ah)) in enumerate(cells):
        for b, (bx, by, bw, bh) in cells[k + 1:]:
            if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
                print(f"  ! {a} and {b} overlap")
    report_indents(actions)
    for item in items:
        item["sounds"] = recordings(item, args.out)

    # The canvas: a character `canvas.pitch` units wide, and the columns on whole
    # units, as is the top of the first action's cell. The images are drawn at
    # `images.pitch` pixels a character, the same sheet at a size to send.
    scale = spec["canvas"]["pitch"] / pitch
    shrink_by = Fraction(spec["images"]["pitch"], spec["canvas"]["pitch"])
    ox = (left * scale % 1) / scale
    top = min(i["cell"][1] for i in actions)
    oy = (top * scale % 1) / scale
    # Whole multiples of the images' fraction of the canvas, so they are exactly that fraction.
    whole = lambda length: int(length * scale) // shrink_by.denominator * shrink_by.denominator
    size = (whole(w - ox), whole(h - oy))
    pixels = tuple(int(v * shrink_by) for v in size)
    box = (ox, oy, ox + size[0] / scale, oy + size[1] / scale)
    for item in items:
        cx, cy, cw, ch = item["cell"]
        item["region"] = [round((cx - ox) * scale), round((cy - oy) * scale), round(cw * scale), round(ch * scale)]

    colour, type_ratio = type_colour(rgb, ratio, actions)
    alpha = sheet_alpha(rgb)
    type_mask = np.zeros(ratio.shape, bool)
    for item in items:
        mask, (ox_, oy_) = item["ink"]
        type_mask[oy_ : oy_ + mask.shape[0], ox_ : ox_ + mask.shape[1]] |= mask
    ground = under_paper(erase(rgb, ratio, actions, alpha > 0.99, type_mask), alpha)
    del type_mask
    ink = typed(ratio, actions, type_ratio)
    del ratio
    shrink = lambda image: image.resize(pixels, Image.LANCZOS, box=box)
    args.out.mkdir(parents=True, exist_ok=True)
    profile = {"icc_profile": icc} if icc else {}
    shrink(Image.fromarray(rgb)).save(args.out / "score.jpg", quality=88, optimize=True, progressive=True, **profile)
    cutout = np.dstack([ground, (alpha * 255).astype(np.uint8)])
    shrink(Image.fromarray(cutout, "RGBA")).save(args.out / "score-ground.webp", quality=90, method=6, **profile)
    layer = Image.new("RGBA", pixels, colour + (0,))
    layer.putalpha(shrink(Image.fromarray((ink * 255).astype(np.uint8))))
    layer.save(args.out / "score-ink.png", optimize=True, **profile)
    donors = sum(1 for i in actions if i.get("donor"))
    print(f"Type colour {colour} (at {type_ratio:.2f} of its paper); grain borrowed from nearby paper for {donors} of {len(actions)} actions")
    print(f"Canvas {size[0]} x {size[1]} units; images {pixels[0]} x {pixels[1]} px")

    grid = {
        "characterWidth": spec["canvas"]["pitch"],
        "lineHeight": round(spacing * scale, 3),
        "skew": 0,
        "originX": round((left - ox) * scale),
        "originY": round((top - oy) * scale),
    }
    if spec.get("grid", {}).get("tab"):
        grid["tab"] = spec["grid"]["tab"]
    (args.out / "manifest.json").write_text(json.dumps(manifest(spec, size, pixels, grid), indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {args.out}: {len(actions)} actions, {len(frame)} frame pieces")


if __name__ == "__main__":
    main()
