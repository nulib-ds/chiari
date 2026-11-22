import React from "react";
import {withBasePath} from "@nulib/canopy/base-path";

/**
 * The site's color palette as swatches, for the lookbook. Values mirror the
 * tokens in app/styles/custom.css; contrast is against the paper (WCAG 2).
 *
 * <Palette group="print" />
 * <Palette group="paint" />
 */

type Swatch = {name: string; hex: string; token: string; use: string; contrast: string; onBlack?: string; paint?: string};

const PRINT: Swatch[] = [
  {name: "Paper", hex: "#FBFBF9", token: "--fx-paper", use: "The page: almost white, with a soft sheen (gradients, no image)", contrast: "n/a"},
  {name: "Black", hex: "#000000", token: "--fx-ink", use: "Every letter: text, headings, menus, captions, links. The only ink", contrast: "20.3:1"},
];

const PAINT: Swatch[] = [
  {name: "Blue", hex: "#2463E6", token: "paint-blue", use: "Menu annotations, <Mark>", contrast: "5.1:1", onBlack: "4.0:1", paint: "paint-blue.svg"},
  {name: "Green", hex: "#00885A", token: "paint-green", use: "Menu annotations, <Mark>", contrast: "4.3:1", onBlack: "4.7:1", paint: "paint-green.svg"},
  {name: "Yellow", hex: "#FAD000", token: "paint-yellow", use: "Menu annotations, <Mark> (decorative only)", contrast: "1.4:1", onBlack: "14.1:1", paint: "paint-yellow.svg"},
  {name: "Pink", hex: "#E5199A", token: "paint-pink", use: "Menu annotations, sidebar current page, circle around the current language, <Mark>", contrast: "4.1:1", onBlack: "4.9:1", paint: "paint-pink.svg"},
  {name: "Black paint", hex: "#000000", token: "paint-black", use: "Search field, black <Mark>", contrast: "20.3:1", paint: "paint-black.svg"},
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
