# La Strada tools

Build-time tools for the La Strada exhibit (`<LaStrada>` in `app/components/LaStrada.client.tsx`). Their output goes in `assets/la-strada/`.

## Rebuild from the scan

```bash
python3 -m venv ~/.venvs/chiari-glyphs && ~/.venvs/chiari-glyphs/bin/pip install -r app/scripts/glyphs/requirements.txt
~/.venvs/chiari-glyphs/bin/python app/scripts/la-strada/prepare.py default.tif
```

`default.tif` is Northwestern's scan of the typescript: 8380 × 11071 px at 600 ppi, sRGB, the sheet on a black board. This writes `score.jpg`, `score-ground.webp` (the sheet with every action erased, and cut out of the board so it lies on the page as paper), `score-ink.png` (the actions' type alone, on transparency, which is what a slip becomes once it has fallen) and `manifest.json`. It takes a couple of minutes and prints what it measured, phrase by phrase.

## phrases.json

The source of truth. Edit it, then rebuild; don't edit `manifest.json` by hand.

- `crop` is the sheet's rectangle in the scan (x, y, width, height), with some of the board showing all round.
- `canvas.pitch` is how many canvas units a typed character is wide; the canvas is scaled to it. `images.pitch` is how many pixels a character is in the images, which can be fewer (see the grid, below).
- `actions` fall off the sheet. `frame` (the instructions and title) stays on it.
- `columns` are the columns of a phrase's first and last characters, counted from the typing's left margin (column 0), and `lines` how many lines it was typed on (1 if left out). They are the typescript's own, so a phrase's slip is exactly that many characters and lines of the typewriter's grid. Count them from the typing, typos and all: "A door bangd" is twelve characters.
- `box` is a rough rectangle round a phrase, in the cropped scan's pixels, that the script finds its baseline in. It only has to enclose the phrase's lines and keep clear of the lines above and below.
- `text` is the transcription, reconciled against the cut-up version of the score, so the typist's slips are corrected. It is what the exhibit announces and lists; add `speech` where a voice would get it wrong (`3′ 22″`). Break its lines where the typescript breaks them: the seek bar's popover and the transcription under the sheet show an action on the lines it was typed on.
- `audio` is a path under `assets/la-strada/`, such as `audio/oboe.mp3`, or a list of parts that sound one after another. A part is a path, or a list of paths to choose between: alternative takes, of which the exhibit plays one, never the same twice running. Each becomes a `Sound` body (a `Choice` of them for takes), and that action is performed rather than announced. Add `format` if it isn't `audio/mpeg`. An action with no `audio` is announced, unless it has `silent`, a number of seconds of silence to perform instead. Lengths are read from the files with `afinfo` or `ffprobe`.
- A phrase typed on one line can still be several actions: give each its own `columns`. "A hand laid on a table." stands in columns 48–70 and "Playing with a pencil held flabbily" in 72–106, with the space between them belonging to neither.
- Several lines can also be one action, with `lines` saying how many. The silence of a room where someone is playing cards and the noise of the cards being shuffled are one recording, which begins with that silence.

Another scan of the sheet needs a new `crop` and new `box`es, nothing else: the `columns` and `lines` belong to the typescript.

## The clock

The sheet is the clock. The piece lasts `duration` seconds (the score's 30′); the top of the typed area is 0 and the bottom is the end. So an action's place on the sheet is its time, and each annotation's target says both: `xywh=...&t=start,end`, where the end is its recordings' lengths end to end (a few seconds if it is only announced). The instructions and title hold for the whole piece. The annotation page lists its annotations in the order they come, and that is the original order. The exhibit's Original button puts every action back where it was typed and plays them in that order. Its slips can be moved too, and the sheet stays Original's; the reset icon beside it puts them back where they were typed, without playing. Wherever a visitor puts an action it has a time again, from where it stands, and a performance walks the sheet in the order of those times (see The performance, below).

## The cutout

The sheet is the one large shape brighter than the board it was scanned on, and its outline is where the brightness is halfway between the board's (read from the crop's border) and the paper's. Fibres standing off the edge are shed and the outline drawn in by two pixels, so no fringe of the board comes along, and under the transparent board the ground is painted the colour of the paper at the sheet's edge, so scaling it down never darkens the edge. The outline is the paper's own: the bent top-right corner, the whitened top-left and the stained bottom-left edge come through as they are. The crop must leave some board showing all the way round (the 40 pixels it leaves is plenty).

## Erasing

