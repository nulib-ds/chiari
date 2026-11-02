# La Strada tools

Build-time tools for the La Strada exhibit (`<LaStrada>` in `app/components/LaStrada.client.tsx`). Their output goes in `assets/la-strada/`.

## Rebuild from a photograph or scan

```bash
python3 -m venv ~/.venvs/chiari-glyphs && ~/.venvs/chiari-glyphs/bin/pip install -r app/scripts/glyphs/requirements.txt
~/.venvs/chiari-glyphs/bin/python app/scripts/la-strada/prepare.py "Chiari, La Strada.jpg"
```

This writes `score.jpg`, `score-ground.webp` (the sheet with every action erased, and cut out of its background so it lies on the page as paper), `score-ink.png` (the actions' type alone, on transparency, which is what a slip becomes once it has fallen) and `manifest.json`. Pull the JPEG out of a PDF with `pdfimages -j`.

## phrases.json

The source of truth. Edit it, then rebuild; don't edit `manifest.json` by hand.

- `crop` is the sheet's rectangle in the photo (x, y, width, height). `canvas` is the size it is scaled to.
- `actions` fall off the sheet. `frame` (the instructions and title) stays on it.
- `box` is a rough rectangle around a phrase, in the cropped photo's pixels. It has to enclose the phrase and stay clear of its neighbours; the script fits the region to the ink inside it and leaves out the creases.
- `text` is the transcription, reconciled against the cut-up version of the score, so the typist's slips are corrected. It is what the exhibit announces and lists; add `speech` where a voice would get it wrong (`3′ 22″`).
- `audio` is a path under `assets/la-strada/`, such as `audio/oboe.mp3`, or a list of parts that sound one after another. A part is a path, or a list of paths to choose between: alternative takes, of which the exhibit plays one, never the same twice running. Each becomes a `Sound` body (a `Choice` of them for takes), and that action is performed rather than announced. Add `format` if it isn't `audio/mpeg`. An action with no `audio` is announced, unless it has `silent`, a number of seconds of silence to perform instead. Lengths are read from the files with `afinfo` or `ffprobe`.
- A phrase typed on one line can still be several actions: give each its own `box`, cut in the gap between them.
- Several lines can also be one action, with one `box` round them all. The silence of a room where someone is playing cards and the noise of the cards being shuffled are one recording, which begins with that silence.

A scan with different framing needs a new `crop` and new boxes, nothing else.

## The clock

The sheet is the clock. The piece lasts `duration` seconds (the score's 30′); the top of the typed area is 0 and the bottom is the end. So an action's place on the sheet is its time, and each annotation's target says both: `xywh=...&t=start,end`, where the end is its recordings' lengths end to end (a few seconds if it is only announced). The instructions and title hold for the whole piece. The annotation page lists its annotations in the order they come, and that is the original order. The exhibit's Original button puts every action back where it was typed and plays them in that order. Its slips can be moved too, and the sheet stays Original's; the reset icon beside it puts them back where they were typed, without playing. Wherever a visitor puts an action it has a time again, from where it stands, and a performance walks the sheet in the order of those times.

## The cutout

The sheet is cut from its background by following its outer edge in from each side of the crop, so the crop must leave some of the surface showing all the way round (about 40 pixels is enough). That edge is the outermost paper in the photograph, torn ledges and bent corners included. If an edge is missed on a scan with a lower-contrast background, lower `STEEP` in `prepare.py`; if it picks up noise, raise it.

## The arrangement

While the exhibit is in use, the visitor's arrangement is rebuilt as an ordered IIIF annotation page each time something moves: the actions standing on the sheet, in the order of their times, each keeping its text and sounds and given a new target (`xywh=...&t=...`) where it now stands. Actions left on the floor are not in it. The page can be downloaded or copied under the sheet, and it is also fired as a `la-strada:arrangement` event on the exhibit's `<section>` once a slip is let go, with the page as the event's `detail`:

```js
document.querySelector(".fx-strada").addEventListener("la-strada:arrangement", (e) => {
  console.log(e.detail); // an AnnotationPage, items in the order of time
});
```

Before anything is moved, and after a reset, it is the original page again.

## The typewriter's grid

`prepare.py` measures the grid from the typing itself and writes it to the manifest as a `TypewriterGrid` service on the sheet's canvas: `characterWidth`, `lineHeight`, `skew` (the tilt of the typing in the photograph, so that columns and lines are measured along and across it) and `originX`/`originY` (where a slip's corner stands at the left margin's first column and the first typed line). The exhibit settles dropped slips onto it, moves slips a column or a line with the arrow keys (Shift for five), and puts the shuffle's actions on it.

It prints what it found. On the 1964 photograph that is 20.4 px a character and 42.6 px a line (a ratio of 2.1, which is a 12-pitch face at six lines to the inch), tilted 0.86 degrees, with first characters within 0.19 of a column and first lines within 0.20 of a row. It also reports Chiari's indents. They recur at a few places (a margin shared by several actions, and one by two or three others) but not at any regular interval: only 11 of the 20 distinct indents fall on every fourth column, against about five by chance, and every other interval does worse. So the evidence is for no regular tab stop, but phrases.json sets `"grid": {"tab": 4}` anyway, as a house style: slips, the arrow keys and the shuffle land only on every fourth column, counting from the left margin. Remove `tab` to snap to every column; it is carried in the manifest as the grid's `tab`.

## Chapters, and Clover 4

The manifest lists every action twice, from one list: as an annotation (what it is) and as a Range in `structures` (a chapter: where and when it is, `canvas#xywh=...&t=start,end`). Clover 4 (`@nulib/clover`) reads those Ranges as chapters on a canvas's timeline, as regions drawn on its image, and as its table of contents, from the one target. The exhibit builds the same pair, afresh, from wherever the actions stand, and its **Manifest** button downloads them together: the arrangement's annotation page on the sheet's canvas, and its chapters as `structures`.

`app/components/clover.ts` is the one place the exhibit imports Clover from. It takes `chaptersOf` straight from Clover's ranges module, not from the package, because the package's main entry pulls in Clover's React parts and Canopy's bundler gives them a stand-in `react` with no `lazy` or `Suspense`, so the custom-component build fails. Add those two exports to `createReactShimPlugin` (`@canopy-iiif/app`, `lib/build/mdx.js`) and `clover.ts` can import from `@nulib/clover` itself, and the parts (`Root`, `Contents`, `Annotations`, `Timeline`) can be drawn too. They cost about 180 kB against the helpers' 5, and need `@nulib/clover/styles.css`.

