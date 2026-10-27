# Design Brief: Canopy Template (Northwestern)

The living record of layout, theme, and styling decisions for the Northwestern-branded Canopy template. Decisions follow Northwestern's [brand guidelines](https://www.northwestern.edu/brand/) as encoded in the `northwestern-brand-skills` color, typography, and "unstated rules" skills.

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
- Focus rings: 2px Northwestern Purple, white on purple surfaces.

## Shape & Borders

- Square corners everywhere — Canopy's UI already forces `border-radius: 0`, which matches the brand.
- No decorative borders. The footer drops Canopy's top rule in favor of the Purple 120 band.
- Cards (`.canopy-card`, used by search results and referenced items) drop their box border and sit on Off-White `#F0F0F0`.
- The hero keeps a single Rich Black 10% hairline at its base as a structural divider.

## Components

- **Header (v4):** three rows aligned to a 1120px column. Top bar Purple 120, 63px. Site-name row white, `2rem` padding, with search on the right: an underlined field (Purple 60 rule, Purple 30 placeholder, trailing Purple 60 icon; the submit button is visually hidden). Nav row between Purple 30 hairlines; links Akkurat Pro Bold in Northwestern Purple, Purple 70 fill with white text on hover, Purple 10 fill for the current page. Below Canopy's `70rem` breakpoint the nav and search collapse to purple icon buttons. The header is opaque, so the hero's `-5rem` tuck-under margin is reset to `0`.
- **Nav/search modals:** white, with the site name in the same uppercase purple treatment.
- **Hero:** flat white (Canopy's lavender gradient removed); purple Poppins headline, Rich Black description, brand buttons.
- **Buttons:** primary = Purple 100 fill, Purple 120 on hover; secondary = white with Purple 100 outline/text, Purple 10 on hover. Akkurat Pro Bold, `0.75rem 1.5rem` padding.
- **Footer:** Purple 120 band, white wordmark linking to northwestern.edu, Libraries link, copyright + Canopy credit.

## Chiari Project Layer (supersedes Purple-led color above)

The site reads as **printed black-and-white paper marked up by hand**: white ground, Rich Black type, no color fields. Color shows up only as marker annotations over the print, in Northwestern's [secondary palette](https://www.northwestern.edu/brand/visual-identity/color-palettes/secondary-palette/). `app/styles/custom.css` holds all of it; `northwestern.css` is untouched and still supplies fonts and structure.

- **Print:** Rich Black `#000000` for text and headings (replacing the earlier "never pure black" rule at the project's request), Rich Black 80% for secondary copy, Rich Black 50% for captions and meta. Canopy's accent ramp maps to ink and paper grays, so Canopy's own accent UI prints black too.
- **Marks** (`assets/images/marker/`): opaque paint-marker strokes `paint-red` `#EA0138`, `-blue` `#2463E6`, `-green` `#00885A`, `-yellow` `#FAD000`, `-pink` `#E5199A` and `-black`. The colors are sampled from the markers on Chiari's marked-up scores and nudged to midtones that read on white and on black (≥4:1 on both, except yellow, which is decorative only). There are also plus two open brush loops, `paint-circle-a` and `-b`, generated by `app/scripts/glyphs/paint_circle.py`.
- **Where marks appear by default:** only the main menu (a colored stroke on hover and on the current section), the search field (black stroke) and the language toggle (a loop around the current language). Headings, links, buttons and cards carry no marks. In-copy links keep a thin plain underline for WCAG 1.4.1.
- **`<Mark>`** (`app/components/Mark.tsx`) annotates copy with the same marks, sparingly: `<Mark color="red">` (any menu color, or black by default) underlines in paint, and `<Mark type="circle">` / `variant="b"` circles with one of the loops. `<Mark type="annotate" gesture="coil" color="pink">` marks the line holding a word or phrase with one of the twenty hover annotations, always shown, in the margin beside that line rather than over the words (`side="right"` for the right margin; left by default). `gesture` takes a name as the lookbook captions it, or a number, and defaults to scribble fill; `color` defaults to yellow. It renders as `<mark>`. `/about/lookbook` shows the intended frequency.
- **Header:** the four main sections (Watch, Play, Write, Collaborate) are large bold type, `clamp(1.35rem, …, 1.85rem)`. Each owns a paint color: Watch red, Play blue, Write green, Collaborate yellow. Hovering draws a thick opaque stroke under the word from the left, and the current section keeps it. Red, blue and green hold ≥4:1 on white (WCAG 1.4.11); yellow doesn't (1.5:1) and is decorative only. About and Works sit in a plain secondary menu beside search: regular weight, black, with an underline only.
- **Header implementation:** `ChiariHeader` in `content/_app.mdx` splits `navigation.yml`. Links whose last path segment is `about` or `search` go to the secondary menu, and the rest go to `CanopyHeader`'s `navigation` prop. Canopy doesn't set `isActive`, so the wrapper marks a link current when the page's path contains its section. All links stay in `navigation.yml`, so locale labels and `/it/` routes still come from Canopy.
- **Homepage:** `<FeaturedWorks />` (`app/components/FeaturedWorks.tsx`) replaces `<Interstitials.Hero>`. It shows one full-screen plate per `featured:` work (no carousel): the image is centered on white, with an index (`01 / 04`) and a plain title linking to the work page. Data comes from Canopy's `readFeaturedFromCacheSync`, and the srcset is clamped to each image's real size at build time. Headline, description and buttons follow in a plain intro section.
- **Accessibility:** the paint-stroke draw-in respects `prefers-reduced-motion`. Focus is a 2px ink outline. Marks are decorative and never the only carrier of meaning.
- **Type:** IBM Plex Sans (Google Fonts) is the only typeface. Everything else is drawn: Chiari's hand via `<Hand>` (see `app/scripts/glyphs/README.md`), and print-derived vectors such as ART IS EASY. Use the hand sparingly, for an occasional short heading or blockquote; `/about/lookbook` shows the balance.
- **Masthead:** the brand is ART IS EASY, vectorized from the 1974 flyer with its print texture kept, over "Giuseppe Chiari at 100" in Plex. On desktop it spans the English main nav row exactly and keeps that size in every language. The width comes from the measured English label ratio (`--fx-nav-text: 12.842`), so re-measure if the English labels change. The language toggle is ENGLISH / ITALIANO drawn with `<Hand>` (`LanguageToggle` in `_app.mdx`, replacing Canopy's select). The current language is black and the other Rich Black 50%. Each link goes to the same page in the other language (the `it/` tree mirrors the English one), falling back to that language's home when there's no counterpart. It sits at the right end of the nav row on desktop, and beside About / Works below 70rem.
- **Layout:** one 1200px container (`--fx-container`) with a 1.618rem inset, shared by the header, layouts, search, plates and footer. Content menus ("on this page") are off (`contentNavigation={false}`). There is no rule under the masthead; vertical white space separates sections.
- **Paper:** the page is `#F1F1EE` (`--fx-paper`), a cool off-white, lit by a soft radial bloom at the upper left and one faint diagonal sheen, fixed to the viewport. It uses gradients only, no image. The gradients only lighten, so `#F1F1EE` is the darkest point and Rich Black 50% stays at 4.6:1. The header, cards, footer and buttons are transparent, so the paper runs through.
- **Active links:** stay black. The current page is underlined in pink paint (`paint-pink.svg`) in the secondary menu and the sidebar; the current language is circled in pink. Pink (`#E5199A`, 3.8:1 on paper) is used only for marks, never for text.
- **Search:** no placeholder; the field keeps its hidden "Search" label. Its underline is the black paint stroke, the magnifier is drawn with the same brush (`paint-magnifier.svg`), and the browser's clear button is a pink brush × (`paint-close-pink.svg`; Chromium and Safari only, since Firefox draws none). The dropdown is a sheet of the same paper, boxed in a hand-drawn black frame (`paint-frame.svg` as a 9-slice border image) and masked to that outline (`paint-frame-mask.svg`; Chromium and Safari, while Firefox shows the plain box). Its group labels (Works, Pages) are drawn in Chiari's hand: a tiny head script tags each label as Canopy's search script builds it, and CSS swaps in `assets/images/glyphs/label-<word>.svg`, with OPERE and PAGINE ready for the Italian. While search is in use, the header rises to z-index 3 so the dropdown sits above the secondary menu and language toggle; otherwise it stays at 1 so it never blocks them. All marks come from `app/scripts/glyphs/paint_circle.py`.
- **Hover annotations:** a library of twenty distinct marks after the marker and brush gestures Chiari laid over printed scores, each its own gesture: scribble fill, coil, hatching, arc, underline, spring, tangle, ticks, brush swipes (streaky bristle lanes), dabs, cross-hatch, open oval, strike, verticals, spiral, wave, hook, crossing diagonals, taps and lasso. `app/scripts/glyphs/annotations.py` generates `assets/images/marks/annotate-01…20.svg` and `app/styles/annotations.css`; don't edit the CSS by hand. Each mark is a CSS mask, so any paint color can fill it; colors map to tokens through `[data-fx-ann-color]` in `custom.css`, and the lookbook has a switcher to preview all twenty in each. The head script in `_app.mdx` gives each search result a mark and a color (red, blue, green, yellow or pink, but never black, which would swallow the black text). Within one result list (the header dropdown, or the `/search` grid) no gesture repeats until all twenty are used, and colors rotate evenly with no two neighbors the same; picks are random among the least-used. Marks never go over a result's text, because the type is too light to survive it, and they always keep their drawn 280 × 50 shape: never rotated or squeezed. In the header dropdown the mark runs across the thumbnail from the panel's widened left padding, its box ending just inside the text so the paint barely reaches it. On `/search`, works take the mark across the top of the image from its left or right edge (chosen at random), the outer end in the gutter; pages take it in the margin beside the title, left of the column or right of the text. On hover the image or thumbnail also turns gray and fades to 40% over 160ms (an ease-out, off under reduced motion), so the paint reads against it; the mark and underline appear at once. The hovered title is underlined with the marker stroke in the same color as its mark (`--fx-ann-paint`, set beside `--fx-ann` for each `[data-fx-ann-color]`); the script copies the color onto the whole card so its caption can use it. The search cards stop clipping (`overflow: visible`) so marks can reach the gutter; images round their own corners. The `/search` Filter button always draws the tangle (gesture 7), in a fresh random color each time it's hovered or focused (the `shuffle` handler in `_app.mdx`), just above the pill, centered on it and nudged slightly down and right, 20vw wide. The button is a hand-painted black block (`paint-block.svg`, from `paint_circle.py`: five flat-brush strokes with ragged ends, stretched to the label) rather than a pill, and stays black on hover and has the marker stroke in the tangle's color drawn under its label, across the bottom of the pill. Keyboard focus adds a 2px ink outline, because yellow alone is too light to signal focus. The lookbook shows the whole library.
- **Purple:** none. The Northwestern wordmark sits black on white at the foot of every page (the CDN's white wordmark with `filter: brightness(0)`).
- **Shape:** buttons are pills, and images and cards have a 4px radius. Canopy forces `border-radius: var(--canopy-radius-none) !important` on `*`, so rounded elements redefine that variable.

## Technical Notes

- IIIF size workaround: Canopy (1.14.1) builds hero srcsets as `!w,w` at fixed widths (360–1600). The Understory image server rejects `!w,h` whenever `w` or `h` is larger than the image itself, even when the result would be a downscale, and it refuses all upscaling despite advertising `sizeUpscaling`. Short or narrow images therefore 400 on large or high-DPI screens. `FeaturedWorks` clamps its own srcset at build time. `IIIF_SIZE_FALLBACK` in `content/_app.mdx` remains as a safety net for any other Canopy component: it catches a failed load, reads that image's `info.json` once, and rewrites `src`/`srcset` clamped to the real dimensions. Remove it once Canopy clamps srcsets upstream.
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
