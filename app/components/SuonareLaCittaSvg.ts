import type { Graphics, GraphicsContext } from 'pixi.js';

export function saturatedColor(hue: number): string {
  return `hsl(${hue}, 100%, 50%)`;
}

/**
 * Redraw the SVG geometry in a single color, without modifying the SVG files.
 * Graphics.fill() only colors the CURRENT path; it does not override fills from
 * the imported SVG. We therefore reuse each parsed GraphicsPath explicitly.
 *
 * NOTE: GraphicsContext.instructions is currently an @internal PixiJS v8 field.
 * Pin your PixiJS version and revisit this helper when upgrading PixiJS.
 */
export function colorizeMark(
  graphics: Graphics,
  svgContext: GraphicsContext,
  color: string,
): void {
  graphics.clear();

  for (const instruction of svgContext.instructions) {
    if (instruction.action === 'fill') {
      graphics.path(instruction.data.path).fill({
        color,
        alpha: instruction.data.style.alpha,
      });
      // Preserve holes in paths such as rings and letters.
      if (instruction.data.hole) {
        graphics.path(instruction.data.hole).cut();
      }
    } else if (instruction.action === 'stroke') {
      const style = instruction.data.style;
      graphics.path(instruction.data.path).stroke({
        color,
        alpha: style.alpha,
        width: style.width,
        alignment: style.alignment,
        cap: style.cap,
        join: style.join,
        miterLimit: style.miterLimit,
      });
      if (instruction.data.hole) {
        graphics.path(instruction.data.hole).cut();
      }
    }
  }
}

/**
 * Normalize SVG point-only paths before PixiJS parses them.
 * Some generated marks contain incomplete `d="M"` commands, which are invalid
 * SVG, and one-point round-capped strokes, which are better represented as dots.
 * This does not modify the original asset or its Python generator.
 */
function sanitizeSvgForGraphics(svgText: string): string {
  const xml = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (xml.documentElement.localName !== 'svg' || xml.querySelector('parsererror')) {
    throw new Error('Invalid SVG XML');
  }

  const number = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
  const moveOnly = new RegExp(`^\\s*[Mm]\\s*(${number})[\\s,]+(${number})\\s*$`);
  const svgNs = 'http://www.w3.org/2000/svg';

  for (const path of Array.from(xml.getElementsByTagNameNS(svgNs, 'path'))) {
    const d = path.getAttribute('d')?.trim() ?? '';

    // An M command without coordinates is malformed.
    if (!d || /^[Mm]\s*$/.test(d)) {
      path.remove();
      continue;
    }

    const point = d.match(moveOnly);
    if (!point) continue;

    // A single move-to doesn't trace a line. Recreate its round stroke cap
    // as a circle, preserving the tiny marks visible in the original SVG.
    const strokeWidth = Number.parseFloat(path.getAttribute('stroke-width') ?? '1');
    if (!(strokeWidth > 0) || path.getAttribute('stroke-linecap') !== 'round') {
      path.remove();
      continue;
    }

    const circle = xml.createElementNS(svgNs, 'circle');
    circle.setAttribute('cx', point[1]);
    circle.setAttribute('cy', point[2]);
    circle.setAttribute('r', String(strokeWidth / 2));
    circle.setAttribute('fill', path.getAttribute('stroke') ?? '#000');

    for (const attribute of ['opacity', 'transform', 'visibility', 'id', 'class']) {
      const value = path.getAttribute(attribute);
      if (value !== null) circle.setAttribute(attribute, value);
    }
    const strokeOpacity = path.getAttribute('stroke-opacity');
    if (strokeOpacity !== null) circle.setAttribute('fill-opacity', strokeOpacity);

    path.parentNode?.replaceChild(circle, path);
  }

  return new XMLSerializer().serializeToString(xml.documentElement);
}

/**
 * Parsing an SVG string with GraphicsContext.svg() avoids re-uploading the
 * cleaned asset and keeps the geometry vector-based. PixiJS documents this API.
 */
export async function loadSafeSvgGraphicsContext(url: string): Promise<GraphicsContext> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`SVG request failed (${response.status}): ${url}`);

  const svgText = sanitizeSvgForGraphics(await response.text());
  const { GraphicsContext } = await import('pixi.js');
  return new GraphicsContext().svg(svgText);
}