The ground is the sheet with every action's type painted out, so that slips can fall off it and leave paper behind. The type tints the paper round it for about 10 pixels at 600 ppi (the ribbon's ink spreads into the fibres, and the scan stores colour at half the resolution of brightness, which leaves a bluish fringe round every stroke), so that much is painted over too, fading into the paper at its edge, though never outside the slip's own cell. The colour is borrowed from the paper nearby that is well clear of any type; the grain from the same paper a few lines or characters away, so that the erased lines are no smoother than the sheet. What is not the phrase's stays: the folds, the specks along them, grit, a stain, the scribble under "Voice".

## The arrangement

While the exhibit is in use, the visitor's arrangement is rebuilt as an ordered IIIF annotation page each time something moves: the actions standing on the sheet, in the order of their times, each keeping its text and sounds and given a new target (`xywh=...&t=...`) where it now stands. Actions left on the floor are not in it. The page can be downloaded or copied under the sheet, and it is also fired as a `la-strada:arrangement` event on the exhibit's `<section>` once a slip is let go, with the page as the event's `detail`:

```js
document.querySelector(".fx-strada").addEventListener("la-strada:arrangement", (e) => {
  console.log(e.detail); // an AnnotationPage, items in the order of time
});
```

Before anything is moved, and after a reset, it is the original page again.

A `la-strada:manifest` event follows it each time, with the recomposed manifest (what the **Manifest** button downloads) as its `detail`: the performance, the page on the sheet's canvas, and the chapters of both. Both events bubble.

### Seeing it in Clover

`<LaStradaDebug manifest="/la-strada/manifest.json" />` (`app/components/LaStradaDebug.client.tsx`) is for debugging and not part of the exhibit; it is not on the page now. Put it under `<LaStrada>` in `content/play/la_strada/index.mdx` to use it. It hands every `la-strada:manifest` to Clover 4's `<clover-viewer>` web component, which brings its own React and is loaded from jsDelivr at the installed version, and lists the order the annotation page gives. Its images and sounds are rebased to wherever the page is served, as the exhibit's are.

## The performance

The exhibit recomposes the arrangement as a manifest of its own whenever it changes, and Clover 4's `Timeline` loads that manifest and plays it. It is the seek bar fixed along the foot of the window and as wide as it, on a black bar as Clover's player is on the Watch page: of Clover's player only the seek bar is shown, in Clover's own drawing (a white rail, pink where it has been heard), with the exhibit's own play button at its head.

The manifest's first item is the performance: a Canvas of sound alone, which is a `Timeline` once Clover has upgraded it to Presentation 4. The actions' recordings are painted on it end to end, in the order of the times where their slips stand, each coming as the one before it ends. The sheet's clock gives the order and no more: the silences it would leave between the actions are left out, so a performance lasts as long as it sounds (about twelve and a half minutes for all twenty-five), not the score's 30′. The sheet's canvas follows, with the arrangement's annotation page, then the two other images.

`structures` says what the performance is made of: every action is a Range that names its time in the performance (`…/canvas/performance#t=start,end`) and, if it stands on the sheet, its place there (`…/canvas/score#xywh=…&t=…`, its annotation's own target, whose time is still the sheet's clock). A Range's label is the action as it was typed, line breaks and all. Clover reads the Ranges as chapters, so the seek bar marks each action and names it in a popover under the pointer, on the lines it was typed on. While a chapter or its action is pointed at, the marker draws a line from the chapter, over the bar, to arrive under the middle of the action's last line. A slip with focus is boxed round, roughly, in pink, as a hand rings a line on a page, and the line meets the box's foot there; the box is its focus ring. If the pointer rests on another slip meanwhile, the line goes there and the focused slip keeps its box, in black. There is no line while the action stands within about four lines of the bar, or under it, where it would only run sideways across the type. Each time the page opens, a tip ("Move typed actions of the La Strada score to compose the desired order.", with a Start button that closes it) stands over one action, "Voice of Winston Churchill" (`tipFor`), boxed in blue, with a dotted blue line to that action from its chapter, until it is closed (its ×, or Escape) or a line is moved; a screen reader is told it with the guide. While it is up, every five seconds, a faded copy of that action's type lifts off it and drifts up and to the left, to the left margin three lines above the score's first block, as if moved there. As it goes, the seek bar shows the order as it would be with the action where the copy then is, as it does while a slip is carried: the action's chapter (in blue) slides forward a place each time the copy rises past another line, to the front, and back as the copy fades. The dotted line follows the copy the whole way, from wherever the bar has the chapter, until the visitor first presses, types or tabs into the exhibit; the action itself stays put, and under reduced motion nothing moves. While a slip is carried, the bar is given the chapters of the manifest as it would be, read back out of its Ranges with Clover's `chaptersOf`, before that manifest is loaded: the slip's chapter is marked out and the line follows the slip, so where it would land in the performance is seen before it is put down.

