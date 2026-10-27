import React from "react";
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
 * Full-screen plates for the works listed under `featured:` in canopy.yml:
 * one work per screen, read by scrolling rather than a carousel.
 *
 * <FeaturedWorks />
 */
export default function FeaturedWorks({label = "Featured works"}: {label?: string}) {
  const items: FeaturedRecord[] = readFeaturedFromCacheSync() || [];
  if (!items.length) return null;

  return (
    <section className="fx-plates" aria-label={label}>
      {items.map((item, index) => {
        const position = `${String(index + 1).padStart(2, "0")} / ${String(items.length).padStart(2, "0")}`;
        return (
          <figure className="fx-plate" key={item.href || index}>
            {item.thumbnail ? (
              <a className="fx-plate__media" href={item.href} tabIndex={-1} aria-hidden="true">
                <img
                  src={item.thumbnail}
                  srcSet={clampedSrcset(item.thumbnail, item.thumbnailWidth, item.thumbnailHeight)}
                  sizes="(min-width: 64rem) 80vw, 100vw"
                  width={item.thumbnailWidth}
                  height={item.thumbnailHeight}
                  alt=""
                  loading={index === 0 ? "eager" : "lazy"}
                  decoding="async"
                />
              </a>
            ) : null}
            <figcaption className="fx-plate__caption">
              <span className="fx-plate__index">{position}</span>
              <a className="fx-plate__title" href={item.href}>
                {item.title}
              </a>
            </figcaption>
          </figure>
        );
      })}
    </section>
  );
}
