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

/**
 * One work from the `featured:` list in canopy.yml, shown whole and linked to
 * its work page. Place it between paragraphs inside <FeaturedWorks>; `n`
 * counts from 1 in the order the works are listed. Works with several
 * canvases get previous/next controls.
 *
 * <FeaturedWork n={2} />
 */
export default function FeaturedWork({n = 1}: {n?: number}) {
  const items: FeaturedRecord[] = readFeaturedFromCacheSync() || [];
  const index = Number(n) - 1;
  const item = items[index];
  if (!item) return null;

  let pages = pagesOf(item.href);
  if (!pages.length && item.thumbnail && item.thumbnailWidth && item.thumbnailHeight) {
    const base = item.thumbnail.slice(0, item.thumbnail.indexOf("/full/"));
    pages = [{base, width: item.thumbnailWidth, height: item.thumbnailHeight}];
  }
  if (!pages.length) return null;
  const title = item.title || "";

  return (
    <figure className="fx-plate" data-fx-plate="">
      <div className="fx-plate__pages">
        {pages.map((page, k) => (
          <a
            className="fx-plate__media"
            key={page.base}
            href={item.href}
            data-fx-page=""
            aria-label={title || "View work"}
            hidden={k > 0}
          >
            <img
              src={iiifUrl(page.base, 960, page.width, page.height)}
              srcSet={clampedSrcset(`${page.base}/full/x/0/default.jpg`, page.width, page.height)}
              sizes="(min-width: 75rem) 1150px, 100vw"
              width={page.width}
              height={page.height}
              alt={pages.length > 1 ? `${title} (${k + 1} of ${pages.length})` : title}
              loading={index === 0 && k === 0 ? "eager" : "lazy"}
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
      {/* Scribbles shown while the title is hovered; the script in
          FeaturedWorks.tsx gives them a random gesture, color and side. */}
      <span className="fx-scribble fx-scribble--gap" aria-hidden="true" />
      <span className="fx-scribble fx-scribble--margin" aria-hidden="true" />
    </figure>
  );
}
