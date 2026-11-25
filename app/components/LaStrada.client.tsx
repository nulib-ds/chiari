import {withBasePath} from "@nulib/canopy/base-path";
import {Timeline, chaptersOf, initCloverI18n} from "./clover";
import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";

/**
 * La strada (Giuseppe Chiari, 1964) as something to play with. The typescript
 * is shown whole; on Clear its actions fall off the sheet, and the visitor
 * puts them back anywhere, in whatever order, then has them performed.
 *
 * Everything comes from a IIIF Presentation 3 manifest (see
 * app/scripts/la-strada): canvas 1 is the sheet, canvas 2 the same sheet with
 * its actions erased, canvas 3 the actions' type alone on transparency (what
 * a slip becomes once it has left the paper), and each action is an
 * annotation on canvas 1 whose target is a place and a time, xywh=...&t=...:
 * the region is the slip that falls, and the time is when it comes. The sheet
 * is the clock. The canvas lasts the piece's duration (the score's 30'), the
 * typed area runs from 0 at its top to the end at its bottom, and so wherever
 * a slip is put it has a time, and a performance walks the sheet in the order
 * of those times. The original order is the order of the manifest's own times:
 * Original puts every action back where it was typed, Clear lets them fall,
 * and Shuffle lays them on the sheet at random. Original and Shuffle play their
 * arrangement when pressed; Clear leaves nothing on the sheet to play, and
 * pressed again plays what has been put back. Each says Stop while it plays.
 * The annotation's Sound bodies are what is performed, one after another, and a
 * Choice among them offers takes of which one is played; its text is what a
 * screen reader says of the slip when it is reached, and nothing else says it
 * aloud. An action with no sound keeps its time in silence. Annotations on the page whose id
 * ends in /frame (the instructions and title) stay on the sheet.
 *
 * <LaStrada manifest="/la-strada/manifest.json" />
 *
 * Things snap to the typewriter's grid. The manifest carries it as a service on
 * the canvas (see app/scripts/la-strada): the width of a character, the height
 * of a line, and the tilt of the typing in the scan, measured from the typing
 * itself. Slips are cut on the grid, and settle on a column and a line; the
 * arrow keys move a slip a tab stop along (a column, if the manifest names
 * none) or a line up or down. Type never lands on type: a slip put down over
 * another, or over the title and instructions, goes to the nearest place on the
 * grid that is clear, and one moved by the keys into another slides on past it
 * to the next clear place that way.
 *
 * The arrangement is recomposed as a manifest of its own whenever it changes,
 * and Clover 4's Timeline (via ./clover) loads that manifest and plays it: it is
 * the seek bar, fixed along the foot of the window. The manifest's first item
 * is the performance: a Canvas of sound alone (a Timeline, to Presentation 4 and
 * to Clover) on which the actions' recordings are painted end to end, in the
 * order of the times where their slips stand. The sheet's clock gives the order
 * and no more: the silences it would leave between the actions are left out, so
 * a performance lasts as long as it sounds, not the score's 30'. Its
 * `structures` say what the performance is made of: a Range for every action,
 * naming its time in the performance and its place on the sheet. Clover reads
 * the Ranges as chapters, so the seek bar marks each action and names it under
 * the pointer, and plays the recordings one after another as one. While a slip
 * is carried the bar already shows the chapters of the manifest as it would be,
 * the slip's own marked out, so where it would land is seen before it is put
 * down. Only what stands on the sheet is in the manifest and on the bar: an
 * action on the floor is in neither, and with the sheet clear the bar is empty.
 *
 * The arrangement is itself a IIIF annotation page, rebuilt from where things
 * stand every time one moves: the same annotations, in the order of their
 * times, each with a new target (xywh=...&t=...) where it now is. It can be
 * downloaded or copied, and is also announced as a "la-strada:arrangement"
 * event on the section, with the page as the event's detail, and as a
 * "la-strada:manifest" event with the recomposed manifest that carries it
 * (which LaStradaDebug.client.tsx shows in Clover's viewer).
 *
 * Positions are kept in page-width units (the sheet is 100 wide) and drawn
 * with container units, so the board scales with its container and nothing
 * needs measuring except while dragging. Styles: app/styles/la-strada.css.
 */

const LABELS = {
  clear: "Clear",
  stop: "Stop",
  play: "Play",
  pause: "Pause",
  original: "Original",
  reset: "Reset",
  shuffle: "Shuffle",
  intro: "A typescript sent to George Maciunas, 1964. Drag a line, or move it with the arrow keys.",
  fallen: "Drag them onto the sheet, then press play.",
  arranged: "In a new order. Move them as you like.",
  silent: "silence",
  performed: "performed",
  by: "by",
  manifest: "Manifest",
  source: "Source",
  rights: "Rights",
  transcription: "Transcription",
  extract: "The order you have made: an IIIF annotation page, or a manifest with the same actions as chapters.",
  download: "Download",
  copy: "Copy",
  copied: "Copied",
  annotationPage: "Annotation page",
  failed: "The score could not be loaded.",
};
type Labels = typeof LABELS;

/**
 * A recording: where the manifest names it, where this site serves it, its format and
 * how long it lasts, in seconds, as the manifest says.
 */
type Take = {id: string; src: string; format?: string; duration: number};

