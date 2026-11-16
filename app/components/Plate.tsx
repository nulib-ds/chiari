import React from "react";
import {withBasePath} from "@canopy-iiif/app/base-path";

/**
 * A captioned picture from `assets/`, set like the featured plates. Use it
 * for things that are not works in the collection, such as a screenshot of
 * one of the site's interactive pages. With `href` the picture links there
 * and `label` becomes a link circled in pink paint marker under it; the children are the caption, set
 * to the width of the picture. Give `width` and `height` (the file's pixel
 * size) so the plate can be sized before the picture loads.
 *
 * <Plate src="/images/la-strada-play.jpg" alt="…" href="/play/la_strada" label="Play La Strada" width={1920} height={1350}>
 *   Caption…
 * </Plate>
 */
export default function Plate({
  src,
  alt = "",
  href,
  label,
  width,
  height,
  children,
}: {
  src: string;
  alt?: string;
  href?: string;
  label?: string;
  width?: number;
  height?: number;
  children?: React.ReactNode;
}) {
  const image = (
    <img src={withBasePath(src)} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
  );
  const to = href ? withBasePath(href) : undefined;
  return (
    <figure
      className="fx-plate fx-plate--framed"
      style={width && height ? ({"--fx-plate-ratio": String(width / height)} as React.CSSProperties) : undefined}
    >
      {to ? (
        <a className="fx-plate__media" href={to} aria-label={label || alt}>
          {image}
        </a>
      ) : (
        <span className="fx-plate__media">{image}</span>
      )}
      <figcaption className="fx-plate__caption">
        {to && label ? (
          <a className="fx-plate__action" href={to}>
            {label}
          </a>
        ) : null}
        {children ? <div className="fx-plate__note">{children}</div> : null}
      </figcaption>
    </figure>
  );
}
