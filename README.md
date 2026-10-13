# Chiari · Canopy IIIF

A project of [Northwestern University Libraries](https://www.library.northwestern.edu/).

This project uses the [Northwestern Canopy template](https://github.com/nulib-ds/canopy-template-northwestern) while retaining Chiari’s content, English and Italian navigation, assets, and IIIF collection configuration.

The Northwestern brand layer is in `app/styles/northwestern.css`, imported by `app/styles/index.css`. The shared header, footer, and font preloads are in `content/_app.mdx`. Keep project-specific style overrides in `app/styles/custom.css`; see `DESIGN.md` for the upstream design notes. Fonts and wordmarks load from Northwestern’s central CDN.

Template source: commit `be437611c9639dcc37e505bf57841aedbb04d56a` (integrated October 13, 2026). The template’s demo pages and postcard collection were not imported. Chiari’s `canopy.yml` remains the source for the title, locales, collection, metadata, and search settings.

## Run locally

Use Node 24 (`nvm use`), run `npm install`, then `npm run dev`. Open http://localhost:5001. Run `npm run build` to generate the production site in `site/`; do not edit that generated directory. Development and production builds need network access to fetch IIIF resources. This project does not currently define automated test or lint scripts.

The existing homepages use a featured hero, but `canopy.yml` has no `featured` list, so the hero currently renders no content. Add selected Chiari manifest IDs under `featured` to enable it. The original homepage text and configuration have been preserved.

For documentation, examples, and release notes, visit https://nulib-ds.github.io/canopy/.
## Tasks
View status of tasks at `./TASKS.md` [here](./TASKS.md).

## Getting Started

Walk through the [Quick Start guide](https://nulib-ds.github.io/canopy/docs/user-guides/canopy-get-started.html) to stand up your new digital project, configure `canopy.yml` using IIIF collections and manifests, and add pages and layouts under `content/`.

## Preview from the monorepo

Working inside `nulib-ds/canopy`? Run `npm run preview:template` to stage this starter into `.template-preview/`, install its dependencies, and launch `npm run dev`. Stop the script with `Ctrl+C` when you are done.

## Updates

Keep your project current by running `npm install @canopy-iiif/app@latest @samvera/clover-iiif@latest` whenever a new release ships, or trigger the _Update Canopy App_ GitHub action (Actions tab → _Update Canopy App_ → _Run workflow_) and let it open a pull request that bumps both dependencies for you. Read the [Developer documentation](https://nulib-ds.github.io/canopy/docs/developers) for more information.

## Contributing

All development happens in https://github.com/nulib-ds/canopy. If you are interested in shaping Canopy IIIF, please open an issue, share feedback, or send a pull request.

## License

Canopy IIIF (Canopy) is an open-source project of [Northwestern University Libraries](https://www.library.northwestern.edu/), created by Mat Jordan and Mark Baggett, released under the MIT License. By working directly with IIIF resources, Canopy keeps materials with the libraries, museums, and archives that serve them, along with their metadata, rights statements, and terms of use. Implementers should be aware of the rights and terms governing the materials they reference, publish, and deploy to the web using Canopy.