type Piece = {
  id: string;
  text: string;
  /** Seconds of silence to perform in place of a recording, when the action is silent. */
  silent?: number;
  /** How long it is heard for, in seconds: its recordings end to end, its silence, or its saying. */
  length: number;
  /** Its recordings, when the manifest has any: parts played one after another, each a list of takes to choose from. */
  sounds: Take[][];
  /** When it comes in the original, and when it ends, in seconds on the piece's clock. */
  start: number;
  end: number;
  /** The annotation it came from, to be given a new target when it moves. */
  note: any;
  /** Where it sits on the sheet, and its size. */
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * The typewriter's grid, in page widths. Columns run along the typing and lines
 * across it, which may be tilted a little in a scan: u = x + skew*y runs
 * along a line and v = y - skew*x across, and a slip's corner stands where
 * (u0 + column*char, v0 + line*height) says.
 */
type Grid = {char: number; line: number; skew: number; u0: number; v0: number; tab?: number};

type Mode = "original" | "fallen" | "shuffled";

type Place = {x: number; y: number; z: number; delay: number; dur: number};
type Places = Record<string, Place>;
type Phase = "intact" | "falling" | "free" | "rising" | "shuffling";

type Score = {
  /** The manifest as it was loaded, for making others like it. */
  manifest: any;
  /** Where this site serves what the manifest names: its images and sounds. */
  rebase: (url: string) => string;
  image: string;
  ground: string;
  /** The actions' type alone, on transparency; what a slip is off the paper. */
  ink: string;
  /** Height of the sheet in page-width units. */
  pageH: number;
  /** Length of the piece in seconds. */
  duration: number;
  /** The sheet's canvas, its size in canvas units, and the manifest's address, which new ids hang from. */
  canvas: string;
  width: number;
  base: string;
  /** Top and bottom of the typed area, the clock's face, in page-width units. */
  span: [number, number];
  grid: Grid;
  /** What the caption under the sheet says, from the manifest's own metadata. */
  credit: {title: string; link?: string; creator?: string; date?: string; source?: string; sourceLink?: string; rights?: string};
  actions: Piece[];
  frame: Piece[];
};

/**
 * Room under the sheet for the fallen actions. It is more than any scattering
 * of these actions has needed, so the board never grows when they fall.
 */
const FLOOR = 62;

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

const purposes = (body: any): string[] => [].concat(body.purpose ?? []);

function region(target: any): number[] | null {
  const raw = typeof target === "string" ? target : target?.selector?.value ?? "";
  const match = /xywh=(\d+),(\d+),(\d+),(\d+)/.exec(raw);
  return match ? match.slice(1).map(Number) : null;
}

/** When an annotation's target says it is: t=start,end, in seconds. */
function seconds(target: any): number[] {
  const raw = typeof target === "string" ? target : target?.selector?.value ?? "";
  const match = /t=([\d.]+),([\d.]+)/.exec(raw);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

/** One line to say aloud: line breaks become pauses. */
const sayable = (text: string) =>
  text.replace(/([^.!?,;:])\s*\n\s*/g, "$1, ").replace(/\s*\n\s*/g, " ");

function readScore(manifest: any, rebase: (url: string) => string): Score {
  const [sheet, bare = sheet, typed = sheet] = manifest.items;
  const paint = (canvas: any) => rebase(canvas.items[0].items[0].body.id);
  const unit = 100 / sheet.width;
  const pieces = (pages: any[]): Piece[] =>
    pages.flatMap((page) =>
      (page.items ?? []).flatMap((note: any) => {
        const box = region(note.target);
        const bodies: any[] = [].concat(note.body ?? []);
        const typed = bodies.filter((b) => b.type === "TextualBody");
        const shown = typed.find((b) => !purposes(b).some((p) => p === "speech" || p === "silence")) ?? typed[0];
        if (!box || !shown) return [];
        const spoken = typed.find((b) => purposes(b).includes("speech")) ?? shown;
        const silent = Number(typed.find((b) => purposes(b).includes("silence"))?.value) || undefined;
        // A part lasts as long as its longest take, as the manifest gives each Sound's duration.
        const takes = (b: any): any[] => (b.type === "Choice" ? (b.items ?? []) : b.type === "Sound" ? [b] : []);
        const recorded = bodies
          .map((b) => Math.max(0, ...takes(b).map((t) => Number(t.duration) || 0)))
          .filter((seconds, i) => takes(bodies[i]).length)
          .reduce((sum, seconds) => sum + seconds, 0);
        // A Sound is a part; a Choice is a part to take one of the Sounds of.
        const take = (b: any): Take => ({id: b.id, src: rebase(b.id), format: b.format, duration: Number(b.duration) || 0});
        const sounds = bodies
          .flatMap((b) =>
            b.type === "Sound"
              ? [[take(b)]]
              : b.type === "Choice"
                ? [(b.items ?? []).filter((i: any) => i.type === "Sound").map(take)]
                : []
          )
          .filter((part) => part.length);
        const [start, end] = seconds(note.target);
        const [x, y, w, h] = box.map((v) => v * unit);
        return [
          {
            id: String(note.id).split("/").pop() as string,
            text: shown.value,
            note,
            silent,
            length: silent ?? (recorded || reading(sayable(spoken.value)) / 1000),
            sounds,
            start,
            end,
            x, y, w, h,
          },
        ];
      })
    );
  const pages: any[] = sheet.annotations ?? [];
  const isFrame = (page: any) => /frame$/.test(page.id);
  const actions = pieces(pages.filter((p) => !isFrame(p)));
  const service = [].concat(sheet.service ?? []).find((s: any) => s.type === "TypewriterGrid") as any;
  // Without a measured grid, a plain one from the first actions' corner.
  const grid: Grid = service
    ? {
        char: service.characterWidth * unit,
        line: service.lineHeight * unit,
        skew: service.skew ?? 0,
        u0: service.originX * unit,
        v0: service.originY * unit,
        tab: service.tab,
      }
    : {char: 0.71, line: 1.5, skew: 0, u0: Math.min(...actions.map((p) => p.x)), v0: Math.min(...actions.map((p) => p.y))};
  const said = (map: any): string | undefined => (map ? (Object.values(map).flat() as string[])[0] : undefined);
  const field = (label: string) =>
    said(((manifest.metadata ?? []) as any[]).find((m) => said(m.label)?.toLowerCase() === label.toLowerCase())?.value);
  const home = ([] as any[]).concat(manifest.homepage ?? [])[0];
  const provider = ([] as any[]).concat(manifest.provider ?? [])[0];
  return {
    manifest,
    rebase,
    image: paint(sheet),
    ground: paint(bare),
    ink: paint(typed),
    pageH: sheet.height * unit,
    duration: sheet.duration ?? 0,
    canvas: sheet.id,
    width: sheet.width,
    base: String(manifest.id).replace(/[^/]*$/, ""),
    span: [Math.min(...actions.map((p) => p.y)), Math.max(...actions.map((p) => p.y + p.h))],
    grid,
    credit: {
      title: said(home?.label) ?? said(manifest.label) ?? "",
      link: home && rebase(home.id),
      creator: field("Creator"),
      date: field("Date"),
      source: said(provider?.label),
      sourceLink: provider?.id,
      rights: manifest.rights,
    },
    actions,
    frame: pieces(pages.filter(isFrame)),
  };
}

/**
 * Resources a manifest names under its own address are served from wherever
 * this site is deployed, so follow the manifest rather than its ids. That
 * keeps one manifest working on localhost, on Pages and under a base path.
 */
export function rebaser(manifest: any, fetched: string) {
  const own = String(manifest.id).replace(/[^/]*$/, "");
  const here = fetched.replace(/[^/]*$/, "");
  // The site the manifest sits in, too, so a link to a page of it works wherever it is.
  const site = own.replace(/[^/]+\/$/, "");
  const there = here.replace(/[^/]+\/$/, "");
  return (url: string) =>
    url.startsWith(own) ? here + url.slice(own.length) : url.startsWith(site) ? there + url.slice(site.length) : url;
}

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

/**
 * A sound in progress: `done` settles when it ends, or at once if stopped. It
 * can be paused and resumed; `done` waits while it is paused.
 */
type Playing = {done: Promise<void>; stop: () => void; pause: () => void; resume: () => void; progress: () => number};
type Controls = {stop?: () => void; pause?: () => void; resume?: () => void; progress?: () => number};

function sounding(begin: (end: () => void) => Controls | void): Playing {
  let end = () => {};
  const done = new Promise<void>((resolve) => (end = resolve));
  const controls = begin(end) || {};
  return {
    done,
    stop: () => {
      controls.stop?.();
      end();
    },
    pause: () => controls.pause?.(),
    resume: () => controls.resume?.(),
    // How far through it is, from 0 to 1.
    progress: () => Math.min(1, Math.max(0, controls.progress?.() ?? 0)),
  };
}

/** A timer that can be paused, keeping what it had left. */
function countdown(ms: number, then: () => void) {
  let left = ms;
  let since = Date.now();
  let running = true;
  let timer = window.setTimeout(then, left);
  return {
    stop: () => window.clearTimeout(timer),
    pause: () => {
      window.clearTimeout(timer);
      left -= Date.now() - since;
      running = false;
    },
    resume: () => {
      since = Date.now();
      running = true;
      timer = window.setTimeout(then, Math.max(0, left));
    },
    /** How long it has run, pauses left out. */
    spent: () => ms - (running ? left - (Date.now() - since) : left),
  };
}

/** About how long an action takes to say, in milliseconds: the time one without a sound keeps. */
const reading = (speech: string) => 900 + speech.length * 70;

function recording(url: string): Playing {
  return sounding((end) => {
    const audio = new Audio(url);
    audio.onended = () => end();
    audio.onerror = () => end();
    audio.play().catch(() => end());
    return {
      stop: () => audio.pause(),
      pause: () => audio.pause(),
      resume: () => void audio.play().catch(() => end()),
      progress: () => (audio.duration ? audio.currentTime / audio.duration : 0),
    };
  });
}

/** Sounds one after another, each starting when the one before has ended. */
function sequence(steps: (() => Playing)[], gap = 600): Playing {
  return sounding((end) => {
    let current: Playing | null = null;
    let live = true;
    let at = 0;
    const hold = holding();
    (async () => {
      for (let i = 0; live && i < steps.length; i++) {
        await hold.passed();
        if (!live) break;
        at = i;
        current = steps[i]();
        await current.done;
        if (live && i < steps.length - 1) await wait(gap);
      }
      end();
    })();
    return {
      stop: () => {
        live = false;
        current?.stop();
        hold.release();
      },
      pause: () => {
        hold.hold();
        current?.pause();
      },
      resume: () => {
        current?.resume();
        hold.release();
      },
      progress: () => (at + (current?.progress() ?? 0)) / steps.length,
    };
  });
}

/** Silence, for as long as the score gives it. */
function hush(seconds: number): Playing {
  return sounding((end) => {
    const quiet = countdown(seconds * 1000, end);
    return {...quiet, progress: () => quiet.spent() / (seconds * 1000)};
  });
}

/** A gate a run of sounds waits at while it is paused. */
function holding() {
  let held = false;
  let release = () => {};
  return {
    hold: () => {
      held = true;
    },
    release: () => {
      held = false;
      release();
    },
    passed: () => new Promise<void>((resolve) => (held ? (release = resolve) : resolve())),
    get held() {
      return held;
    },
  };
}

const isPerformed = (piece: Piece) => piece.sounds.length > 0;

/** The take last heard in each part of each action, so that an action never repeats itself. */
const lastTake = new Map<string, number>();

function play(piece: Piece): Playing {
  if (piece.silent || !piece.sounds.length) return hush(piece.length);
  // The parts come one after another; of the takes in a part, any but the one just heard.
  return sequence(
    piece.sounds.map((takes, part) => () => {
      const key = `${piece.id}:${part}`;
      const others = takes.map((_, i) => i).filter((i) => i !== lastTake.get(key));
      const take = others.length ? others[Math.floor(Math.random() * others.length)] : 0;
      lastTake.set(key, take);
      return recording(takes[take].src);
    })
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * How far into its cell, in characters, a typed letter's ink begins: a slip is cut
 * on the typewriter's grid, so its type starts this far in from its left edge.
 */
const BEARING = 0.1;

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/** The sheet is the clock: how far down the typed area a line stands is when it comes. */
function timeAt(score: Score, y: number): number {
  const [top, bottom] = score.span;
  return score.duration * Math.min(Math.max((y - top) / (bottom - top), 0), 1);
}

/** Where on the sheet a time falls. */
function yAt(score: Score, seconds: number): number {
  const [top, bottom] = score.span;
  return top + (seconds / score.duration) * (bottom - top);
}

/** The order of time: when a line comes, then how far down it stands, then how far across. */
const inTime = (score: Score, at: (p: Piece) => {x: number; y: number}) => (a: Piece, b: Piece) =>
  timeAt(score, at(a).y) - timeAt(score, at(b).y) || at(a).y - at(b).y || at(a).x - at(b).x;

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/** Where a column and a line of the grid put a slip's corner. */
function cell(grid: Grid, column: number, line: number): {x: number; y: number} {
  const u = grid.u0 + column * grid.char;
  const v = grid.v0 + line * grid.line;
  const s = grid.skew;
  return {x: (u - s * v) / (1 + s * s), y: (v + s * u) / (1 + s * s)};
}

/** The column and line a position is nearest to, counting a tab stop as one column if there is one. */
function nearest(grid: Grid, x: number, y: number): {column: number; line: number} {
  const u = x + grid.skew * y;
  const v = y - grid.skew * x;
  const stride = grid.tab || 1;
  return {column: Math.round((u - grid.u0) / (grid.char * stride)) * stride, line: Math.round((v - grid.v0) / grid.line)};
}

/** A position, settled onto the grid. */
function snap(grid: Grid, x: number, y: number): {x: number; y: number} {
  const {column, line} = nearest(grid, x, y);
  return cell(grid, column, line);
}

/** A position, moved by whole columns (tab stops, if there are any) and lines. */
function nudge(grid: Grid, x: number, y: number, columns: number, lines: number): {x: number; y: number} {
  const at = nearest(grid, x, y);
  return cell(grid, at.column + columns * (grid.tab || 1), at.line + lines);
}

/** Whether two slips' type would overlap, allowing the half a character or line the scan's tilt may cost. */
function overlaps(grid: Grid, a: {x: number; y: number; w: number; h: number}, b: {x: number; y: number; w: number; h: number}) {
  const ex = grid.char / 2;
  const ey = grid.line / 2;
  return a.x < b.x + b.w - ex && b.x < a.x + a.w - ex && a.y < b.y + b.h - ey && b.y < a.y + a.h - ey;
}

/** The actions standing on the sheet, in the order of the times where they stand. */
function arrangement(score: Score, places: Places): Piece[] {
  return score.actions
    .filter((p) => {
      const x = places[p.id].x + p.w / 2;
      const y = places[p.id].y + p.h / 2;
      return x >= 0 && x <= 100 && y >= 0 && y <= score.pageH;
    })
    .sort(inTime(score, (p) => places[p.id]));
}

/** An action as it now stands: where and when, written as a IIIF target (xywh=...&t=...). */
type Placed = {piece: Piece; target: string};

/**
 * Where and when each action on the sheet now is, in the order of time. The
 * annotations and the chapters are both made from this one list, so they cannot
 * disagree. An action runs as long as it did in the original and no further
 * than the end of the piece.
 */
function placed(score: Score, places: Places): Placed[] {
  const unit = score.width / 100;
  return arrangement(score, places).map((piece) => {
    const at = places[piece.id];
    const start = timeAt(score, at.y);
    const end = Math.min(start + (piece.end - piece.start), score.duration);
    const [x, y, w, h] = [at.x, at.y, piece.w, piece.h].map((v) => Math.round(v * unit));
    return {piece, target: `${score.canvas}#xywh=${x},${y},${w},${h}&t=${start.toFixed(1)},${end.toFixed(1)}`};
  });
}

const arrangementId = (score: Score, session: string) => `${score.base}arrangement/${session}`;

/** The performance's canvas, of sound alone: a Timeline, to Presentation 4 and to Clover. */
const performanceId = (score: Score, session: string) => `${arrangementId(score, session)}/canvas/performance`;

/** The Range that is an action's chapter. */
const rangeId = (score: Score, session: string, id: string) => `${arrangementId(score, session)}/range/${id}`;

/**
 * The arrangement as an ordered IIIF annotation page, built afresh from where
 * everything stands. Each action keeps its text and sounds and takes a new target.
 */
function annotationPage(score: Score, items: Placed[], session: string) {
  const page = arrangementId(score, session);
  return {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: `${page}.json`,
    type: "AnnotationPage",
    label: {en: ["La strada, in the order made"]},
    items: items.map(({piece, target}) => ({...piece.note, id: `${page}/annotation/${piece.id}`, target})),
  };
}

// ---------------------------------------------------------------------------
// The performance
// ---------------------------------------------------------------------------

/** Which take is heard of each part that has several, by `${action}:${part}`. */
type Takes = Record<string, number>;

/** A recording as it is performed: which, and from when to when on the piece's clock. */
type Sounded = {take: Take; start: number; end: number};

/** An action as it is performed: when it comes, when it ends, and its recordings in turn. */
type Performed = {piece: Piece; start: number; end: number; sounds: Sounded[]};

/**
 * An arrangement, performed: its actions in turn, how long it all lasts, and a key
 * that is the same for the same performance.
 */
type Performance = {actions: Performed[]; duration: number; key: string};

/** A time to the hundredth of a second, as the manifest gives its recordings' lengths. */
const cent = (seconds: number) => Math.round(seconds * 100) / 100;

/** How long a recording is taken to last where the manifest does not say, so the next can follow it. */
const UNSAID = 5;

/** A short name for a text, the same for the same text. */
function named(text: string): string {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/** A take of each part that has several: any of them, or any but the one `before` had. */
function draw(score: Score, before: Takes = {}): Takes {
  const takes: Takes = {};
  for (const piece of score.actions) {
    piece.sounds.forEach((part, i) => {
      if (part.length < 2) return;
      const key = `${piece.id}:${i}`;
      const others = part.map((_, n) => n).filter((n) => n !== before[key]);
      takes[key] = others[Math.floor(Math.random() * others.length)];
    });
  }
  return takes;
}

/**
 * The arrangement, performed: the actions on the sheet, in the order of the times
 * where they stand, each as long as its recordings, end to end, each coming as the
 * one before it ends. The sheet's clock gives the order and no more: the silences
 * it would leave between the actions are left out, so a performance lasts as long as
 * it sounds, not the score's 30'. Only what stands on the sheet is performed: with
 * the sheet clear there is nothing to play.
 */
function perform(score: Score, places: Places, takes: Takes): Performance {
  let at = 0; // where the performance has got to
  const actions = arrangement(score, places).map((piece): Performed => {
    const start = at;
    const sounds = (piece.silent ? [] : piece.sounds).map((part, i): Sounded => {
      const take = part[takes[`${piece.id}:${i}`] ?? 0] ?? part[0];
      const from = at;
      at = cent(from + (take.duration || UNSAID));
      return {take, start: from, end: at};
    });
    // An action with no recording keeps its time in silence.
    if (!sounds.length) at = cent(start + piece.length);
    return {piece, start, end: at, sounds};
  });
  const heard = actions.map((a) => `${a.piece.id}${a.sounds.map((s) => `+${s.take.id.split("/").pop()}`).join("")}`);
  return {actions, duration: at, key: named(heard.join("|"))};
}

/**
 * The performance as a canvas of sound alone, as long as the performance: each
 * recording painted on its time, one after another. Presentation 4 calls such a
 * canvas a Timeline, and Clover plays its recordings as one.
 */
function performanceCanvas(score: Score, performance: Performance, session: string) {
  const id = performanceId(score, session);
  const [sheet] = score.manifest.items;
  return {
    id,
    type: "Canvas",
    label: sheet.label ?? score.manifest.label,
    duration: performance.duration,
    items: [
      {
        id: `${id}/page`,
        type: "AnnotationPage",
        items: performance.actions.flatMap(({piece, sounds}) =>
          sounds.map(({take, start, end}, part) => ({
            id: `${id}/painting/${piece.id}${sounds.length > 1 ? `/${part + 1}` : ""}`,
            type: "Annotation",
            motivation: "painting",
            body: {
              id: take.id,
              type: "Sound",
              ...(take.format ? {format: take.format} : {}),
              ...(take.duration ? {duration: take.duration} : {}),
            },
            // Written out as a selector, not as a fragment on the canvas's id: the
            // chapters' Ranges name the same stretches by such ids, and an upgrade to
            // Presentation 4 (@iiif/parser's, which Clover uses) then reads a target
            // of the same id as that Range item and loses its time.
            target: {
              type: "SpecificResource",
              source: {id, type: "Canvas"},
              selector: {type: "FragmentSelector", conformsTo: "http://www.w3.org/TR/media-frags/", value: `t=${start},${end}`},
            },
          }))
        ),
      },
    ],
  };
}

/**
 * What the performance is made of, as chapters: a Range for each action that names its
 * time in the performance and, if it stands on the sheet, its place there, so a viewer
 * lists the actions, marks them on the timeline and plays from them. Its label is the
 * action as it was typed, its lines broken where the typescript breaks them, which
 * the seek bar's popover keeps (app/styles/la-strada.css).
 */
function chapterRanges(score: Score, items: Placed[], performance: Performance, session: string) {
  const sound = performanceId(score, session);
  const where = new Map(items.map(({piece, target}) => [piece.id, target]));
  return performance.actions.map(({piece, start, end}) => ({
    id: rangeId(score, session, piece.id),
    type: "Range",
    label: {en: [piece.text]},
    items: [
      {id: `${sound}#t=${start},${end}`, type: "Canvas"},
      ...(where.has(piece.id) ? [{id: where.get(piece.id), type: "Canvas"}] : []),
    ],
  }));
}

/**
 * The arrangement, recomposed as a manifest for a viewer to open: the performance
 * first, then the sheet with the arrangement as its annotations, and the chapters of
 * both as its structures. With the sheet clear there is no performance, and the
 * manifest has neither it nor chapters.
 */
function arrangementManifest(score: Score, items: Placed[], performance: Performance, session: string) {
  const page = arrangementId(score, session);
  const [sheet, ...rest] = score.manifest.items;
  const frame = (sheet.annotations ?? []).filter((p: any) => /frame$/.test(p.id));
  const performed = performance.actions.length > 0;
  const {structures: typed, ...manifest} = score.manifest;
  return {
    ...manifest,
    id: `${page}/manifest.json`,
    label: {en: ["La strada, in the order made"]},
    items: [
      ...(performed ? [performanceCanvas(score, performance, session)] : []),
      {...sheet, annotations: [annotationPage(score, items, session), ...frame]},
      ...rest,
    ],
    ...(performed && {
      structures: [
        {
          id: `${page}/range/score`,
          type: "Range",
          label: {en: [score.manifest.label?.en?.[0] ?? "La strada"]},
          items: chapterRanges(score, items, performance, session),
        },
      ],
    }),
  };
}

/**
 * A manifest for this page to show or play. Its images and sounds are named where the
 * site is published, and are given from wherever this page is served, as the exhibit's
 * own are; the ids that only name things stay as they are.
 */
export function localise(value: any, rebase: (url: string) => string): any {
  if (Array.isArray(value)) return value.map((v) => localise(v, rebase));
  if (!value || typeof value !== "object") return value;
  const out: any = {};
  for (const [key, v] of Object.entries(value)) out[key] = localise(v, rebase);
  if (["Image", "Sound", "Video"].includes(value.type) && typeof value.id === "string") out.id = rebase(value.id);
  return out;
}

// ---------------------------------------------------------------------------
// Where things fall
// ---------------------------------------------------------------------------

const between = (low: number, high: number) => low + Math.random() * (high - low);

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every action where it was typed. */
function origin(score: Score, delay = 0, dur = 0): Places {
  const places: Places = {};
  for (const p of score.actions) {
    places[p.id] = {x: p.x, y: p.y, z: 1, delay: between(0, delay), dur};
  }
  return places;
}

/** Strew the actions over the floor in rows, in no order, as upright as they were typed. */
function scatter(score: Score, z: number): {places: Places; floor: number} {
  const places: Places = {};
  let x = 2;
  let y = score.pageH + 4;
  let row = 0;
  for (const p of shuffled(score.actions)) {
    if (x + p.w > 98) {
      x = 2;
      y += row + 2.4;
      row = 0;
    }
    places[p.id] = {
      x: x + between(0, 1.2),
      y: y + between(0, 0.8),
      z: z++,
      // The lower the line sat on the sheet, the sooner it lets go.
      delay: (1 - p.y / score.pageH) * 700 + between(0, 500),
      dur: between(900, 1300),
    };
    x += p.w + 2.2;
    row = Math.max(row, p.h);
  }
  return {places, floor: Math.max(FLOOR, y + row + 4 - score.pageH)};
}

/**
 * Lay every action on the sheet in a random order, as it would have been
 * typed: on lines of its own, indented any number of spaces (or tab stops, if
 * Chiari had any), with blank lines left here and there, all on the
 * typewriter's grid and within the margins and extent the original actions
 * kept to. Reading order is the order of performance, so the order is made
 * first and the placing follows from it.
 */
function arrange(score: Score, z: number): Places {
  const {grid} = score;
  const stride = grid.tab || 1;
  const actions = shuffled(score.actions);
  const left = Math.min(...score.actions.map((p) => p.x));
  const right = Math.max(...score.actions.map((p) => p.x + p.w));
  const top = Math.min(...score.actions.map((p) => p.y));
  const bottom = Math.max(...score.actions.map((p) => p.y + p.h));
  // A slip is cut a whole number of lines high, which is how many it was typed on
  // (its text may wrap otherwise).
  const lines = (p: Piece) => Math.max(1, Math.round(p.h / grid.line));
  const spare = Math.max(0, Math.floor((bottom - top) / grid.line) - actions.reduce((n, p) => n + lines(p), 0));
  // Each spare line goes to a place picked at random, so blanks come singly
  // and in runs, as they do on the page.
  const blank = new Array(actions.length + 1).fill(0);
  for (let i = 0; i < spare; i++) blank[Math.floor(Math.random() * blank.length)]++;
  const places: Places = {};
  let line = 0;
  actions.forEach((p, i) => {
    line += blank[i];
    const room = Math.max(0, Math.floor((right - left - p.w) / (grid.char * stride)));
    const at = cell(grid, Math.floor(between(0, room + 1)) * stride, line);
    places[p.id] = {x: at.x, y: at.y, z: z++, delay: between(0, 500), dur: between(800, 1100)};
    line += lines(p);
  });
  return places;
}

const settles = (places: Places) =>
  Math.max(...Object.values(places).map((p) => p.delay + p.dur)) + 150;

// ---------------------------------------------------------------------------
// The marker
// ---------------------------------------------------------------------------

type Point = [number, number];

/** A stream of random numbers that is the same for the same text, so a line is drawn the same way every time. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Points along a straight line from a to b, a few pixels apart: close enough for
 * the marker to bend smoothly where the line turns, far enough apart for its rough
 * edge to be its texture rather than noise.
 */
function straight(a: Point, b: Point): Point[] {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
  return Array.from({length: n + 1}, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
}

/** Points along a cubic curve from a to d. */
function curve(a: Point, b: Point, c: Point, d: Point, n: number): Point[] {
  return Array.from({length: n + 1}, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [k[0] * a[0] + k[1] * b[0] + k[2] * c[0] + k[3] * d[0], k[0] * a[1] + k[1] * b[1] + k[2] * c[1] + k[3] * d[1]];
  });
}

/**
 * Points along straight runs from point to point, turning at each point between
 * round a short curve, as a hand turns, rather than at a sharp corner. A turn begins
 * `round` pixels before its point and ends as far after it, or less where a run is short.
 */
function rounded(points: Point[], round: number): Point[] {
  const run = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const toward = (a: Point, b: Point, d: number): Point => [a[0] + ((b[0] - a[0]) * d) / (run(a, b) || 1), a[1] + ((b[1] - a[1]) * d) / (run(a, b) || 1)];
  const path: Point[] = [points[0]];
  let from = points[0];
  points.slice(1, -1).forEach((at, i) => {
    const [before, after] = [points[i], points[i + 2]];
    const r = Math.min(round, run(before, at) / 2, run(at, after) / 2);
    const [enter, leave] = [toward(at, before, r), toward(at, after, r)];
    // The cubic that is the quadratic curve from enter to leave, bending toward the point.
    const pull = (p: Point): Point => [p[0] + ((at[0] - p[0]) * 2) / 3, p[1] + ((at[1] - p[1]) * 2) / 3];
    path.push(...straight(from, enter).slice(1), ...curve(enter, pull(enter), pull(leave), leave, Math.max(4, Math.round(r / 2))).slice(1));
    from = leave;
  });
  path.push(...straight(from, points[points.length - 1]).slice(1));
  // No point twice, where a run was too short to leave any of it straight.
  return path.filter((p, i) => i === 0 || run(path[i - 1], p) > 0.5);
}

/**
 * A curly brace as a hand draws one, as the middle line of its stroke: its point at
 * `tip`, about `height` tall and no wider than `width`, curling right at both ends.
 * It has the general shape of a brace and is never exactly one: its halves are of
 * different lengths, their backs bowed and the whole leaning a little, its ends
 * curled more or less, and each brace differently, as `random` has it.
 */
function brace(tip: Point, height: number, width: number, n: number, random: () => number): Point[] {
  const between = (lo: number, hi: number) => lo + (hi - lo) * random();
  const sharp = between(0.12, 0.34); // how much of each half the point takes
  const back = between(0.35, 0.65); // how far the back stands from the point, as a part of the width
  const lean = between(-0.25, 0.25); // how far the ends lean across, as a part of the width
  const halves = [0, 1].map(() => ({
    long: between(0.82, 1.16), // the half's length, as a part of half the height
    from: between(0.55, 0.82), // how far along it its end begins to curl
    curl: between(0.25, 0.75), // how far its end curls, as a part of the width
    // How far its back bows, as a part of the width: either way, but never back past the point.
    bow: between(Math.max(-0.3, 0.1 + Math.abs(lean) - back), 0.3),
  }));
  const points = Array.from({length: n + 1}, (_, i): Point => {
    const s = (i / n) * 2 - 1;
    const a = Math.abs(s);
    const half = halves[s < 0 ? 0 : 1];
    const point = a < sharp ? (1 - a / sharp) ** 2 : 0;
    const curl = a > half.from ? ((a - half.from) / (1 - half.from)) ** 2 : 0;
    const bow = a > sharp && a < half.from ? Math.sin((Math.PI * (a - sharp)) / (half.from - sharp)) ** 2 : 0;
    return [back * (1 - point) + half.curl * curl + half.bow * bow + lean * s, (s * half.long) / 2];
  });
  // No wider than the room it has, and its point still where the line meets it.
  const fit = Math.min(1, 1 / Math.max(...points.map(([x]) => x)));
  return points.map(([x, y]) => [tip[0] + x * fit * width, tip[1] + y * height]);
}

/**
 * A marker stroke along a line of points, as the outline of its ink: fuller in the
 * middle than where the pen came down and where it lifted, swelling and thinning a
 * little as the hand presses, its course not quite steady and its edges a little
 * rough, as a hand draws it. A `pinned` stroke is steady where the pen comes down
 * and where it lifts, so that it starts and ends exactly at its first and last points.
 */
function marker(points: Point[], width: number, random: () => number, pinned = false): string {
  // A few slow waves of random phase, for the hand's unsteadiness.
  const waves = (amount: number) => {
    const parts = [1, 2, 3].map((k) => [(amount * (random() - 0.5)) / k, random() * 2 * Math.PI, k]);
    return (t: number) => parts.reduce((sum, [a, phase, k]) => sum + a * Math.sin(2 * Math.PI * k * t + phase), 0);
  };
  const last = points.length - 1;
  const length = points.slice(1).reduce((sum, [x, y], i) => sum + Math.hypot(x - points[i][0], y - points[i][1]), 0);
  // Unsteady by less than the stroke is wide, and by little of a short one, so a small brace stays a brace.
  const drift = waves(Math.min(width * 0.9, length * 0.025));
  const settle = (t: number) => (pinned ? Math.min(1, (t * length) / 40, ((1 - t) * length) / 20) : 1);
  const swell = waves(0.7);
  const left: Point[] = [];
  const right: Point[] = [];
  points.forEach(([x, y], i) => {
    const t = i / last;
    const [x0, y0] = points[Math.max(i - 1, 0)];
    const [x1, y1] = points[Math.min(i + 1, last)];
    const along = Math.hypot(x1 - x0, y1 - y0) || 1;
    const [nx, ny] = [-(y1 - y0) / along, (x1 - x0) / along];
    const half = (width / 2) * (0.45 + 0.55 * Math.sin(Math.PI * t) ** 0.4) * (1 + 0.25 * swell(t)) * (0.94 + 0.12 * random());
    const off = drift(t) * settle(t);
    left.push([x + nx * (off + half), y + ny * (off + half)]);
    right.push([x + nx * (off - half), y + ny * (off - half)]);
  });
  const at = ([x, y]: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  // Each edge as a smooth curve: through the middle of each pair of points, bending at the points.
  const smooth = (edge: Point[]) =>
    edge.slice(1, -1).map((p, i) => `Q${at(p)} ${at([(p[0] + edge[i + 2][0]) / 2, (p[1] + edge[i + 2][1]) / 2])}`).join("") + `L${at(edge[edge.length - 1])}`;
  const cap = ((width / 2) * 0.45).toFixed(1);
  const back = right.slice().reverse();
  return `M${at(left[0])}${smooth(left)}A${cap} ${cap} 0 0 0 ${at(back[0])}${smooth(back)}A${cap} ${cap} 0 0 0 ${at(left[0])}Z`;
}

// ---------------------------------------------------------------------------
// The exhibit
// ---------------------------------------------------------------------------

/**
 * The page's language, as Canopy sets it on <html> for each locale. Clover's
 * controls speak it.
 */
const pageLanguage = () => (typeof document !== "undefined" && document.documentElement.lang) || "en";

/** The Timeline's transport stays in sight: it is the page's seek bar, not a picture's. */
const TIMELINE = {hideDelay: Infinity};

export default function LaStrada({
  manifest,
  labels,
}: {
  /** The exhibit's IIIF manifest. */
  manifest: string;
  /** Interface text, to translate or reword. */
  labels?: Partial<Labels>;
}) {
  const text = {...LABELS, ...labels};
  const [score, setScore] = useState<Score | null>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("intact");
  const [places, setPlaces] = useState<Places>({});
  const [floor, setFloor] = useState(FLOOR);
  const [lifted, setLifted] = useState<string | null>(null);
  // The take each part with several has in the performance: another after each
  // performance, so that none repeats itself.
  const [takes, setTakes] = useState<Takes>({});
  // What Clover's Timeline is given to play: the recomposed manifest, as this page
  // serves it, and the performance it carries. With the sheet clear there is no
  // manifest to play, and no Timeline.
  const [live, setLive] = useState<{manifest: any | null; performance: Performance} | null>(null);
  // The Timeline's own media element, by which the exhibit starts, stops and follows it.
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  // Whether a performance is under way: begun, and neither over nor stopped, though it
  // may be paused; and whether it is sounding now.
  const [underway, setUnderway] = useState(false);
  const [playing, setPlaying] = useState(false);
  // The action being heard: in the performance, as the Timeline reaches it...
  const [now, setNow] = useState<string | null>(null);
  // ...or alone, as its slip's own key plays it.
  const [alone, setAlone] = useState<string | null>(null);
  // The action pointed at, or reached with the keyboard, on the seek bar or on the
  // sheet, whose chapter and type a line ties together.
  const [pointing, setPointing] = useState<string | null>(null);
  // Let go of, the pointing goes back to the slip that has focus.
  const unpoint = (id: string) =>
    setPointing((was) => {
      if (was !== id) return was;
      const focused = document.activeElement as HTMLElement | null;
      if (!focused || !section.current?.contains(focused)) return null;
      return focused.dataset.action ?? null;
    });
  // What the marker draws between them, in the page's pixels: a line from the chapter
  // to the action, and a brace at the action's type, where the line ends.
  const sketch = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState<{line: string | null; braces: string[]; rough: number} | null>(null);
  // The slip that has focus, reached by Tab or by a press: only it is braced, either
  // side of its type; pointed at otherwise, a slip gets only the line.
  const [focused, setFocused] = useState<string | null>(null);
  const [resized, setResized] = useState(0);
  // Which of the three arrangements the sheet is in: as typed, as it fell (or as the
  // visitor has since put it) or shuffled.
  const [mode, setMode] = useState<Mode>("original");

  const [copied, setCopied] = useState(false);
  const [showing, setShowing] = useState(false);

  // Clover's controls on the seek bar (play, seek, volume, the chapters, the keys)
  // speak the page's language rather than the browser's, as the projector's do.
  const [language] = useState(pageLanguage);
  useEffect(() => {
    initCloverI18n().chooseInterfaceLanguage(language);
  }, [language]);

  const section = useRef<HTMLElement>(null);
  const session = useRef(new Date().toISOString().replace(/\D/g, "").slice(0, 14));
  const board = useRef<HTMLDivElement>(null);
  // A press on a slip: where it started, where the pointer is, whether it has moved, and
  // whether the slip is held fast (on the sheet as typed, which is only to be heard).
  const drag = useRef<{id: string; dx: number; dy: number; x: number; y: number; from: number[]; moved: boolean} | null>(null);
  const top = useRef(100);
  // An action being heard alone.
  const current = useRef<Playing | null>(null);
  const timers = useRef<number[]>([]);
  // What the Timeline is to do once it holds the arrangement as it now stands: go to a
  // time, or to as far into an action as it had got, and play or not.
  const wanted = useRef<{play: boolean; time?: number; action?: string; offset?: number} | null>(null);
  // The performance the media element in hand plays, by its key.
  const held = useRef<string | null>(null);
  // The action the seek bar last pointed at, to let go of when the pointer leaves it.
  const barred = useRef<string | null>(null);

  useEffect(() => {
    const url = new URL(withBasePath(manifest), window.location.href).href;
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((json) => {
        if (!live) return;
        const next = readScore(json, rebaser(json, url));
        setScore(next);
        setPlaces(origin(next));
        setTakes(draw(next));
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [manifest]);

  // The annotation page, the performance and the manifest that carries both are made
  // anew whenever anything moves.
  const arranged = useMemo(() => {
    if (!score || !Object.keys(places).length) return null;
    const items = placed(score, places);
    const performance = perform(score, places, takes);
    return {
      page: annotationPage(score, items, session.current),
      manifest: arrangementManifest(score, items, performance, session.current),
      performance,
    };
  }, [score, places, takes]);
  const page = arranged?.page ?? null;

  // While the sheet is ahead of the Timeline (a slip is being carried, or has just
  // been put down), the seek bar already shows the arrangement as it now stands: its
  // chapters, read back out of the recomposed manifest's Ranges as Clover reads them
  // (chaptersOf), so that where a slip would land in the performance shows on the bar
  // as it is carried. They are set on the performance the Timeline still holds, each
  // at its own share of the bar, should the two not last the same. Made anew only as
  // the order changes, not with every move.
  const aheadKey = arranged && live && arranged.performance.key !== live.performance.key ? arranged.performance.key : null;
  const ahead = useMemo(() => {
    if (!score || !arranged || !live?.manifest || !aheadKey) return undefined;
    const {duration} = arranged.performance;
    const share = duration ? live.performance.duration / duration : 1;
    return chaptersOf(arranged.manifest, performanceId(score, session.current), duration).map((chapter) => ({
      id: chapter.id,
      label: (Object.values(chapter.label ?? {}).flat() as string[]).join("\n"),
      start: chapter.start * share,
      end: (chapter.end ?? duration) * share,
    }));
    // `aheadKey` stands in for the arrangement, which is made anew with every move.
  }, [score, aheadKey, live]);

  // What the handlers below, and those the Timeline calls, read as it now is.
  const latest = useRef({score, arranged, live, media, underway});
  latest.current = {score, arranged, live, media, underway};

  // ...and announced once the slip being moved is let go: the page, and the
  // manifest that carries it with its performance and chapters.
  useEffect(() => {
    if (arranged && !lifted) {
      section.current?.dispatchEvent(new CustomEvent("la-strada:arrangement", {detail: arranged.page, bubbles: true}));
      section.current?.dispatchEvent(new CustomEvent("la-strada:manifest", {detail: arranged.manifest, bubbles: true}));
    }
  }, [arranged, lifted]);

  /** Stop an action being heard alone. */
  const quiet = useCallback(() => {
    current.current?.stop();
    current.current = null;
    setAlone(null);
  }, []);

  /**
   * Once the Timeline holds the arrangement as it now stands, and its media element is
   * in hand, do what was wanted of it: go to a time, or as far into an action as the
   * performance had got before it was recomposed, and play if that was asked.
   */
  const fulfil = useCallback(() => {
    const {arranged, live, media} = latest.current;
    const ask = wanted.current;
    if (!ask || !media || !live || !arranged) return;
    if (live.performance.key !== arranged.performance.key || held.current !== live.performance.key) return;
    wanted.current = null;
    const action = ask.action ? live.performance.actions.find((a) => a.piece.id === ask.action) : undefined;
    const time = action ? Math.min(action.start + (ask.offset ?? 0), Math.max(action.start, action.end - 0.1)) : ask.time;
    if (time !== undefined && Math.abs(media.currentTime - time) > 0.05) media.currentTime = time;
    // A browser may refuse to play what no press has just asked for: then it is paused.
    if (ask.play) void media.play()?.catch(() => setPlaying(false));
  }, []);

  // The Timeline is given the arrangement once it has settled: not while a slip is
  // carried, and only when the performance itself has changed, which a move along a
  // line does not do. Clover knows a manifest by its id and would play the first
  // arrangement for ever, so each performance is given to it under an id of its own.
  // A performance under way goes on from where it was, in the action it had reached.
  useEffect(() => {
    if (!score || !arranged || lifted) return;
    if (latest.current.live?.performance.key === arranged.performance.key) return void fulfil();
    const give = () => {
      const {live, media, underway} = latest.current;
      const ask = wanted.current;
      const empty = !arranged.performance.actions.length;
      if (empty) {
        // The sheet is clear: nothing is wanted of a Timeline that is not there, and
        // a performance under way is over.
        wanted.current = null;
        held.current = null;
        latest.current.underway = false;
        setMedia(null);
        setUnderway(false);
        setPlaying(false);
        setNow(null);
      } else if (live && media && underway && ask?.time === undefined) {
        const time = media.currentTime;
        const action = live.performance.actions.find((a) => time >= a.start && time < a.end);
        wanted.current = {play: ask?.play ?? !media.paused, time, action: action?.piece.id, offset: action ? time - action.start : 0};
      }
      setLive({
        manifest: empty
          ? null
          : {...localise(arranged.manifest, score.rebase), id: `${arranged.manifest.id}?performance=${arranged.performance.key}`},
        performance: arranged.performance,
      });
    };
    if (!latest.current.live) return void give();
    const timer = window.setTimeout(give, 300);
    return () => window.clearTimeout(timer);
  }, [score, arranged, lifted, fulfil]);

  /** The Timeline's media element as it comes and goes: a new one for each performance. */
  const hold = useCallback((element: HTMLVideoElement | null) => {
    held.current = element ? latest.current.live?.performance.key ?? null : null;
    setMedia(element);
  }, []);

  // Follow the Timeline: a performance is under way from its first play until it ends
  // (or is stopped, below), and the action it has reached is the one being heard.
  useEffect(() => {
    if (!media) return;
    const follow = () => {
      const time = media.currentTime;
      const action = latest.current.live?.performance.actions.find((a) => time >= a.start - 0.01 && time < a.end);
      setNow(latest.current.underway || !media.paused ? action?.piece.id ?? null : null);
    };
    const played = () => {
      quiet();
      // Where the last action ends the performance is over: played again it starts
      // from the top, where the element alone would play only its last recording over.
      const actions = latest.current.live?.performance.actions ?? [];
      const last = actions[actions.length - 1];
      if (last && media.currentTime >= last.end - 0.25) media.currentTime = 0;
      latest.current.underway = true;
      setUnderway(true);
      setPlaying(true);
      follow();
    };
    const paused = () => setPlaying(false);
    const ended = () => {
      latest.current.underway = false;
      setUnderway(false);
      setPlaying(false);
      setNow(null);
      // Another take of anything with several, next time.
      setTakes((before) => (latest.current.score ? draw(latest.current.score, before) : before));
    };
    media.addEventListener("play", played);
    media.addEventListener("pause", paused);
    media.addEventListener("timeupdate", follow);
    media.addEventListener("seeked", follow);
    media.addEventListener("ended", ended);
    fulfil();
    return () => {
      // Recomposed as it plays, the performance goes on in the element that follows.
      if (!wanted.current?.play) setPlaying(false);
      media.removeEventListener("play", played);
      media.removeEventListener("pause", paused);
      media.removeEventListener("timeupdate", follow);
      media.removeEventListener("seeked", follow);
      media.removeEventListener("ended", ended);
    };
  }, [media, quiet, fulfil]);

  /** The chapter under the pointer on the seek bar: its action is pointed at. */
  const mark = useCallback((range: string | null) => {
    const id = range?.split("/").pop();
    const action = id && latest.current.score?.actions.some((p) => p.id === id) ? id : null;
    const before = barred.current;
    barred.current = action;
    if (action) setPointing(action);
    else if (before)
      setPointing((was) => {
        if (was !== before) return was;
        const focused = document.activeElement as HTMLElement | null;
        return (focused && section.current?.contains(focused) && focused.dataset.action) || null;
      });
  }, []);

  useEffect(
    () => () => {
      current.current?.stop();
      timers.current.forEach(window.clearTimeout);
    },
    []
  );

  // While a slip is held, follow the pointer, and scroll when it nears the
  // edge: the sheet is taller than the window, and the floor is further down.
  useEffect(() => {
    if (!lifted || !score || !board.current) return;
    const piece = score.actions.find((p) => p.id === lifted)!;
    let frame = 0;
    const tick = () => {
      const d = drag.current;
      if (d?.moved) {
        const edge = 90;
        if (d.y < edge) window.scrollBy(0, -Math.min(28, 2 + (edge - d.y) / 3));
        else if (d.y > window.innerHeight - edge) window.scrollBy(0, Math.min(28, 2 + (d.y - (window.innerHeight - edge)) / 3));
        const rect = board.current!.getBoundingClientRect();
        const unit = rect.width / 100;
        move(piece, (d.x - rect.left) / unit - d.dx, (d.y - rect.top) / unit - d.dy);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [lifted, score, floor]);

  useEffect(() => {
    const resize = () => setResized((n) => n + 1);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Draw the braces of the slip that has focus, and the line for the action pointed
  // at, from where its chapter stands on the seek bar and its slip on the sheet now.
  // The bar is fixed to the window and the sheet scrolls, so it is drawn again as
  // the page scrolls; and as a slip is carried the line goes with it, from wherever
  // its chapter then stands on the bar, so where it would land is plain to see.
  useLayoutEffect(() => {
    const piece = pointing ? score?.actions.find((p) => p.id === pointing) : undefined;
    const at = pointing ? places[pointing] : undefined;
    if (!score || !pointing || !piece || !at || !sketch.current || !board.current) return void setDrawn(null);
    const paper = board.current;
    const drawing = sketch.current;
    const slip = paper.querySelector<HTMLElement>(`[data-action="${pointing}"]`);
    const drawAt = (at: {x: number; y: number}) => {
      const box = drawing.getBoundingClientRect();
      const sheet = paper.getBoundingClientRect();
      const unit = sheet.width / 100;
      const line = score.grid.line * unit; // one typed line, in pixels
      const ink = Math.max(3, 0.3 * line);
      const wide = Math.max(4, 0.4 * line);
      const top = sheet.top - box.top + at.y * unit;
      const tall = Math.max(piece.h * unit * 0.95, line * 1.05);
      // The brace stands just left of the type, its point away from it.
      const tip: Point = [sheet.left - box.left + (at.x + score.grid.char * BEARING) * unit - ink * 0.6 - wide, top + (piece.h * unit) / 2];
      // Focused, the slip is braced either side of its type.
      const braced = focused === pointing;
      const braces: string[] = [];
      if (braced) {
        // Each brace has a hand of its own, so it is drawn the same way wherever its
        // slip stands. The right one stands just past the end of the type, its point
        // away from it: a brace drawn as the left one is, and turned about its point.
        const n = Math.max(12, Math.min(120, Math.round((tall + 2 * wide) / 2)));
        const hand = seeded(`${pointing} {`);
        braces.push(marker(brace(tip, tall, wide, n, hand), ink * 0.9, hand));
        const stop = (at.x + score.grid.char * BEARING + (piece.w - 2 * score.grid.char * BEARING)) * unit;
        const point: Point = [sheet.left - box.left + stop + ink * 0.6 + wide, tip[1]];
        const other = seeded(`${pointing} }`);
        braces.push(marker(brace(point, tall, wide, n, other).map(([x, y]): Point => [2 * point[0] - x, y]), ink * 0.9, other));
      }
      // The action's chapter, as Clover marks it out on the seek bar while it is
      // pointed at there or here. The line starts in its middle and comes straight up
      // out of the bar, angles across, and runs straight up again for the last 50px
      // (both shorter where there is less room) to arrive under the action: under
      // its first character, at the foot of its last line, turning into and out of
      // the angle round a short curve. With no chapter to start from (the action is
      // off the sheet, or the bar is not drawn yet), no line.
      const chapter = section.current?.querySelector(".fx-strada__timeline .clover-canvas-transport-chapter-span");
      const from = chapter?.getBoundingClientRect();
      let path: Point[] | null = null;
      if (from && from.width > 0) {
        const start: Point = [from.left - box.left + from.width / 2, from.top - box.top + from.height / 2];
        const end: Point = [sheet.left - box.left + (at.x + score.grid.char / 2) * unit, top + piece.h * unit + ink * 0.6];
        const up = end[1] - start[1];
        const out: Point = [start[0], start[1] + Math.sign(up) * Math.min(90, 0.4 * Math.abs(up))];
        const into: Point = [end[0], end[1] - Math.sign(up) * Math.min(50, 0.2 * Math.abs(up))];
        path = rounded([start, out, into, end], 20);
      }
      setDrawn({line: path && marker(path, ink, seeded(pointing), true), braces, rough: ink * 0.35});
    };
    // A slip nudged by the keys slides to its new place (left and top, 140ms): the
    // marker goes with it, drawn each frame from where the slip stands on the way.
    const standing = () => {
      if (!slip) return at;
      const unit = paper.getBoundingClientRect().width / 100;
      const style = getComputedStyle(slip);
      return {x: parseFloat(style.left) / unit, y: parseFloat(style.top) / unit};
    };
    const began = performance.now();
    let frame = 0;
    const tick = () => {
      const now = standing();
      const moving = Math.abs(now.x - at.x) > 0.001 || Math.abs(now.y - at.y) > 0.001;
      if (moving && performance.now() - began < 400) {
        drawAt(now);
        frame = requestAnimationFrame(tick);
      } else drawAt(at);
    };
    tick();
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", again, {passive: true});
    // And again whenever Clover marks the chapter out, or moves it: it draws the bar
    // in its own time, a little after a manifest is loaded into it.
    const bar = section.current?.querySelector(".fx-strada__timeline");
    const marked = bar ? new MutationObserver(again) : null;
    if (bar) marked?.observe(bar, {subtree: true, childList: true, attributes: true, attributeFilter: ["style"]});
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", again);
      marked?.disconnect();
    };
  }, [pointing, focused, places, score, resized, live, ahead]);

  if (failed) return <p className="fx-strada__caption">{text.failed}</p>;
  if (!score) return null;

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const move = (piece: Piece, x: number, y: number) =>
    setPlaces((prev) => ({
      ...prev,
      [piece.id]: {
        ...prev[piece.id],
        x: Math.min(Math.max(x, 0), 100 - piece.w),
        y: Math.min(Math.max(y, 0), score.pageH + floor - piece.h),
      },
    }));

  /** Whether a slip may stand here: on the board, and its type over no one else's. */
  const fits = (piece: Piece, x: number, y: number) => {
    const slack = 0.01;
    if (x < -slack || x > 100 - piece.w + slack) return false;
    if (y < -slack || y > score.pageH + floor - piece.h + slack) return false;
    const box = {x, y, w: piece.w, h: piece.h};
    return (
      score.frame.every((f) => !overlaps(score.grid, box, f)) &&
      score.actions.every((p) => p.id === piece.id || !places[p.id] || !overlaps(score.grid, box, {...places[p.id], w: p.w, h: p.h}))
    );
  };

  /** Put down here, a slip settles on the grid; over other type, on the nearest clear place. */
  const settle = (piece: Piece, x: number, y: number) => {
    const {grid} = score;
    const at = nearest(grid, x, y);
    const stride = grid.tab || 1;
    for (let ring = 0; ring <= 60; ring++) {
      const around: {x: number; y: number; d: number}[] = [];
      for (let c = -ring; c <= ring; c++) {
        for (let l = -ring; l <= ring; l++) {
          if (Math.max(Math.abs(c), Math.abs(l)) !== ring) continue;
          const spot = cell(grid, at.column + c * stride, at.line + l);
          around.push({...spot, d: Math.hypot(spot.x - x, spot.y - y)});
        }
      }
      const clear = around.sort((a, b) => a.d - b.d).find((spot) => fits(piece, spot.x, spot.y));
      if (clear) return clear;
    }
    return snap(grid, x, y);
  };

  /** Moved by the keys, a slip goes a step that way, or on past whatever is there to the next clear place. */
  const step = (piece: Piece, columns: number, lines: number) => {
    const from = places[piece.id];
    for (let n = 1; n < 400; n++) {
      const at = nudge(score.grid, from.x, from.y, columns * n, lines * n);
      if (at.x < -0.01 || at.x > 100 - piece.w + 0.01) return null;
      if (at.y < -0.01 || at.y > score.pageH + floor - piece.h + 0.01) return null;
      if (fits(piece, at.x, at.y)) return at;
    }
    return null;
  };

  const raise = (piece: Piece) =>
    setPlaces((prev) => ({...prev, [piece.id]: {...prev[piece.id], z: ++top.current}}));

  // The arrangement being performed, if one is: the sheet's own, while the Timeline
  // has a performance under way.
  const performing = underway ? mode : null;

  /** Stop whatever sounds, and put the performance back at its start. */
  const stop = () => {
    quiet();
    wanted.current = null;
    if (media) {
      media.pause();
      if (media.currentTime > 0) media.currentTime = 0;
    }
    // Another take of anything with several, for the performance after the one stopped.
    if (latest.current.underway) setTakes((before) => draw(score, before));
    latest.current.underway = false;
    setUnderway(false);
    setNow(null);
  };

  /**
   * Play the sheet's arrangement from its start, as soon as the Timeline holds it.
   * With the sheet clear there is nothing to play, and nothing is kept waiting for
   * the first slip put back: that is for play to start.
   */
  const start = () => {
    quiet();
    wanted.current = latest.current.arranged?.performance.actions.length ? {play: true, time: 0} : null;
    fulfil();
  };

  /**
   * Play and pause, at the head of the seek bar: play the sheet as it is, in whichever
   * arrangement it is in, from where the bar stands; pause it there; and go on from there.
   */
  const playPause = () => {
    if (media && !media.paused) return media.pause();
    quiet();
    wanted.current = {...wanted.current, play: true};
    fulfil();
  };

  /**
   * Original and Shuffle each set the sheet in their arrangement and play it; Clear
   * sets it, and leaves nothing on the sheet to play. Pressed while it plays, a button
   * stops it. Original and Clear, pressed again once the sheet is theirs, play it as
   * the visitor has left it rather than setting it again. A slip can be moved by hand
   * in any of them: in Original the sheet stays Original's, and Reset beside it puts
   * every action back where it was typed; anywhere else a move makes the arrangement
   * the visitor's own, which is Clear's.
   */
  const restore = () => {
    if (performing === "original") return stop();
    if (mode === "original") return start();
    putBack(start);
  };

  /** Every action back where it was typed, rising from wherever it is; then, if given, what follows. */
  const putBack = (then?: () => void) => {
    stop();
    setMode("original");
    const home = origin(score, 350, 800);
    setPlaces(home);
    setPhase("rising");
    later(() => {
      setPhase("intact");
      then?.();
    }, settles(home));
  };

  const reset = () => putBack();

  const clearSheet = () => {
    if (performing === "fallen") return stop();
    if (mode === "fallen" && phase === "free") return start();
    stop();
    setMode("fallen");
    const fallen = scatter(score, ++top.current);
    top.current += score.actions.length;
    setFloor(fallen.floor);
    setPlaces(fallen.places);
    setPhase("falling");
    later(() => setPhase("free"), settles(fallen.places));
  };

  const shuffleSheet = () => {
    if (performing === "shuffled") return stop();
    stop();
    setMode("shuffled");
    const next = arrange(score, top.current + 1);
    top.current += score.actions.length;
    setPlaces(next);
    setPhase("shuffling");
    later(() => {
      setPhase("free");
      start();
    }, settles(next));
  };

  /** One action, heard alone, as its slip's own key plays it: the performance waits. */
  const hear = (piece: Piece) => {
    quiet();
    media?.pause();
    const voice = play(piece);
    current.current = voice;
    setAlone(piece.id);
    voice.done.then(() => {
      if (current.current === voice) {
        current.current = null;
        setAlone(null);
      }
    });
  };

  const json = () => JSON.stringify(page, null, 2) + "\n";

  const save = (value: unknown, name: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], {type: "application/ld+json"}));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const download = () => save(page, `la-strada-${session.current}.json`);
  const downloadManifest = () => save(arranged?.manifest, `la-strada-${session.current}-manifest.json`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json());
    } catch (_) {
      return; // no clipboard here; the page is shown below to select from
    }
    setCopied(true);
    later(() => setCopied(false), 1500);
  };

  const grab = (e: React.PointerEvent<HTMLButtonElement>, piece: Piece) => {
    if (!touchable || e.button !== 0) return;
    e.preventDefault();
    // Held back from the browser so it starts no drag of its own, the press focuses
    // the slip itself: the arrow keys move it from here.
    e.currentTarget.focus({preventScroll: true});
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = board.current!.getBoundingClientRect();
    const unit = rect.width / 100;
    const at = places[piece.id];
    drag.current = {
      id: piece.id,
      dx: (e.clientX - rect.left) / unit - at.x,
      dy: (e.clientY - rect.top) / unit - at.y,
      x: e.clientX,
      y: e.clientY,
      from: [e.clientX, e.clientY],
      moved: false,
    };
    // On the sheet as typed, a line is lifted only once it is carried.
    if (phase === "intact") return;
    raise(piece);
    setLifted(piece.id);
  };

  const drift = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.moved || Math.hypot(e.clientX - d.from[0], e.clientY - d.from[1]) <= 4) return;
    d.moved = true;
    // Carried off the sheet as typed, a line comes away from it: lift it.
    if (phase === "intact") {
      setPhase("free");
      raise(score.actions.find((p) => p.id === d.id)!);
      setLifted(d.id);
    }
  };

  /** A move by hand: in Original the sheet stays Original's; anywhere else it is Clear's. */
  const moved = () => {
    if (mode !== "original") setMode("fallen");
  };

  const drop = (piece: Piece, touched: boolean) => {
    const d = drag.current;
    drag.current = null;
    setLifted(null);
    // A press that goes nowhere only focuses the slip (Enter or Space plays it); a slip that
    // has been carried somewhere settles onto the grid.
    if (d?.moved && touched) {
      const at = settle(piece, places[piece.id].x, places[piece.id].y);
      move(piece, at.x, at.y);
      moved();
    }
  };

  const key = (e: React.KeyboardEvent<HTMLButtonElement>, piece: Piece) => {
    if (!touchable) return;
    // A tab stop along, or a line up or down.
    const by: Record<string, number[]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      hear(piece);
    } else if (by[e.key]) {
      e.preventDefault();
      setPointing(piece.id);
      const at = step(piece, by[e.key][0], by[e.key][1]);
      if (!at) return; // nowhere clear that way before the edge
      if (phase === "intact") setPhase("free");
      move(piece, at.x, at.y);
      moved();
    }
  };

  const heard = score.actions.find((p) => p.id === (alone ?? now));
  const settled = phase === "free";
  const ready = phase === "intact" || settled; // not in the middle of moving
  const touchable = ready; // a line can be heard: on the sheet as typed, or once things have settled
  // What the sheet asks of the visitor in each arrangement: shown in the caption when
  // nothing is being heard, and all a screen reader is told as the arrangement changes.
  const guide = mode === "original" ? text.intro : mode === "shuffled" ? text.arranged : text.fallen;
  let caption: React.ReactNode = "";
  if (heard) {
    caption = (
      <>
        <em>{heard.silent || !isPerformed(heard) ? text.silent : text.performed}</em>“{heard.text.replace(/\n/g, " ")}”
      </>
    );
  } else if (ready) caption = guide;

  // Everything the caption can say but an action heard, which is cut to fit.
  const widest = [text.intro, text.fallen, text.arranged];

  const everything = [...score.actions, ...score.frame].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <section ref={section} className="fx-strada" data-phase={phase} data-mode={mode}>
      {/* The same buttons in every state, and a caption sized for the longest thing it
          can say, so the bar never changes height and nothing under it moves. Original,
          Clear and Shuffle are the three arrangements of the sheet, any of which can be
          had from any other; each plays when pressed, and says Stop while it does.
          Reset, beside Original, puts the sheet back as it was typed without playing,
          and has nothing to do while it is. */}
      <div className="fx-strada__bar">
        {(
          [
            {mode: "original", label: text.original, title: "The score as it was typed", press: restore},
            {mode: "fallen", label: text.clear, title: "Let the actions fall off the sheet", press: clearSheet},
            {mode: "shuffled", label: text.shuffle, title: "Lay the actions on the sheet in a random order, and play them", press: shuffleSheet},
          ] as const
        ).map(({mode: own, label, title, press}) => (
          <React.Fragment key={own}>
            <button
              type="button"
              className={`fx-strada__button fx-strada__button--quiet${performing === own ? " is-playing" : ""}`}
              aria-pressed={mode === own}
              disabled={!ready}
              title={title}
              onClick={press}
            >
              {performing === own ? text.stop : label}
            </button>
            {own === "original" && (
              <button
                type="button"
                className="fx-strada__reset"
                aria-label={text.reset}
                title="Put every action back where it was typed"
                disabled={!ready || (mode === "original" && phase === "intact")}
                onClick={reset}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                  <path d="M3.2 6.2A5 5 0 1 1 3 9.5" />
                  <path d="M2.8 2.6v3.8h3.8" />
                </svg>
              </button>
            )}
          </React.Fragment>
        ))}
        {/* The caption is for the eye. The action heard is already the sound itself, and
            its text is what a screen reader says of its slip on reaching it, so a screen
            reader is told only of the arrangement, here, when it changes. */}
        <p className="fx-strada__said" aria-live="polite">
          {ready ? guide : ""}
        </p>
        <p className="fx-strada__caption" aria-hidden="true">
          <span>{caption}</span>
          {widest.map((words) => (
            <span key={words} className="fx-strada__sizer" aria-hidden="true">
              {words}
            </span>
          ))}
        </p>
      </div>

      {/* The seek bar, fixed along the foot of the window, with play and pause at its
          head, on a black bar as Clover's player is. The bar is Clover's Timeline,
          playing the arrangement as a manifest of its own, recomposed and loaded again
          whenever the performance changes, and of Clover's player only its seek bar is
          shown (app/styles/la-strada.css): its chapters are the actions, from the
          manifest's Ranges, each named under the pointer. While a slip is carried, the
          chapters are those of the manifest as it would be (`ahead`), before it is
          loaded. With the sheet clear there is no performance, and no bar. It stands here, before the sheet, so the keys reach play and the bar
          before the sheet's twenty-five slips. While a chapter or its action is
          pointed at, or its slip carried, Clover marks the chapter out on the bar, and
          the marker draws a line from it to the action (see the sketch, below). The
          bar's black ground is an element of its own (the foot), so that line can lie
          over the ground and under what is on it. */}
      <div className="fx-strada__foot" aria-hidden="true" />
      <div className="fx-strada__timeline">
        <button
          type="button"
          className="fx-strada__play"
          aria-label={playing ? text.pause : text.play}
          title={playing ? text.pause : text.play}
          disabled={!ready || !live?.manifest}
          onClick={playPause}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M5 2.5v11l9-5.5z" />}
          </svg>
        </button>
        <div className="fx-strada__seek">
          {live?.manifest && (
            <Timeline
              iiifContent={live.manifest}
              language={language}
              className="fx-strada__player"
              controls={false}
              options={TIMELINE}
              chapters={ahead}
              highlightedChapter={pointing ? rangeId(score, session.current, pointing) : null}
              onChapterHighlight={mark}
              onMediaElement={hold}
            />
          )}
        </div>
      </div>

      {/* Credit for the original, in the manner of Creative Commons, over the sheet:
          the title, linked to its item, who made it, where it is from, and any rights.
          It is shown only while the sheet is as typed, but keeps its room. */}
      <div className="fx-strada__credit">
        {score.credit.link ? <a href={score.credit.link}>“{score.credit.title}”</a> : <>“{score.credit.title}”</>}
        {score.credit.creator && ` ${text.by} ${score.credit.creator}`}
        {score.credit.date && `, ${score.credit.date}`}
        {score.credit.source && (
          <>
            . {text.source}:{" "}
            {score.credit.sourceLink ? <a href={score.credit.sourceLink}>{score.credit.source}</a> : score.credit.source}
          </>
        )}
        {score.credit.rights && (
          <>
            . {text.rights}: <a href={score.credit.rights}>{score.credit.rights.replace(/^https?:\/\/(www\.)?/, "")}</a>
          </>
        )}
        .
      </div>

      <div className="fx-strada__stage" style={{"--page-h": score.pageH} as React.CSSProperties}>
        <div
          ref={board}
          className="fx-strada__board"
          style={
            {
              "--floor": floor,
              "--score": `url("${score.image}")`,
              "--ink": `url("${score.ink}")`,
            } as React.CSSProperties
          }
        >
          <img className="fx-strada__ground" src={score.ground} alt="" draggable={false} />
          {score.actions.map((piece) => {
            const at = places[piece.id];
            return (
              <button
                key={piece.id}
                type="button"
                className={`fx-slip${lifted === piece.id ? " is-lifted" : ""}${pointing === piece.id && !lifted ? " is-pointed" : ""}`}
                data-action={piece.id}
                style={
                  {
                    "--x": at.x,
                    "--y": at.y,
                    "--w": piece.w,
                    "--h": piece.h,
                    "--bx": piece.x,
                    "--by": piece.y,
                    "--z": at.z,
                    "--delay": `${at.delay}ms`,
                    "--dur": `${at.dur}ms`,
                  } as React.CSSProperties
                }
                aria-label={piece.text.replace(/\n/g, " ")}
                aria-hidden={touchable ? undefined : true}
                tabIndex={touchable ? 0 : -1}
                onPointerDown={(e) => grab(e, piece)}
                onPointerMove={drift}
                onPointerUp={() => drop(piece, true)}
                onPointerCancel={() => drop(piece, false)}
                onKeyDown={(e) => key(e, piece)}
                onPointerEnter={() => setPointing(piece.id)}
                onPointerLeave={() => unpoint(piece.id)}
                onFocus={() => {
                  setFocused(piece.id);
                  setPointing(piece.id);
                }}
                onBlur={() => {
                  setFocused((was) => (was === piece.id ? null : was));
                  unpoint(piece.id);
                }}
              />
            );
          })}
        </div>
      </div>

      {/* The marker's line and brace between the pointed chapter and its action,
          their edges roughened a little, as felt-tip is on paper. It stands here, out
          of the sheet's own stacking, so the line can run over the bar's black ground
          to the chapter it starts from, under the rail and the popover. */}
      <svg ref={sketch} className="fx-strada__sketch" aria-hidden="true" focusable="false">
        {drawn && (
          <>
            <filter id="fx-strada-marker" x="-5%" y="-20%" width="110%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="1964" />
              <feDisplacementMap in="SourceGraphic" scale={drawn.rough} xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <g filter="url(#fx-strada-marker)">
              {drawn.line && <path d={drawn.line} />}
              {drawn.braces.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          </>
        )}
      </svg>

      {/* The arrangement, as it stands, ready to take away. */}
      <div className="fx-strada__extract">
        <button
          type="button"
          className="fx-strada__button fx-strada__button--quiet"
          disabled={!page?.items.length || (phase !== "intact" && !settled)}
          onClick={download}
        >
          {text.download}
        </button>
        <button
          type="button"
          className="fx-strada__button fx-strada__button--quiet"
          disabled={!page?.items.length || (phase !== "intact" && !settled)}
          onClick={copy}
        >
          {copied ? text.copied : text.copy}
        </button>
        <button
          type="button"
          className="fx-strada__button fx-strada__button--quiet"
          disabled={!page?.items.length || (phase !== "intact" && !settled)}
          onClick={downloadManifest}
        >
          {text.manifest}
        </button>
        <p>{text.extract}</p>
      </div>
      <details className="fx-strada__annotations" onToggle={(e) => setShowing((e.currentTarget as HTMLDetailsElement).open)}>
        <summary>{text.annotationPage}</summary>
        {showing && <pre>{json()}</pre>}
      </details>

      <details className="fx-strada__transcription">
        <summary>{text.transcription}</summary>
        {everything.map((piece) => (
          <p key={piece.id}>{piece.text}</p>
        ))}
      </details>
    </section>
  );
}
