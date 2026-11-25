/**
 * The pieces of Clover 4 (@nulib/clover) the exhibit uses.
 *
 * The pure functions come from Clover's `helpers` entry, which holds no
 * React. The Watch page's projector screen is Clover's `Canvas`, from its
 * `canvas` entry, and La Strada's seek bar is its `Timeline`, from its
 * `timeline` entry, which bring Clover's React parts into the client bundle,
 * and `initCloverI18n`, by which each sets the language of its controls; all
 * three come from the same module, so they share one i18n.
 *
 * There is one Clover. package.json asks for the latest (4.12) and an npm
 * `overrides` entry gives Canopy the same copy in place of the 4.10 it pins,
 * so Canopy's Viewer, its Clover stylesheet and these pieces all agree.
 */
export {chaptersOf, decodeContentState, tableOfContents} from "@nulib/clover/helpers";
export {Canvas} from "@nulib/clover/canvas";
export {Timeline} from "@nulib/clover/timeline";
export {initCloverI18n} from "@nulib/clover";
