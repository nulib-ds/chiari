import React from "react";
import {withBasePath} from "@canopy-iiif/app/base-path";

/**
 * The site's color palette as swatches, for the lookbook. Values mirror the
 * tokens in app/styles/custom.css; contrast is against white (WCAG 2).
 *
 * <Palette group="print" />
 * <Palette group="paint" />
 */

type Swatch = {name: string; hex: string; token: string; use: string; contrast: string; paint?: string};

const PRINT: Swatch[] = [
  {name: "Rich Black", hex: "#000000", token: "--fx-ink", use: "Text, headings, the main menu", contrast: "21:1"},
  {name: "Rich Black 80%", hex: "#342F2E", token: "--fx-ink-80", use: "Secondary copy, hero descriptions, quotations", contrast: "13.2:1"},
  {name: "Rich Black 50%", hex: "#716C6B", token: "--fx-ink-50", use: "Captions, metadata, About and Works, the inactive language", contrast: "5.2:1"},
  {name: "Rich Black 20%", hex: "#BBB8B8", token: "--nu-rich-black-20", use: "Quiet rules, such as the blockquote margin", contrast: "2.0:1"},
  {name: "Off-White", hex: "#F0F0F0", token: "--nu-offwhite", use: "Placeholders for works without an image", contrast: "1.1:1"},
  {name: "White", hex: "#FFFFFF", token: "--nu-white", use: "The page", contrast: "n/a"},
];

const PAINT: Swatch[] = [
  {name: "Red", hex: "#EF553F", token: "paint-red", use: "Watch", contrast: "3.5:1", paint: "paint-red.svg"},
  {name: "Blue", hex: "#5091CD", token: "paint-blue", use: "Play", contrast: "3.4:1", paint: "paint-blue.svg"},
  {name: "Green", hex: "#008656", token: "paint-green", use: "Write", contrast: "4.6:1", paint: "paint-green.svg"},
  {name: "Gold", hex: "#FFC520", token: "paint-gold", use: "Collaborate", contrast: "1.6:1", paint: "paint-gold.svg"},
  {name: "Black paint", hex: "#000000", token: "paint-black", use: "Search field, language circles, black <Mark>", contrast: "21:1", paint: "paint-black.svg"},
];

export default function Palette({group = "print"}: {group?: "print" | "paint"}) {
  const swatches = group === "paint" ? PAINT : PRINT;
  return (
    <ul className={`fx-palette fx-palette--${group}`} role="list">
      {swatches.map((s) => (
        <li key={s.name} className="fx-swatch">
          {s.paint ? (
            <span className="fx-swatch__paint" style={{backgroundImage: `url("${withBasePath(`/images/marker/${s.paint}`)}")`}} aria-hidden="true" />
          ) : (
            <span className="fx-swatch__chip" style={{background: s.hex}} aria-hidden="true" />
          )}
          <span className="fx-swatch__name">{s.name}</span>
          <span className="fx-swatch__meta">
            <code>{s.hex}</code> · <code>{s.token}</code>
          </span>
          <span className="fx-swatch__use">{s.use}</span>
          <span className="fx-swatch__meta">{s.contrast === "n/a" ? "Background" : `${s.contrast} on white`}</span>
        </li>
      ))}
    </ul>
  );
}
