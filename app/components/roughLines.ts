/**
 * Lines as a hand draws them, for the Watch projector (Projector.client.tsx):
 * ends that land a little off, sides that run past their corners, circles that
 * drift and don't quite close. Everything comes from a seeded generator, so a
 * drawing is the same on every load and no two seeds draw alike.
 */

export type Pt = [number, number];
export type Rand = () => number;

/** A repeatable random source (mulberry32): the same seed, the same drawing. */
export function seeded(seed: number): Rand {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);
const at = (p: Pt) => `${f(p[0])} ${f(p[1])}`;

type LineOptions = {
  /** How far, in drawing units, an end may land from where it was aimed. */
  jitter?: number;
  /** How far a stroke may run past each end. */
  over?: number;
};

/** One straight stroke: its ends a little off, a slight bow, some overshoot. */
export function roughLine(rand: Rand, a: Pt, b: Pt, {jitter = 0.6, over = 0}: LineOptions = {}): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const off = () => (rand() - 0.5) * 2 * jitter;
  const start: Pt = [a[0] - ux * over * rand() + off(), a[1] - uy * over * rand() + off()];
  const end: Pt = [b[0] + ux * over * rand() + off(), b[1] + uy * over * rand() + off()];
  const bow = (rand() - 0.5) * 2 * jitter * 1.3;
  const mid: Pt = [(start[0] + end[0]) / 2 - uy * bow, (start[1] + end[1]) / 2 + ux * bow];
  return `M${at(start)} Q${at(mid)} ${at(end)}`;
}

/** Strokes from point to point, each drawn on its own, so corners cross rather than meet. */
export function roughRun(rand: Rand, points: Pt[], options: LineOptions = {}): string {
  const strokes: string[] = [];
  for (let i = 0; i < points.length - 1; i++) strokes.push(roughLine(rand, points[i], points[i + 1], options));
  return strokes.join(" ");
}

/** A closed shape, side by side. */
export function roughBox(rand: Rand, corners: Pt[], options: LineOptions = {}): string {
  return roughRun(rand, [...corners, corners[0]], options);
}

/** A smooth line through points (Catmull-Rom, as cubic curves). */
export function smooth(points: Pt[]): string {
  let d = `M${at(points[0])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${at(c1)} ${at(c2)} ${at(p2)}`;
  }
  return d;
}

type LoopOptions = {
  /** How much the radius wavers, as a share of it. */
  jitter?: number;
  /** How far past its start the stroke runs, in radians. */
  overlap?: number;
};

/**
 * A circle or ellipse in one go: it starts anywhere, its radius drifts as it
 * goes round, and it runs on past where it began, so the ends cross.
 */
export function roughLoop(
  rand: Rand,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  {jitter = 0.03, overlap = 0.5}: LoopOptions = {},
): string {
  // Fewer points for a small loop, so it wavers rather than turning corners.
  const steps = Math.max(7, Math.min(22, Math.round((rx + ry) * 0.35 + 6)));
  const from = rand() * Math.PI * 2;
  const sweep = Math.PI * 2 + overlap * (0.4 + rand() * 0.6);
  const drift = (rand() - 0.5) * 2 * jitter * 1.6;
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = from + sweep * t;
    const k = 1 + drift * (t - 0.5) + (rand() - 0.5) * 2 * jitter;
    points.push([cx + Math.cos(angle) * rx * k, cy + Math.sin(angle) * ry * k]);
  }
  return smooth(points);
}