Clover plays the recordings one after another as one. A performance recomposed while it plays goes on from where it was, in the action it had reached. Only what stands on the sheet is performed: an action on the floor is in neither the manifest's performance nor its chapters, and with the sheet clear (after Clear, say) the manifest has no performance at all and the bar is empty until something is put back.

Two things to know:

- A painting's target is written as a `SpecificResource` with a `FragmentSelector` (`t=start,end`), not as a fragment on the canvas's id. The Ranges name the same stretches by such ids, and `@iiif/parser`'s upgrade to Presentation 4, which Clover uses, then reads a string target of the same id as the Range's item and loses its time, so Clover would play only the first recording.
- Seeking inside a recording needs a server that answers byte-range requests, as GitHub Pages does. `canopy dev`'s server does not (it sends each mp3 whole, as `application/octet-stream`), so on localhost a seek into the middle of an action starts that action again from its beginning.

## The typewriter's grid

Slips are cut on the typewriter's grid, as the machine set the type. The carriage moves a whole character at a time, so the columns are one grid across the sheet: `prepare.py` measures their pitch from the actions' type and finds column 0 from the phrases that begin at the left margin. The lines are not. Chiari turned the platen freely between blocks, so a block's lines keep to the line spacing, but the blocks lie at any height: Churchill and the oboe stand half a line off the lines of the cards, the door and the cello a third. Each phrase's own baseline places it, found where its lines, a line apart, stop most sharply together.

So every slip is a whole number of characters wide and of lines high, and a one-line slip is as high as every other. The cell stands the same height above its baseline in every slip, centred on the type's height (between where its tall letters reach and where its descenders end), so a slip's text sits in it as every other slip's does. Across, a slip stands on the columns unless its own first or last letter needs it moved to be held whole: the registration of a line wanders by a few pixels, so a few slips are nudged, by 3.5 px at most. Ink belongs to a phrase if it lies in its cells and is type: a dark-cored stroke more than a speck, and the pieces of a letter struck unevenly, like the faint tails of "very far away". The specks along the folds, a pencil tick beside a line and the scribble under "Voice" stay on the paper.

It prints what it found. On Northwestern's scan that is 61.28 px a character (9.79 to the inch, a 2.6 mm pitch) and 117.45 px a line (5 mm), with the actions' typing level to within 0.03 degrees, so there is no tilt to correct; tall letters reach 74 px above the baseline and descenders 22 px below, so a cell's top is 84.4 px above it. The line is 1.9165 characters, which makes a character 24 canvas units and a line 46 (45.994): every cell is a whole number of units. The images are drawn at 18 px a character (2445 × 3237), which is enough for a 6K display and keeps the three images to 1.7 MB; the canvas is 3260 × 4316 units.

The grid goes into the manifest as a `TypewriterGrid` service on the sheet's canvas: `characterWidth` and `lineHeight` in canvas units, `skew` (0: the typing is level), and `originX`/`originY` (column 0, and the top of the first action's cell). The exhibit settles dropped slips onto it, moves slips a column or a line with the arrow keys (Shift for five), and puts the shuffle's actions on it.

It also reports Chiari's indents. They recur at a few places (a margin shared by several actions, and one by two or three others) but not at any regular interval: only 8 of the 19 distinct indents fall on every fourth column, against about five by chance, and 10 on every third, against about six. So the evidence is for no regular tab stop, but phrases.json sets `"grid": {"tab": 4}` anyway, as a house style: slips, the arrow keys and the shuffle land only on every fourth column, counting from the left margin. Remove `tab` to snap to every column; it is carried in the manifest as the grid's `tab`.

## Chapters, and Clover 4

The manifest lists every action twice, from one list: as an annotation (what it is) and as a Range in `structures` (a chapter: where and when it is, `canvas#xywh=...&t=start,end`). Clover 4 (`@nulib/clover`) reads those Ranges as chapters on a canvas's timeline, as regions drawn on its image, and as its table of contents, from the one target. The exhibit builds the same pair, afresh, from wherever the actions stand, and adds the performance (above). Its **Manifest** button downloads them together.

`app/components/clover.ts` is the one place the site imports Clover from. The exhibit takes `Timeline` from `@nulib/clover/timeline`, which brings Clover's React parts into its bundle (Canopy 2's bundler hands them the page's own React), and `initCloverI18n`, by which the seek bar speaks the page's language. Clover's stylesheet comes with Canopy's, and the player's own styles load with its code. package.json asks for one Clover, and an `overrides` entry gives Canopy the same copy, so the site has one.
