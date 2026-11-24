# Design Brief: Canopy Template (Northwestern)

The living record of layout, theme, and styling decisions for the Northwestern-branded Canopy template. Decisions follow Northwestern's [brand guidelines](https://www.northwestern.edu/brand/) as encoded in the `northwestern-brand-skills` color, typography, and "unstated rules" skills.

## 0. Prime directive: WCAG 2.2 AA

Every decision in this brief conforms to WCAG 2.2 at Level AA, and that outranks the brand. Northwestern's rules apply where they conform. When one conflicts with a criterion, conformance wins, and the deviation is recorded in this file with its reason. Canopy's rules are in [`packages/app/DESIGN.md`](https://github.com/nulib-ds/canopy/blob/main/packages/app/DESIGN.md) §0.

## Where things live

| File | Role |
| --- | --- |
| `app/styles/northwestern.css` | Brand layer: `@font-face`, Purple/Rich Black tokens mapped onto Canopy tokens, header/footer/button treatment. Treat as upstream — avoid editing per project. |
| `app/styles/custom.css` | Project-specific overrides. Empty by default. |
| `app/styles/index.css` | Tailwind entry; imports Canopy UI, then `northwestern.css`, then `custom.css`. |
| `content/_app.mdx` | Font preloads, v4-style top bar with the wordmark, footer. |
| `canopy.yml` | `theme` fields are fallbacks only (`purple` / `sand`); `northwestern.css` wins. |

## Brand & Identity

- Institution: Northwestern University Libraries.
- The header follows Northwestern's v4 department templates (northwestern.edu/templates/v4): a Purple 120 top bar holding the official white wordmark (`common.northwestern.edu/v8/css/images/northwestern.svg`, 21px tall) linked to northwestern.edu, then a white row with the site name, then the nav row.
- The top bar is markup in `_app.mdx` (`.nu-top-bar`), not part of `CanopyHeader`, so the wordmark links to the University while the site name links home. `CanopyHeader` gets no `logo`.
- The site name is the `canopy.yml` `title`, set in uppercase Akkurat Pro Regular in Northwestern Purple (`1.8rem`; `1.35rem` below `56.25em`). Long names wrap.
- The wordmark is white-only. It must sit on Purple 120 (top bar, footer) or Northwestern Purple. Never place it on white.

## Color

Northwestern's exact ramps, mapped onto Canopy's tokens in `northwestern.css`. Canopy places the `canopy.yml` theme before custom CSS, so these overrides win without `!important`.

| Canopy token | Northwestern value |
| --- | --- |
| `--color-accent-default` / `-700` | Purple 100 `#4E2A84` (Northwestern Purple) |
| `--color-accent-600` | Purple 90 `#5B3B8D` |
| `--color-accent-800` | Purple 120 `#401F68` |
| `--color-accent-900` | Purple 140 `#30104E` |
| `--color-accent-100`–`500` | Purple 10, 20, 30, 40, 60 |
| `--color-gray-50` | White `#FFFFFF` (page surface) |
| `--color-gray-100` | Off-White `#F0F0F0` (inset panels only) |
| `--color-gray-200`–`800` | Rich Black 10, 20, 40, 50, 60, 60, 70% |
| `--color-gray-900` / `-default` | Rich Black 80% `#342F2E` (primary text) |

- White is the predominant surface. Purple appears in the top bar, site name, nav, headings, links, and primary buttons; Purple 120 in the footer.
- Pure black (`#000000`) is never used.
- `--color-gray-400` maps to Rich Black 40% (3.7:1) rather than 30% so UI borders clear the 3:1 component contrast minimum.
- Raw brand values are exposed as `--nu-purple-*`, `--nu-rich-black-*`, `--nu-white`, `--nu-offwhite` for project CSS.
- Clover components (viewer, slider, image, scroll) follow these tokens through Canopy's `--clover-color-*` mapping, with square corners. `northwestern.css` overrides three of them on `:root`:
  - `accent-alt` → Purple 120, so hovers match the buttons
  - `secondary-alt` → Rich Black 10%
  - `secondary-muted` → Off-White

  The last two keep Clover's borders and handles light; the mapped gray 400/300 steps would be Rich Black 40%/20%.

## Typography

All faces load from Northwestern's central CDN (`common.northwestern.edu/v8/css/fonts/`, CORS `*`). Akkurat Pro is licensed for central hosting only — never copy the font files into `assets/`.

| Role | Face | Token |
| --- | --- | --- |
| Body, UI, navigation, buttons, h4–h6 | Akkurat Pro 400/700 | `--font-sans` |
| h1–h3 | Poppins 700, Northwestern Purple | `--font-display` (`font-display` utility) |
| Long-form editorial copy (opt-in) | Noto Serif 400/700 | `--font-serif` (`font-serif` utility) |

- Poppins is limited to h1–h3 because the brand forbids it below `1.375rem`. Navigation and buttons use Akkurat Pro Bold instead.
- Root font-size is `110%` (17.6px), matching Canopy's default template and sitting in Northwestern's 17–19px range for Akkurat Pro body copy. Body weight is 400 (Canopy's default template uses 300); line-height 1.7.
- Fallback stack is Arial → sans-serif. IBM Plex Sans is not loaded; add it from Google Fonts if the site will run where the CDN is unreachable.
- **Deviation:** the brand's `62.5%` root font-size convention is not adopted — Canopy's components are sized in `rem` against a 16px root, and changing it would shrink every component.

## Links & Focus

- In-copy links (`main p a`, `li a`, `dd a`, `blockquote a`) are always underlined. Purple next to Rich Black body text is only ~1.3:1, so color alone fails WCAG 1.4.1.
- Focus rings: 2px Northwestern Purple, white on purple surfaces, 2px outside the element.
  - Inside anything that clips its content (the hero's slides, the viewers, Scroll), the ring is drawn inside the element instead, where it stays in sight (WCAG 2.4.7). The map shows it on its frame, because its own panes paint over anything drawn inside it.
  - The header's visually hidden Search button shows itself, in Purple with white text, while it has focus (WCAG 2.4.7, 2.4.11).
- The footer's wordmark link is named by its image's `alt`, so if the image fails to load, the link still shows its name rather than collapsing to nothing.

## Shape & Borders

- Square corners and no shadows everywhere, by choice: `northwestern.css` sets Canopy's radius tokens to `0` and its shadows to a zero shadow (Canopy 2 rounds and lifts by default), so every component, Clover's among them, is square and flat.
- No decorative borders. The footer drops Canopy's top rule in favor of the Purple 120 band.
- Cards (`.canopy-card`, used by search results and referenced items) drop their box border and sit on Off-White `#F0F0F0`.
- The hero keeps a single Rich Black 10% hairline at its base as a structural divider.

## Components

- **Header (v4):** three rows aligned to a 1120px column. Top bar Purple 120, 63px. Site-name row white, `2rem` padding, with search on the right: an underlined field (Purple 60 rule, Purple 70 placeholder at 5.2:1 where the brief's Purple 30 is 2.2:1, trailing Purple 60 icon; the submit button is visually hidden). Nav row between Purple 30 hairlines; links Akkurat Pro Bold in Northwestern Purple, Purple 70 fill with white text on hover, Purple 10 fill for the current page. Below Canopy's `70rem` breakpoint the nav and search collapse to purple icon buttons. The header is opaque, so the hero's `-5rem` tuck-under margin is reset to `0`.
- **Nav/search modals:** white, with the site name in the same uppercase purple treatment.
- **Hero:** flat white (Canopy's lavender gradient removed); purple Poppins headline, Rich Black description, brand buttons.
- **Buttons:** primary = Purple 100 fill, Purple 120 on hover; secondary = white with Purple 100 outline/text, Purple 10 on hover. Akkurat Pro Bold, `0.75rem 1.5rem` padding.
- **Footer:** Purple 120 band, white wordmark linking to northwestern.edu, Libraries link, copyright + Canopy credit.

## Chiari Project Layer (supersedes Purple-led color above)

The site reads as **printed black-and-white paper marked up by hand**: white ground, Rich Black type, no color fields. Color shows up only as marker annotations over the print, in Northwestern's [secondary palette](https://www.northwestern.edu/brand/visual-identity/color-palettes/secondary-palette/). `app/styles/custom.css` holds all of it; `northwestern.css` is untouched and still supplies fonts and structure.

- **Print:** one ink, 100% black (`--fx-ink`, `#000000`), for every letter: text, headings, menus, captions, metadata and links. There are no grays for type (the earlier Rich Black 80% and 50% steps are gone) and no gray rules. Canopy's accent ramp maps to ink and paper grays, so Canopy's own accent UI prints black too. The one exception is type knocked out of a painted black block (the Filter button, La Strada's pill buttons), which is the paper showing through.
- **Clover's media player** draws on its own dark bar, where ink would vanish, so there the accent is pink paint (`.clover-canvas-media` in `custom.css`): played time and the volume level fill in pink (4:1 on black), and its buttons turn pink on hover and focus. Clover's image controls, on the paper, keep the black. A stopgap until Clover gives its player an accent of its own.
- **Marks** (`assets/images/marker/`): opaque paint-marker strokes `paint-red` `#EA0138`, `-blue` `#2463E6`, `-green` `#00885A`, `-yellow` `#FAD000`, `-pink` `#E5199A` and `-black`. The colors are sampled from the markers on Chiari's marked-up scores and nudged to midtones that read on white and on black (≥4:1 on both, except yellow, which is decorative only). There are also plus two open brush loops, `paint-circle-a` and `-b`, generated by `app/scripts/glyphs/paint_circle.py`.
- **Where marks appear by default:** only the main menu (a random annotation on hover and under the current section), the search field and the Search button it folds into (black stroke) and the language toggle (a loop around the current language). Headings, links, buttons and cards carry no marks. In-copy links keep a thin plain underline for WCAG 1.4.1.
- **`<Mark>`** (`app/components/Mark.tsx`) annotates copy with the same marks, sparingly: `<Mark color="red">` (any menu color, or black by default) underlines in paint, and `<Mark type="circle">` / `variant="b"` circles with one of the loops. `<Mark type="annotate" gesture="coil" color="pink">` marks the line holding a word or phrase with one of the twenty hover annotations, always shown, in the margin beside that line rather than over the words (`side="right"` for the right margin; left by default). `gesture` takes a name as the lookbook captions it, or a number, and defaults to scribble fill; `color` defaults to yellow. It renders as `<mark>`. `/about/lookbook` shows the intended frequency.
- **Header:** the four main sections (Watch, Play, Write, Collaborate) are drawn in Chiari's hand with `<Hand>`, at the same cap height as the ENGLISH / ITALIANO toggle (`HAND_LABEL_SIZE`, `1.1rem`, in `_app.mdx`) and, like all of Chiari's hand, bold. They sit one tab apart (a `2ch` inset each side of each label), a blank line (`--fx-nav-top`) below the masthead row. On desktop the toggle sits level with them at the right end of the row. The phone menu modal draws the same labels. Each gets a random annotation from the twenty in a random paint color (pink, blue, green or yellow) on each load, from the head script in `_app.mdx`: no gesture repeats across the row, and neighbors never share a color. The mark is drawn under the word, behind it and crossing only its lower edge, shown at once on hover and kept under the current section. Clicking an item carries its mark to the page it opens (one `sessionStorage` handoff, read once), so the section keeps the gesture and color it showed on hover; the other items draw fresh ones that don't repeat it or match its color beside it. It's a little wider than the word (6–10.5em) at the mark's own 280 × 50 shape, and it hangs mostly below the word, starting three-quarters of the way down the letters. Yellow is decorative only (1.5:1), so the mark is never the only sign of the current section. About and Works sit in a plain secondary menu beside search: regular weight, black, always underlined. The current one has an annotation drawn under it, a random gesture from the twenty in a random paint color on each load (set by the head script in `_app.mdx`; a yellow wave, `annotate-16`, stands in without it).
- **Header implementation:** `ChiariHeader` in `content/_app.mdx` splits `navigation.yml`. Links whose last path segment is `about` or `search` go to the secondary menu, and the rest go to `CanopyHeader`'s `navigation` prop. Canopy doesn't set `isActive`, so the wrapper marks a link current when the page's path contains its section. All links stay in `navigation.yml`, so locale labels and `/it/` routes still come from Canopy.
- **Homepage:** `<FeaturedWorks />` (`app/components/FeaturedWorks.tsx`) replaces `<Interstitials.Hero>`. It shows one full-screen plate per `featured:` work (no carousel): the image is centered on white, with an index (`01 / 04`) and a plain title linking to the work page. Data comes from Canopy's `readFeaturedFromCacheSync`, and the srcset is clamped to each image's real size at build time. Headline, description and buttons follow in a plain intro section.
- **Accessibility:** the paint-stroke draw-in respects `prefers-reduced-motion`. Focus is a 2px ink outline. Marks are decorative and never the only carrier of meaning.
- **La Strada sound (rule):** every action is performed from its recording. Nothing is announced: the exhibit never speaks an action with the browser's voice, and an action without a recording keeps its time in silence. The action's text is for screen readers only, said when its slip is focused (its `aria-label`). The caption beside the buttons is for the eye (`aria-hidden`); the only live announcement is the arrangement's guidance when Original, Clear or Shuffle changes it, never the action being heard, so a screen reader never talks over the piece.
- **Type:** Courier Prime (Google Fonts: Regular 400, Bold 700 and the Regular italic) is the only typeface, for body, display, serif and code roles alike (`--font-sans`, `--font-display`, `--font-serif`, `--font-mono` in `custom.css`). Everything else is drawn: Chiari's hand via `<Hand>` (see `app/scripts/glyphs/README.md`), and the masthead traced from his handwriting. Use the hand sparingly, for an occasional short heading or blockquote; `/about/lookbook` shows the balance. The hand is always bold, the hand's way: its outlines are traced again with a round 5-unit stroke (cap height = 100) in the same ink, as if pressed harder. `<Hand>` gets it from `.fx-hand__svg > g` in `custom.css`, and `word.py` draws it into the static label SVGs (`--stroke`, default 5). The pair A–B is kerned 16 units tighter in both, since A's slanting leg and B's left spur leave a gap. The masthead is traced artwork, not the glyph set, and is unchanged.
- **Typewriter type (rule):** typewritten type follows typewriter rules. A typewriter has one size of type, one ribbon and a key that is struck normally or hard, so:
  - **One size.** Every typed element is the body size, `1rem` (17.6px), line height 1.7. Headings, menus, captions, buttons, labels and Canopy's and Clover's own UI included. Never set a `font-size` on type; a base-layer `!important` lock in `custom.css` enforces it. Drawing is exempt: SVG, `<Hand>` (whose `size` defaults to `2rem`), the masthead, and the drawn main menu and language toggle.
  - **One weight, never lighter.** Regular 400 is the primary weight and the floor; nothing goes lighter (Canopy asks for 300 in places; the lock refuses it). Bold 700 is the only other weight: the key hammered hard. Use it to punctuate text, not to style chrome: a `<strong>` word or phrase, and h1. No synthesized weights.
  - **Underline, not italics.** `<em>` and `<cite>` (Markdown `*…*`) are underlined, as titles and emphasis were typed. Italic is reserved for `<i>`, and should be rare. Underlining is fine anywhere it helps.
  - **One ink.** All type is 100% black (see Print).
  - **Hierarchy from case and space.** h1 BOLD CAPITALS; h2 CAPITALS; h3 underlined; h4–h6 plain. Capitals and underlines are fine; letter-spacing and word-spacing are not, since they break the monospace grid.
  - **Smart spacing.** Space comes in typewriter units. Vertically, whole lines (`--fx-line`, 1.7rem): a blank line between paragraphs, two below h1, three above h2 and one below, two above h3. Horizontally, 4-character tabs (`--fx-tab`, `4ch`): list indents, blockquotes and the gap between the drawn main menu items are one tab. Prefer a line or a tab to any arbitrary rem.
- **Masthead:** the brand is Chiari's own hand: ART IS EASY with its underline (from page 1 of the "Art is Easy" text pieces) on English pages, and L'ARTE È FACILE (from the "Art is Easy" bag, set on one line) on Italian pages, over "Giuseppe Chiari at 100" in Courier Prime. CSS swaps the image on `:lang(it)`. The Italian is spaced like the English and both are scaled to one letter height and baseline, so they read as the same size (the Italian runs about a tenth wider) and the header doesn't move when the language changes. The masthead is drawing, so it keeps its own size: `--fx-mast-h` in `custom.css` holds 1.2 × the height it had when the main nav was large type (when it was three-fifths of that row's width), growing slightly with the window; below 70rem it fills the brand row up to 3.3rem. Both languages read the same `--fx-mast-h`, so they stay the same letter size. The language toggle is ENGLISH / ITALIANO drawn with `<Hand>` (`LanguageToggle` in `_app.mdx`, replacing Canopy's select). Both languages are black; the current one is circled in pink. Each link goes to the same page in the other language (the `it/` tree mirrors the English one), falling back to that language's home when there's no counterpart. It sits at the right end of the nav row on desktop, and beside About / Works below 70rem.
- **Layout:** one 1200px container (`--fx-container`) with a 1.618rem inset, shared by the header, layouts, search, plates and footer. Content menus ("on this page") are off (`contentNavigation={false}`). There is no rule under the masthead; vertical white space separates sections.
- **Paper:** the page is `#FBFBF9` (`--fx-paper`), almost white, lit by a soft radial bloom at the upper left and one faint diagonal sheen, fixed to the viewport. It uses gradients only, no image. The gradients only lighten, so `#FBFBF9` is the darkest point and black type holds 20:1 everywhere. The header, cards, footer and buttons are transparent, so the paper runs through.
- **Active links:** stay black. The current page is underlined in pink paint (`paint-pink.svg`) in the sidebar, and marked with a random annotation in the secondary menu; the current language is circled in pink. Pink (`#E5199A`, 4.1:1 on paper) is used only for marks, never for text.
- **Search:** on desktop, since Canopy 2.0.2, a "Search" button opens into the field and the field folds back into it when left empty; on the search page the field stays open. The button is the field folded, not a box: the same black paint stroke under it and the brush magnifier at its right end, with "Search" where the query goes. Both are set to the right, so on opening the magnifier stays put and the line runs on to the left. By keyboard, both take the site's 2px black focus outline, round the whole button or the whole field (Canopy removes the input's own, so the field draws it); clicked, neither is outlined. A text field always matches `:focus-visible`, so the field's outline keys off `data-fx-keys`, which `KEYS_IN_USE` in `_app.mdx` sets on Tab or Cmd/Ctrl+K and clears on a pointer press. No placeholder; the field keeps its hidden "Search" label. Its underline is the black paint stroke, the magnifier is drawn with the same brush (`paint-magnifier.svg`), and the browser's clear button is a pink brush × (`paint-close-pink.svg`; Chromium and Safari only, since Firefox draws none). The dropdown is a sheet of the same paper, boxed in a hand-drawn black frame (`paint-frame.svg` as a 9-slice border image) and masked to that outline (`paint-frame-mask.svg`; Chromium and Safari, while Firefox shows the plain box). Its group labels (Works, Pages) are drawn in Chiari's hand: a tiny head script tags each label as Canopy's search script builds it, and CSS swaps in `assets/images/glyphs/label-<word>.svg`, with OPERE and PAGINE ready for the Italian. While search is in use, the header rises to z-index 3 so the dropdown sits above the secondary menu and language toggle; otherwise it stays at 1 so it never blocks them. Within the header, the dropdown's wrapper takes z-index 1 while results are open: its drop-shadow filter makes it a stacking context, and without one the main menu's links (isolated for their marks) painted over the results. All marks come from `app/scripts/glyphs/paint_circle.py`.
- **Hover annotations:** a library of twenty distinct marks after the marker and brush gestures Chiari laid over printed scores, each its own gesture: scribble fill, coil, hatching, arc, underline, spring, tangle, ticks, brush swipes (streaky bristle lanes), dabs, cross-hatch, open oval, strike, verticals, spiral, wave, hook, crossing diagonals, taps and lasso. `app/scripts/glyphs/annotations.py` generates `assets/images/marks/annotate-01…20.svg` and `app/styles/annotations.css`; don't edit the CSS by hand. Each mark is a CSS mask, so any paint color can fill it; colors map to tokens through `[data-fx-ann-color]` in `custom.css`, and the lookbook has a switcher to preview all twenty in each. The head script in `_app.mdx` gives each search result a mark and a color (red, blue, green, yellow or pink, but never black, which would swallow the black text). Within one result list (the header dropdown, or the `/search` grid) no gesture repeats until all twenty are used, and colors rotate evenly with no two neighbors the same; picks are random among the least-used. Marks never go over a result's text, because the type is too light to survive it, and they always keep their drawn 280 × 50 shape: never rotated or squeezed. In the header dropdown the mark runs across the thumbnail from the panel's widened left padding, its box ending just inside the text so the paint barely reaches it. On `/search`, works take the mark across the top of the image from its left or right edge (chosen at random), the outer end in the gutter; pages take it in the margin beside the title, left of the column or right of the text. On hover the image or thumbnail also turns gray and fades to 40% over 160ms (an ease-out, off under reduced motion), so the paint reads against it; the mark and underline appear at once. The hovered title is underlined with the marker stroke in the same color as its mark (`--fx-ann-paint`, set beside `--fx-ann` for each `[data-fx-ann-color]`); the script copies the color onto the whole card so its caption can use it. The search cards stop clipping (`overflow: visible`) so marks can reach the gutter; images round their own corners. The `/search` works grid is capped at four columns: Canopy's masonry has no column setting (six above 1280px), so a head script in `_app.mdx` has the search page report at most 1024px to it, and narrower windows still get fewer. A work page's title takes one big random mark (any gesture, any paint color, fresh on each load) close below it, never over the type. The "Related Items" heading below gets a smaller mark under it, a little right of center, always a different gesture and color from the title's. The `/search` Filter button always draws the tangle (gesture 7), in a fresh random color each time it's hovered or focused (the `shuffle` handler in `_app.mdx`), just above the pill, centered on it and nudged slightly down and right, 20vw wide. The button is a hand-painted black block (`paint-block.svg`, from `paint_circle.py`: five flat-brush strokes with ragged ends, stretched to the label) rather than a pill, and stays black on hover and has the marker stroke in the tangle's color drawn under its label, across the bottom of the pill. Keyboard focus adds a 2px ink outline, because yellow alone is too light to signal focus. The lookbook shows the whole library.
- **Purple:** none. The Northwestern wordmark sits black on white at the foot of every page (the CDN's white wordmark with `filter: brightness(0)`).
- **Shape:** buttons are pills, and images and cards have a 4px radius. Everything else is square: Canopy's radius tokens are zero (`northwestern.css`), and the rounded things set their own `border-radius` in `custom.css`; a card rounds its picture and the tint that stands in for a missing one too.
- **Related items:** each facet's strip (`<RelatedItems>`, Clover 4's Items under Canopy 2) is printed thumbnails, not cards: the facet value over its field, the facet value itself the link to its works (since Canopy 2.0.2, whose "View all" is for screen readers only), the two arrows at the right of that line (on their own line under it on a phone), and square pictures cropped to fill, captioned underneath, with no frame, radius or shadow. A work with no picture is a gray square. Canopy fits four to the row on a wide window, three or two on a narrower one, and one on a phone, by the window's width. All of it is in the Related items section of `custom.css`.
- **Code:** typed like everything else. Code in running text has no chip, and a code block is ink on the Off-White panel, not Canopy 2's black one.

## Technical Notes

- IIIF size workaround: Canopy (still as of 2.0.2) builds hero srcsets as `!w,w` at fixed widths (360–1600). The Understory image server rejects `!w,h` whenever `w` or `h` is larger than the image itself, even when the result would be a downscale, and it refuses all upscaling despite advertising `sizeUpscaling`. Short or narrow images therefore 400 on large or high-DPI screens. `FeaturedWorks` clamps its own srcset at build time. `IIIF_SIZE_FALLBACK` in `content/_app.mdx` remains as a safety net for any other Canopy component: it catches a failed load, reads that image's `info.json` once, and rewrites `src`/`srcset` clamped to the real dimensions. Remove it once Canopy clamps srcsets upstream.
- `_app.mdx` is compiled into `.cache/mdx/` and cached for the life of `npm run dev`. Relative imports from it don't resolve, so shell code such as `ChiariHeader` lives inside it, and changes to it need a dev-server restart. A `//` comment directly above an `export` breaks MDX parsing; keep comments inside the export.

- `canopy.yml`'s `featured:` list **must** be present and non-empty — the homepage's `<RelatedItems top={3} />` (and, transitively, the `<Interstitials.Hero />` on the same page) fails to render if it's missing, with no build error surfaced.
- The monorepo's template staging (`packages/helpers/template/prepare-template.js`) overlays this variant's `app/` directory after copying the monorepo's `app/styles/`, so files here win.

## Open Decisions

- [x] Color tokens — exact ramps via `app/styles/northwestern.css`
- [x] Typography — Akkurat Pro / Poppins / Noto Serif from the Northwestern CDN
- [x] Logo — official white wordmark from the Northwestern CDN in a v4-style Purple 120 top bar
- [ ] Confirm the v4-style header with University Marketing
- [x] Hero treatment on the homepage — flat white, hairline base
- [ ] Work-page layout variations from the default template
- [ ] Content voice for starter copy
- [ ] Final demo collection (currently: Northwestern's [University Archives Postcards](https://api.dc.library.northwestern.edu/api/v2/collections/bd90de9e-8e1e-43c4-8009-dd13a916a2ac?as=iiif) collection)
