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

`app/styles/custom.css` moves this site onto Northwestern's [secondary palette](https://www.northwestern.edu/brand/visual-identity/color-palettes/secondary-palette/) for a Fluxus music/art project. `northwestern.css` is untouched and still provides fonts and structure.

- **Surface:** white, with generous section spacing (`--fx-section-space`). No hairlines between header, nav and content.
- **Type:** Rich Black `#000000` for text and headings; Rich Black 80% for secondary copy (hero description, blockquotes, footer), Rich Black 50% for captions and meta. This replaces the earlier "never pure black" rule at the project's request.
- **Brights** (`--fx-green`, `--fx-teal`, `--fx-blue`, `--fx-yellow`, `--fx-gold`, `--fx-red`) are used only as fills, dots, squiggles and rules. None reaches 4.5:1 as text on white, so text never uses them. Rich Black on any bright does.
- **Darks** (`--fx-blue-dark` `#007FA4`, `--fx-navy` `#0D2D6C`, …) handle colored text and icons. Canopy's accent ramp maps to blue, with `#007FA4` as the default.
- **Purple:** only in a slim Purple 120 strip under the footer, which holds the white wordmark (the wordmark still has to sit on purple). The v4 Purple top bar is gone, replaced by a `.fx-score` strip of rounded dashes and dots.
- **Motifs** (`assets/images/fluxus/`): `score.svg` (header strip), `squiggle-*.svg` (h1 underline, nav hover and current state), `hero-shapes.svg` (circles and a scribble behind the hero image). Everything is round and loose, never blocky.
- **Accents:** h1 has a red squiggle underline, h2 a gold dot, h3 a green underline. Links are Rich Black with a blue underline that turns red on hover. Each nav item gets its own bright; card hover rings cycle red, gold, green and blue.
- **Shape (deviation):** buttons, the search field, nav marks and hero arrows are pills; cards and hero images have a 1.25rem radius. Canopy forces `border-radius: var(--canopy-radius-none) !important` on `*`, so rounded elements redefine `--canopy-radius-none` rather than setting `border-radius`. Box shadows are forced off the same way, so card hovers use `outline`.
- **Buttons:** primary is a gold fill with Rich Black text (red on hover); secondary is a Rich Black outline (teal on hover).

## Technical Notes

- IIIF size workaround: Canopy (1.14.1) builds hero srcsets as `!w,w` at fixed widths (360–1600). The Understory image server rejects `!w,h` whenever `w` or `h` is larger than the image itself, even when the result would be a downscale, and it refuses all upscaling despite advertising `sizeUpscaling`. Short or narrow images therefore 400 on large or high-DPI screens. `IIIF_SIZE_FALLBACK` in `content/_app.mdx` catches the failed load, reads that image's `info.json` once, and rewrites `src`/`srcset` clamped to the real dimensions. Remove it once Canopy clamps srcsets upstream.

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
