/**
 * The pieces of Clover 4 (@nulib/clover) the exhibit uses.
 *
 * They come from Clover's `helpers` entry, which holds its pure functions and
 * no React, rather than from the package's main entry, which brings in all of
 * Clover's React parts (about 180 kB against the helpers' 5). The version in
 * package.json follows the one @nulib/canopy brings, so there is one Clover.
 */
export {chaptersOf, tableOfContents} from "@nulib/clover/helpers";
