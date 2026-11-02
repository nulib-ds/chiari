/**
 * The pieces of Clover 4 (@nulib/clover) the exhibit uses.
 *
 * They are imported from their own module rather than from the package, because
 * the package's main entry brings in all of Clover's React parts, and Canopy's
 * bundler stands in its own shim for `react` that has no `lazy` or `Suspense`, so
 * the whole custom-component build fails on them. The helpers here are pure and
 * need no React. Once the shim has them (see createReactShimPlugin in
 * @canopy-iiif/app/lib/build/mdx.js), import from "@nulib/clover" instead.
 */
export {chaptersOf, tableOfContents} from "../../node_modules/@nulib/clover/dist/core/ranges.mjs";
