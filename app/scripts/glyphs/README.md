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

- **Output:** inline SVG with the painted finish, while the real text stays in the heading for screen readers and search.
- **Other characters:** anything outside A–Z falls back to IBM Plex Sans Bold.
- **Quotations:** `<Hand as="blockquote" cite="Giuseppe Chiari">Art is easy</Hand>` sets a short drawn quotation with a Plex attribution.
- **Use it sparingly:** an occasional short heading or quotation, never every one. `content/about/lookbook.mdx` (`/about/lookbook`) shows the intended balance in placeholder text.

## Printed lettering (`extract.py`)

Keeps the press texture: pinholes, chips, soft counters.

```bash
extract.py flyer.jpg 80 300 2740 680 assets/images/glyphs/art-is-easy.svg --label "Art is easy" --void 92 --turd 1
```

`art-is-easy.svg` came from the "Art is Easy" flyer at IIIF `full/max` (2770×990).
