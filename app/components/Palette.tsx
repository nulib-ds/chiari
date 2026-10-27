import React from "react";
import {withBasePath} from "@canopy-iiif/app/base-path";

/**
 * The site's color palette as swatches, for the lookbook. Values mirror the
 * tokens in app/styles/custom.css; contrast is against the paper (WCAG 2).
 *
 * <Palette group="print" />
 * <Palette group="paint" />
 */

type Swatch = {name: string; hex: string; token: string; use: string; contrast: string; onBlack?: string; paint?: string};

const PRINT: Swatch[] = [
  {name: "Paper", hex: "#F1F1EE", token: "--fx-paper", use: "The page: off-white film with a soft sheen (gradients, no image)", contrast: "n/a"},
  {name: "Rich Black", hex: "#000000", token: "--fx-ink", use: "Text, headings, the main menu", contrast: "18.6:1"},
  {name: "Rich Black 80%", hex: "#342F2E", token: "--fx-ink-80", use: "Secondary copy, hero descriptions, quotations", contrast: "11.7:1"},
  {name: "Rich Black 50%", hex: "#716C6B", token: "--fx-ink-50", use: "Captions, metadata, About and Works, the inactive language", contrast: "4.6:1"},
  {name: "Rich Black 20%", hex: "#BBB8B8", token: "--nu-rich-black-20", use: "Quiet rules, such as the blockquote margin", contrast: "1.7:1"},
];

const PAINT: Swatch[] = [
  {name: "Red", hex: "#EA0138", token: "paint-red", use: "Watch", contrast: "4.1:1", onBlack: "4.6:1", paint: "paint-red.svg"},
  {name: "Blue", hex: "#2463E6", token: "paint-blue", use: "Play", contrast: "4.6:1", onBlack: "4.0:1", paint: "paint-blue.svg"},
  {name: "Green", hex: "#00885A", token: "paint-green", use: "Write", contrast: "4.0:1", onBlack: "4.7:1", paint: "paint-green.svg"},
  {name: "Yellow", hex: "#FAD000", token: "paint-yellow", use: "Collaborate", contrast: "1.3:1", onBlack: "14.1:1", paint: "paint-yellow.svg"},
  {name: "Pink", hex: "#E5199A", token: "paint-pink", use: "Current page underline, circle around the current language, <Mark>", contrast: "3.8:1", onBlack: "4.9:1", paint: "paint-pink.svg"},
  {name: "Black paint", hex: "#000000", token: "paint-black", use: "Search field, black <Mark>", contrast: "18.6:1", paint: "paint-black.svg"},
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
          <span className="fx-swatch__meta">
            {s.contrast === "n/a" ? "Background" : `${s.contrast} on paper`}
            {s.onBlack ? ` · ${s.onBlack} on black` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
