# Glyph tools

Vector lettering traced from Giuseppe Chiari's own hand and print, for site headings.
These are build-time tools only; their output SVGs go in `assets/images/glyphs/`.

## Setup

Python 3 in a virtualenv outside the repo:

```bash
python3 -m venv ~/.venvs/chiari-glyphs && ~/.venvs/chiari-glyphs/bin/pip install -r app/scripts/glyphs/requirements.txt
```

Render the source pages from the PDF (pdftoppm, from poppler):

```bash
pdftoppm -gray -r 400 -f 55 -l 61 -png "Chiari, Musica Senza Contrappunto.pdf" pages/p
```

## Handwritten alphabet

All 26 uppercase letters live in `glyphs/*.json` (100-unit cap height, baseline at y=0).
22 are traced from bold passages on pp.55–61 and p.56. J, K, W and Y never appear in the
book (Italian doesn't use them), so `compose.py` builds them from his traced V, I and U
strokes; their JSON says `"constructed": true` with the recipe.

`sources.json` records where every traced letter came from. To rebuild:

```bash
python build.py pages/          # trace every letter in sources.json at --weight 0.15
python compose.py               # rebuild J, K, W, Y from the traced strokes
python word.py "ART IS EASY" out.svg --paint
```

To swap a letter:
1. Find candidates with `segment.py page.png x0 y0 x1 y1 sheet.png`. It numbers each letter in a line and prints its box.
2. Put the box in `sources.json`. Use `"clip": true` for joined letters, and `"baseline": y` for descenders such as Q.
3. Run `build.py --only R`, then check with `sheet.py glyphs sheet.png R`.

`specimen/` holds A–M and N–Z renders for review.

## On the site: `<Hand>`

`app/components/Hand.tsx` sets any heading from these glyphs at build time:

```mdx
<Hand>Watch</Hand>
<Hand as="h2" size="3rem">Per Arco</Hand>
```

- **Output:** inline SVG with solid letters and a slightly wet edge, while the real text stays in the heading for screen readers and search.
- **Other characters:** anything outside A–Z falls back to Courier Prime.
- **Quotations:** `<Hand as="blockquote" cite="Giuseppe Chiari">Art is easy</Hand>` sets a short drawn quotation with a Courier Prime attribution.
- **Use it sparingly:** an occasional short heading or quotation, never every one. `content/about/lookbook.mdx` (`/about/lookbook`) shows the intended balance in placeholder text.

## Printed lettering (`extract.py`)

Keeps the press texture: pinholes, chips, soft counters.

```bash
extract.py flyer.jpg 80 300 2740 680 out.svg --label "Art is easy" --void 92 --turd 1
```

That box is ART IS EASY on the 1974 "Art is Easy" flyer at IIIF `full/max` (2770×990).

## Masthead (`masthead.py`)

Builds both masthead marks from Chiari's handwriting: `art-is-easy.svg` (the first, underlined ART IS EASY on page 1 of the "Art is Easy" text pieces, felt pen, grown slightly bolder) and `l-arte-e-facile.svg` (L'ARTE / È / FACILE from the "Art is Easy" bag, reset on one line with ART IS EASY's letter and word spacing). Both are scaled to one cap height and share a viewBox height and baseline, so they match at the same CSS height. Download the two IIIF `full/max` images named in the script's docstring, then:

```bash
python app/scripts/glyphs/masthead.py letter.jpg bag.jpg
```

`--grow` sets how much the English pen stroke is thickened, in source pixels (default 1). It prints both viewBoxes; if their sizes change, update the ratios (`1214 / 278`, `1347 / 278`) in the masthead rules in `app/styles/custom.css`.

## Marks and annotations

```bash
python app/scripts/glyphs/paint_circle.py   # loops, magnifier, clear ×, panel frame + mask
python app/scripts/glyphs/annotations.py    # 20 hover annotations + app/styles/annotations.css
```

Both use `brush()` in `paint_circle.py`. Run them with a plain `python`, not `python -I`, so `annotations.py` can import its neighbor. Each annotation is one function in `annotations.py`; `GESTURES` sets the order (and so the numbers). Each mark's seed is `2000 + its number`, so reruns are stable. If you add or remove gestures, also update `ANNOTATIONS` in the head script in `content/_app.mdx`.
