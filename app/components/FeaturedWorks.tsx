import React from "react";
import fs from "node:fs";
import path from "node:path";
// Canopy's own resolver for `featured:` in canopy.yml: reads the IIIF cache
// at build time and returns title, work-page href, image and its dimensions.
import {readFeaturedFromCacheSync} from "@canopy-iiif/app/lib/components/featured.js";

type FeaturedRecord = {
  title?: string;
  href?: string;
  thumbnail?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
};

type Page = {base: string; width: number; height: number};

/** Every painted canvas of a cached manifest, as an image-service base + size. */
function pagesOf(href?: string): Page[] {
  try {
    const slug = path.basename(String(href || ""), ".html");
    const file = path.resolve(".cache/iiif/manifests", `${slug}.json`);
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    const pages: Page[] = [];
    for (const canvas of manifest.items || []) {
      const body = canvas?.items?.[0]?.items?.[0]?.body;
      const service = Array.isArray(body?.service) ? body.service[0] : body?.service;
      const base = service?.id || service?.["@id"];
      const width = body?.width || canvas.width;
      const height = body?.height || canvas.height;
      if (base && width && height) pages.push({base: String(base), width, height});
    }
    return pages;
  } catch (_) {
    return [];
  }
}

/** Image-service URL no larger than the image itself (see clampedSrcset). */
function iiifUrl(base: string, size: number, width: number, height: number) {
  return `${base}/full/!${Math.min(size, width)},${Math.min(size, height)}/0/default.jpg`;
}

const SRCSET_STEPS = [640, 960, 1280, 1600, 2000];

/**
 * IIIF srcset clamped to the image's real size. The Understory image server
 * rejects `!w,h` when w or h exceeds the image, even for a downscale, so each
 * step asks for `!min(w,W),min(w,H)` and is labelled with the width it
 * actually returns.
 */
function clampedSrcset(thumbnail: string, width?: number, height?: number) {
  const at = thumbnail.indexOf("/full/");
  if (at < 0 || !width || !height) return undefined;
  const base = thumbnail.slice(0, at);
  const tail = thumbnail.slice(at + "/full/".length).split("/").slice(1).join("/");
  const seen = new Set<number>();
  return SRCSET_STEPS.map((step) => {
    const w = Math.min(step, width);
    const h = Math.min(step, height);
    const actual = Math.round(width * Math.min(w / width, h / height));
    if (seen.has(actual)) return "";
    seen.add(actual);
    return `${base}/full/!${w},${h}/${tail} ${actual}w`;
  })
    .filter(Boolean)
    .join(", ");
}

// Flip-through for plates with several pages: one page shows at a time and the
// rest are `hidden`.
const FLIP_SCRIPT = `(function () {
  if (window.__fxFlip) return;
  window.__fxFlip = true;
  document.addEventListener("click", function (event) {
    var flip = event.target.closest && event.target.closest("[data-fx-flip]");
    if (!flip) return;
    var plate = flip.closest("[data-fx-plate]");
    var pages = plate.querySelectorAll("[data-fx-page]");
    var current = 0;
    pages.forEach(function (el, n) { if (!el.hidden) current = n; });
    var next = (current + Number(flip.getAttribute("data-fx-flip")) + pages.length) % pages.length;
    pages.forEach(function (el, n) { el.hidden = n !== next; });
    plate.querySelector("[data-fx-count]").textContent = (next + 1) + " / " + pages.length;
  });

  // Scribbles for the hover: a different gesture (1-20, annotations.css) and
  // a paint color per plate, shuffled on every load; each mark lands either
  // in the gap below its plate or in the margin beside it.
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }
  var gestures = shuffle(Array.apply(null, Array(20)).map(function (_, i) { return String(i + 1); }));
  var colors = ["red", "blue", "green", "yellow", "pink"];
  var last = "";
  document.querySelectorAll("[data-fx-plate]").forEach(function (plate, n) {
    var color;
    do { color = colors[Math.floor(Math.random() * colors.length)]; } while (color === last);
    last = color;
    var marks = [plate.querySelector(".fx-scribble--gap"), plate.querySelector(".fx-scribble--margin")];
    var left = Math.random() < 0.5;
    marks.forEach(function (mark, k) {
      if (!mark) return;
      mark.setAttribute("data-fx-ann", gestures[(n * 2 + k) % gestures.length]);
      mark.setAttribute("data-fx-ann-color", color);
      mark.setAttribute("data-fx-ann-side", left ? "left" : "right");
    });
  });
})();`;

/**
 * Home-page spread: MDX children (the text) fill one third, the works listed
 * under `featured:` in canopy.yml stack in the other two thirds. Each image is
 * shown whole, scaled to the window, and links to its work page. Works with
 * several canvases get previous/next controls.
 *
 * <FeaturedWorks>
 *   Paragraphs…
 * </FeaturedWorks>
 */
export default function FeaturedWorks({
  label = "Featured works",
  children,
}: {
  label?: string;
  children?: React.ReactNode;
}) {
  const items: FeaturedRecord[] = readFeaturedFromCacheSync() || [];
  if (!items.length && !children) return null;

  return (
    <section className="fx-spread" aria-label={label}>
      <div className="fx-spread__text">{children}</div>
      <div className="fx-spread__plates">
        {items.map((item, index) => {
          let pages = pagesOf(item.href);
          if (!pages.length && item.thumbnail && item.thumbnailWidth && item.thumbnailHeight) {
            const base = item.thumbnail.slice(0, item.thumbnail.indexOf("/full/"));
            pages = [{base, width: item.thumbnailWidth, height: item.thumbnailHeight}];
          }
          if (!pages.length) return null;
          const title = item.title || "";
          return (
            <figure className="fx-plate" key={item.href || index} data-fx-plate="">
              <div className="fx-plate__pages">
                {pages.map((page, n) => (
                  <a
                    className="fx-plate__media"
                    key={page.base}
                    href={item.href}
                    data-fx-page=""
                    aria-label={title || "View work"}
                    hidden={n > 0}
                  >
                    <img
                      src={iiifUrl(page.base, 960, page.width, page.height)}
                      srcSet={clampedSrcset(`${page.base}/full/x/0/default.jpg`, page.width, page.height)}
                      sizes="(min-width: 64rem) 50vw, 100vw"
                      width={page.width}
                      height={page.height}
                      alt={pages.length > 1 ? `${title} (${n + 1} of ${pages.length})` : title}
                      loading={index === 0 && n === 0 ? "eager" : "lazy"}
                      decoding="async"
                    />
                  </a>
                ))}
              </div>
              <figcaption className="fx-plate__caption">
                {pages.length > 1 ? (
                  <span className="fx-plate__flip">
                    <button type="button" data-fx-flip="-1" aria-label="Previous page">
                      ‹
                    </button>
                    <span data-fx-count="">{`1 / ${pages.length}`}</span>
                    <button type="button" data-fx-flip="1" aria-label="Next page">
                      ›
                    </button>
                  </span>
                ) : null}
                <a className="fx-plate__title" href={item.href}>
                  {title}
                </a>
              </figcaption>
              {/* Scribbles shown while the title is hovered; the script
                  gives them a random gesture, color and side on each load. */}
              <span className="fx-scribble fx-scribble--gap" aria-hidden="true" />
              <span className="fx-scribble fx-scribble--margin" aria-hidden="true" />
            </figure>
          );
        })}
      </div>
      <script dangerouslySetInnerHTML={{__html: FLIP_SCRIPT}} />
    </section>
  );
}
