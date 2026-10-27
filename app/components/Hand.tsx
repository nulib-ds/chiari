import React from "react";
import fs from "node:fs";
import path from "node:path";

/**
 * A heading set in Giuseppe Chiari's hand: uppercase glyphs traced from
 * "Musica senza contrappunto" (see app/scripts/glyphs). Rendered at build
 * time as inline SVG with a slightly wet edge; the real text stays in the
 * heading for screen readers, search and the page outline.
 *
 * Use sparingly, for an occasional short heading or quotation, not every one.
 *
 * <Hand>Watch</Hand>
 * <Hand as="h2" size="1.6rem">Per Arco</Hand>
 * <Hand as="blockquote" cite="Giuseppe Chiari, 1972">Art is easy</Hand>
 *
 * Letters A–Z use the traced glyphs (J, K, W, Y are built from his strokes).
 * Anything else, such as digits or punctuation, falls back to IBM Plex Sans.
 */

type Glyph = {d: string; advance: number; descent?: number};

const GLYPH_DIR = path.resolve("app/scripts/glyphs/glyphs");
const CAP = 100; // glyph units per cap height
const SPACE = 32;
const PAD = 6;

let cache: Record<string, Glyph | null> = {};
function glyph(ch: string): Glyph | null {
  if (!(ch in cache)) {
    const file = path.join(GLYPH_DIR, `${ch}.json`);
    cache[ch] = /^[A-Z]$/.test(ch) && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  }
  return cache[ch];
}

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement(node)) return textOf((node.props as {children?: React.ReactNode}).children);
  return "";
}

export default function Hand({
  as: Tag = "h1",
  size = "1em",
  tracking = 6,
  paint = true,
  id,
  className = "",
  cite,
  children,
}: {
  as?: "h1" | "h2" | "h3" | "h4" | "blockquote" | "p" | "span";
  /** Cap height of the drawn letters, as any CSS length. */
  size?: string;
  /** Space between letters, in glyph units (cap height = 100). */
  tracking?: number;
  paint?: boolean;
  id?: string;
  className?: string;
  /** Attribution under a blockquote, set in IBM Plex Sans. */
  cite?: string;
  children?: React.ReactNode;
}) {
  const text = textOf(children).trim();
  const parts: React.ReactNode[] = [];
  let x = 0;
  let descent = 0;
  for (const raw of text) {
    const ch = raw.toUpperCase();
    if (ch === " ") {
      x += SPACE;
      continue;
    }
    const g = glyph(ch);
    if (g) {
      parts.push(<path key={parts.length} transform={`translate(${x.toFixed(1)} 0)`} d={g.d} />);
      descent = Math.max(descent, g.descent || 0);
      x += g.advance + tracking;
    } else {
      // Not in the traced set: IBM Plex Sans Bold, sized to the cap height.
      parts.push(
        <text key={parts.length} x={x.toFixed(1)} y="0" fontFamily="IBM Plex Sans, Arial, sans-serif" fontWeight={700} fontSize={140}>
          {raw}
        </text>,
      );
      x += 84 + tracking;
    }
  }
  const width = Math.max(0, x - tracking);
  const height = CAP + descent + 2 * PAD;
  // Unique per text, so several hand headings on a page don't share an id.
  const filterId = `fx-paint-${Array.from(text).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`;
  const isHeading = /^h[1-6]$/.test(Tag);
  const slug = id ?? (isHeading ? text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "");
  const modifier = Tag === "blockquote" ? " fx-hand--quote" : "";

  const drawing = (
    <svg
      className="fx-hand__svg"
      viewBox={`${-PAD} ${-CAP - PAD} ${(width + 2 * PAD).toFixed(1)} ${height.toFixed(1)}`}
      style={{height: `calc(${size} * ${(height / CAP).toFixed(3)})`}}
      aria-hidden="true"
      focusable="false"
    >
      {paint ? (
        <defs>
          {/* Edge only: low-frequency displacement wobbles the outline
              slightly, like wet ink. The fill stays solid. */}
          <filter id={filterId} x="-5%" y="-10%" width="110%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={2} seed={7} result="edge" />
            <feDisplacementMap in="SourceGraphic" in2="edge" scale={1.2} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      ) : null}
      <g fill="currentColor" filter={paint ? `url(#${filterId})` : undefined}>
        {parts}
      </g>
    </svg>
  );

  if (Tag === "blockquote") {
    return (
      <blockquote className={`fx-hand${modifier} ${className}`.trim()}>
        <p className="sr-only">{text}</p>
        {drawing}
        {cite ? <footer className="fx-hand__cite">{cite}</footer> : null}
      </blockquote>
    );
  }

  return (
    <Tag id={slug || undefined} className={`fx-hand ${className}`.trim()}>
      <span className="sr-only">{text}</span>
      {drawing}
    </Tag>
  );
}
