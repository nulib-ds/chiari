import {withBasePath} from "@canopy-iiif/app/base-path";
import {chaptersOf} from "./clover";
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";

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
 * and Shuffle lays them on the sheet at random; each plays its arrangement when
 * pressed, and says Stop while it does.
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
 * The arrangement is also read as chapters: the same actions, as Ranges that name
 * a place and a time, which Clover 4's helpers (`chaptersOf`, via ./clover)
 * turn into the chapters of the seek bar on the rail left of the sheet. Only its pure
 * helpers are used, which cost a few kilobytes; its parts (Root, Contents,
 * Timeline) are not drawn here.
 *
 * The arrangement is itself a IIIF annotation page, rebuilt from where things
 * stand every time one moves: the same annotations, in the order of their
 * times, each with a new target (xywh=...&t=...) where it now is. It can be
 * downloaded or copied, and is also announced as a "la-strada:arrangement"
 * event on the section, with the page as the event's detail, and as a
 * "la-strada:manifest" event with the manifest that carries it and its
 * chapters (which LaStradaDebug.client.tsx shows in Clover's viewer).
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
  intro: "A typescript sent to George Maciunas, 1964. Touch a line to hear it, or drag it.",
  fallen: "Drag them onto the sheet, then press play. Touch one to hear it.",
  arranged: "In a new order. Move them as you like.",
  silent: "silence",
  performed: "performed",
  by: "by",
  chapters: "Chapters",
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

type Piece = {
  id: string;
  text: string;
  /** Seconds of silence to perform in place of a recording, when the action is silent. */
  silent?: number;
  /** How long it is heard for, in seconds: its recordings end to end, its silence, or its saying. */
  length: number;
  /** Its recordings, when the manifest has any: parts played one after another, each a list of takes to choose from. */
  sounds: string[][];
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
  credit: {title: string; link?: string; creator?: string; date?: string; kind?: string; source?: string; sourceLink?: string; rights?: string};
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
        const sounds = bodies
          .flatMap((b) =>
            b.type === "Sound"
              ? [[rebase(b.id)]]
              : b.type === "Choice"
                ? [(b.items ?? []).filter((i: any) => i.type === "Sound").map((i: any) => rebase(i.id))]
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
      kind: field("Material Type"),
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
      return recording(takes[take]);
    })
  );
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** The rest, in seconds, after each action of a performance. */
const REST = 1.1;

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

/** A time as the score writes it: 7' 40". */
function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}′ ${String(whole % 60).padStart(2, "0")}″`;
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

/**
 * The same actions as chapters: a Range for each that names its place and time,
 * which a viewer lists, marks on the timeline and draws as a region of the sheet.
 */
function chapterRanges(score: Score, items: Placed[], session: string) {
  const page = arrangementId(score, session);
  return items.map(({piece, target}) => ({
    id: `${page}/range/${piece.id}`,
    type: "Range",
    label: {en: [piece.text.replace(/\n/g, " ")]},
    items: [{id: target, type: "Canvas"}],
  }));
}

/** The manifest, with the arrangement as its annotations and its chapters, for a viewer to open. */
function arrangementManifest(score: Score, items: Placed[], session: string) {
  const page = arrangementId(score, session);
  const [sheet, ...rest] = score.manifest.items;
  const frame = (sheet.annotations ?? []).filter((p: any) => /frame$/.test(p.id));
  return {
    ...score.manifest,
    id: `${page}/manifest.json`,
    label: {en: ["La strada, in the order made"]},
    items: [{...sheet, annotations: [annotationPage(score, items, session), ...frame]}, ...rest],
    structures: [
      {
        id: `${page}/range/score`,
        type: "Range",
        label: {en: [score.manifest.label?.en?.[0] ?? "La strada"]},
        items: chapterRanges(score, items, session),
      },
    ],
  };
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
function scatter(score: Score, z: number, below: number): {places: Places; floor: number} {
  const places: Places = {};
  let x = 2;
  let y = score.pageH + below + 4;
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
  return {places, floor: Math.max(FLOOR, y + row + 4 - score.pageH - below)};
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
  const [now, setNow] = useState<string | null>(null);
  // The chapters already heard in this performance, which the seek bar fills black.
  const [played, setPlayed] = useState<Set<string>>(() => new Set());
  // The action pointed at, or reached with the keyboard, on the seek bar or on the
  // sheet, whose block and type a line ties together.
  const [pointing, setPointing] = useState<string | null>(null);
  // Let go of, the pointing goes back to whatever the keyboard is on, if it is a block or a slip.
  const unpoint = (id: string) =>
    setPointing((was) => {
      if (was !== id) return was;
      const focused = document.activeElement as HTMLElement | null;
      const keyed = focused && section.current?.contains(focused) && focused.matches(":focus-visible");
      return (keyed && (focused.dataset.chapter ?? focused.dataset.action)) || null;
    });
  // What the marker draws between them, in the page's pixels: a line from the block
  // to the action, and a brace at the action's type, where the line ends.
  const sketch = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState<{line: string; brace: string; rough: number} | null>(null);
  const [resized, setResized] = useState(0);
  // Which of the three arrangements the sheet is in, as typed, as it fell (or as the
  // visitor has since put it) or shuffled, and which of them is being performed.
  const [mode, setMode] = useState<Mode>("original");
  const [performing, setPerforming] = useState<Mode | null>(null);
  const [paused, setPaused] = useState(false);

  const [copied, setCopied] = useState(false);
  // How tall the caption under the sheet is, in page widths: the floor starts below it.
  const [creditH, setCreditH] = useState(0);
  const credit = useRef<HTMLDivElement>(null);
  const [showing, setShowing] = useState(false);

  const section = useRef<HTMLElement>(null);
  const session = useRef(new Date().toISOString().replace(/\D/g, "").slice(0, 14));
  const board = useRef<HTMLDivElement>(null);
  // A press on a slip: where it started, where the pointer is, whether it has moved, and
  // whether the slip is held fast (on the sheet as typed, which is only to be heard).
  const drag = useRef<{id: string; dx: number; dy: number; x: number; y: number; from: number[]; moved: boolean} | null>(null);
  const top = useRef(100);
  const run = useRef(0);
  const current = useRef<Playing | null>(null);
  // The run of actions being performed waits here while it is paused.
  const gate = useRef(holding());
  const timers = useRef<number[]>([]);

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
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [manifest]);

  // The chapter being heard fills pink as far as it has got. Read every frame and
  // written straight to it, so playing doesn't re-render the exhibit sixty times a second.
  useEffect(() => {
    if (!now) return;
    const chapter = () => board.current?.querySelector<HTMLElement>(`[data-chapter="${now}"]`);
    let frame = 0;
    const tick = () => {
      chapter()?.style.setProperty("--progress", String(current.current?.progress() ?? 0));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      chapter()?.style.removeProperty("--progress");
    };
  }, [now]);

  // The caption is as tall as its words need at the width the sheet has, so measure it
  // before anything is drawn, and again if either changes.
  useLayoutEffect(() => {
    const words = credit.current;
    const sheet = board.current;
    if (!words || !sheet) return;
    const measure = () => setCreditH(Math.ceil(((words.offsetHeight + 14) / (sheet.getBoundingClientRect().width / 100)) * 10) / 10);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(sheet);
    watch.observe(words);
    return () => watch.disconnect();
  }, [score]);

  // The annotation page is made anew whenever anything moves.
  const arranged = useMemo(() => {
    if (!score || !Object.keys(places).length) return null;
    const items = placed(score, places);
    return {page: annotationPage(score, items, session.current), manifest: arrangementManifest(score, items, session.current)};
  }, [score, places]);
  const page = arranged?.page ?? null;

  // Clover reads the chapters back out of the Ranges: by start time, each with its span.
  const chapters = useMemo(
    () => (score && arranged ? chaptersOf(arranged.manifest, score.canvas, score.duration) : []),
    [score, arranged]
  );

  // ...and announced once the slip being moved is let go: the page, and the
  // manifest that carries it with its chapters.
  useEffect(() => {
    if (arranged && !lifted) {
      section.current?.dispatchEvent(new CustomEvent("la-strada:arrangement", {detail: arranged.page, bubbles: true}));
      section.current?.dispatchEvent(new CustomEvent("la-strada:manifest", {detail: arranged.manifest, bubbles: true}));
    }
  }, [arranged, lifted]);

  useEffect(
    () => () => {
      run.current++;
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

  // Draw the line and the brace for the action pointed at, from where its block and
  // its slip stand now. The slip's place is read from its own, not from the page, so
  // that its growing a little while it is pointed at does not move the brace.
  useLayoutEffect(() => {
    const block = pointing && section.current?.querySelector(`.fx-strada__chapters [data-chapter="${pointing}"]`);
    const piece = pointing ? score?.actions.find((p) => p.id === pointing) : undefined;
    const at = pointing ? places[pointing] : undefined;
    if (!score || !block || !piece || !at || lifted || !sketch.current || !board.current) return void setDrawn(null);
    const frame = sketch.current.getBoundingClientRect();
    const sheet = board.current.getBoundingClientRect();
    const from = block.getBoundingClientRect();
    const unit = sheet.width / 100;
    const line = score.grid.line * unit; // one typed line, in pixels
    const ink = Math.max(3, 0.3 * line);
    const wide = Math.max(4, 0.4 * line);
    const top = sheet.top - frame.top + at.y * unit;
    const tall = Math.max(piece.h * unit * 0.95, line * 1.05);
    // The brace stands just left of the type, its point toward the bar.
    const tip: Point = [sheet.left - frame.left + (at.x + score.grid.char * BEARING) * unit - ink * 0.6 - wide, top + (piece.h * unit) / 2];
    // The line starts in the middle of the block and comes straight out of it, about
    // 100px, angles straight across to the brace's height, and runs straight again for
    // the last 50px into its point (both shorter if the brace is near the bar), turning
    // into and out of the angle round a short curve.
    const start: Point = [from.left - frame.left + from.width / 2, from.top - frame.top + from.height / 2];
    const across = tip[0] - start[0];
    const out: Point = [start[0] + Math.min(100, 0.4 * across), start[1]];
    const into: Point = [tip[0] - Math.min(50, 0.2 * across), tip[1]];
    const path = rounded([start, out, into, tip], 20);
    // The line leaves the middle of the block and meets the brace at its point. The
    // brace has a hand of its own, so it is drawn the same way wherever its slip stands.
    const hand = seeded(`${pointing} {`);
    setDrawn({
      line: marker(path, ink, seeded(pointing), true),
      brace: marker(brace(tip, tall, wide, Math.max(12, Math.min(120, Math.round((tall + 2 * wide) / 2))), hand), ink * 0.9, hand),
      rough: ink * 0.35,
    });
  }, [pointing, lifted, places, score, resized]);

  if (failed) return <p className="fx-strada__caption">{text.failed}</p>;
  if (!score) return null;

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const move = (piece: Piece, x: number, y: number) =>
    setPlaces((prev) => ({
      ...prev,
      [piece.id]: {
        ...prev[piece.id],
        x: Math.min(Math.max(x, 0), 100 - piece.w),
        y: Math.min(Math.max(y, 0), score.pageH + creditH + floor - piece.h),
      },
    }));

  /** Whether a slip may stand here: on the board, and its type over no one else's. */
  const fits = (piece: Piece, x: number, y: number) => {
    const slack = 0.01;
    if (x < -slack || x > 100 - piece.w + slack) return false;
    if (y < -slack || y > score.pageH + creditH + floor - piece.h + slack) return false;
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
      if (at.y < -0.01 || at.y > score.pageH + creditH + floor - piece.h + 0.01) return null;
      if (fits(piece, at.x, at.y)) return at;
    }
    return null;
  };

  const raise = (piece: Piece) =>
    setPlaces((prev) => ({...prev, [piece.id]: {...prev[piece.id], z: ++top.current}}));

  const silence = () => {
    run.current++;
    current.current?.stop();
    current.current = null;
    gate.current.release();
    setNow(null);
    setPerforming(null);
    setPaused(false);
  };

  /**
   * Original, Clear and Shuffle each set the sheet in their arrangement and play it.
   * Pressed while it plays, a button stops it. Original and Clear, pressed again once
   * the sheet is theirs, play it as the visitor has left it rather than setting it
   * again. A slip can be moved by hand in any of them: in Original the sheet stays
   * Original's, and Reset beside it puts every action back where it was typed; anywhere
   * else a move makes the arrangement the visitor's own, which is Clear's.
   */
  const restore = () => {
    if (performing === "original") return silence();
    // The score as it was typed: the manifest's own order.
    const typed = [...score.actions].sort((a, b) => a.start - b.start || a.y - b.y || a.x - b.x);
    if (mode === "original") return void walk(phase === "intact" ? typed : heardOrder(places), "original");
    putBack(() => walk(typed, "original"));
  };

  /** Every action back where it was typed, rising from wherever it is; then, if given, what follows. */
  const putBack = (then?: () => void) => {
    silence();
    setMode("original");
    setPlayed(new Set());
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
    if (performing === "fallen") return silence();
    if (mode === "fallen" && phase === "free") return void walk(heardOrder(places), "fallen");
    silence();
    setMode("fallen");
    const fallen = scatter(score, ++top.current, creditH);
    top.current += score.actions.length;
    setFloor(fallen.floor);
    setPlaces(fallen.places);
    setPhase("falling");
    later(() => {
      setPhase("free");
      walk(heardOrder(fallen.places), "fallen");
    }, settles(fallen.places));
  };

  const shuffleSheet = () => {
    if (performing === "shuffled") return silence();
    silence();
    setMode("shuffled");
    const next = arrange(score, top.current + 1);
    top.current += score.actions.length;
    setPlaces(next);
    setPhase("shuffling");
    later(() => {
      setPhase("free");
      walk(heardOrder(next), "shuffled");
    }, settles(next));
  };

  const hear = (piece: Piece) => {
    silence();
    const voice = play(piece);
    current.current = voice;
    setNow(piece.id);
    voice.done.then(() => {
      if (current.current === voice) {
        current.current = null;
        setNow(null);
      }
    });
  };

  const mid = (p: Piece) => ({x: places[p.id].x + p.w / 2, y: places[p.id].y + p.h / 2});
  const isOnSheet = (p: Piece) => mid(p).x >= 0 && mid(p).x <= 100 && mid(p).y >= 0 && mid(p).y <= score.pageH;

  /** The actions on the sheet, in the order of the times where they stand. */
  const onSheet = () => arrangement(score, places);

  const walk = async (list: Piece[], owner: Mode) => {
    silence();
    const token = run.current;
    setPerforming(owner);
    setPlayed(new Set());
    for (const piece of list) {
      await gate.current.passed();
      if (run.current !== token) return;
      setNow(piece.id);
      const voice = play(piece);
      current.current = voice;
      await voice.done;
      if (run.current !== token) return;
      setPlayed((before) => new Set(before).add(piece.id));
      await wait(REST * 1000);
    }
    await gate.current.passed();
    if (run.current === token) silence();
  };

  /**
   * Play and pause, beside the chapters: play the sheet as it is, in whichever
   * arrangement it is in; pause it where it is; and go on from there.
   */
  const playPause = () => {
    if (performing && !paused) {
      gate.current.hold();
      current.current?.pause();
      setPaused(true);
    } else if (performing && paused) {
      current.current?.resume();
      gate.current.release();
      setPaused(false);
    } else walk(heardOrder(places), mode);
  };

  /** A chapter chosen on the line: the arrangement played from that action on. */
  const seek = (piece: Piece) => {
    const list = heardOrder(places);
    const from = list.findIndex((p) => p.id === piece.id);
    walk(from >= 0 ? list.slice(from) : [piece], mode);
    // Everything before where it was sought to counts as heard, as on any seek bar.
    setPlayed(new Set(list.slice(0, Math.max(from, 0)).map((p) => p.id)));
  };

  /**
   * What is heard of an arrangement: the actions on the sheet, in the order of their
   * times, which as typed is the original order. If none are on it, as when they have
   * only just fallen, the pile as it lies.
   */
  const heardOrder = (at: Places) => {
    const sheet = arrangement(score, at);
    return sheet.length ? sheet : [...score.actions].sort((a, b) => at[a.id].y - at[b.id].y || at[a.id].x - at[b.id].x);
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
    // On the sheet as typed, a line is lifted only once it is carried: a touch hears it.
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
    setPlayed(new Set());
  };

  const drop = (piece: Piece, touched: boolean) => {
    const d = drag.current;
    drag.current = null;
    setLifted(null);
    // A touch that goes nowhere is a request to hear the action; a slip that
    // has been carried somewhere settles onto the grid.
    if (d && !d.moved && touched) hear(piece);
    else if (d?.moved && touched) {
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

  const heard = score.actions.find((p) => p.id === now);
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
            {mode: "fallen", label: text.clear, title: "Let the actions fall off the sheet, then play them", press: clearSheet},
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

      <div className="fx-strada__stage" style={{"--page-h": score.pageH} as React.CSSProperties}>
        <div
          ref={board}
          className="fx-strada__board"
          style={
            {
              "--floor": floor,
              "--credit": creditH,
              "--score": `url("${score.image}")`,
              "--ink": `url("${score.ink}")`,
            } as React.CSSProperties
          }
        >
          <img className="fx-strada__ground" src={score.ground} alt="" draggable={false} />
          {/* Credit for the original, in the manner of Creative Commons: the title,
              linked to its item, who made it, where it is from, and any rights. It
              is shown only while the sheet is as typed, but keeps its room. */}
          <div ref={credit} className="fx-strada__credit">
            {score.credit.link ? <a href={score.credit.link}>“{score.credit.title}”</a> : <>“{score.credit.title}”</>}
            {score.credit.creator && ` ${text.by} ${score.credit.creator}`}
            {score.credit.date && `, ${score.credit.date}`}
            {score.credit.kind && `. ${score.credit.kind}`}
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
          {/* The seek bar, down the rail to the left of the sheet: each chapter level
              with where its action stands, to where the next one does, chosen to play
              from there; and play and pause at its head. */}
          <div className="fx-strada__rail">
            <button
              type="button"
              className="fx-strada__play"
              aria-label={performing && !paused ? text.pause : text.play}
              title={performing && !paused ? text.pause : text.play}
              disabled={!ready}
              onClick={playPause}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                {performing && !paused ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M5 2.5v11l9-5.5z" />}
              </svg>
            </button>
            {/* The performance, as long as it lasts: what is on the sheet, end to end in
                the order it will be heard, each action as long as it sounds and a rest
                after it, each a block of the sheet's own paper with a gap between. When
                everything is on the sheet it reaches from the first typed line to the
                last; with less it is shorter, and with nothing, nothing but its time.
                The blocks fill black as they are heard; the time it all takes is
                written at the foot of the last. While a block or its action is pointed
                at, the marker draws a line from one to the other (see the sketch,
                below). */}
            {(() => {
              const length = (p: Piece) => p.length + REST;
              const [top, bottom] = score.span;
              const least = 0.6; // page widths: the shortest a block is drawn, to be seen and chosen
              // Each block as long as its action sounds and the rest after it, or the
              // least; so that all of them, end to end, reach from the first typed line
              // to the last. The gap between blocks is drawn inside them.
              let scale = (bottom - top) / score.actions.reduce((sum, p) => sum + length(p), 0);
              for (let i = 0; i < 4; i++) {
                const long = score.actions.filter((p) => length(p) * scale >= least);
                const short = score.actions.length - long.length;
                scale = (bottom - top - short * least) / long.reduce((sum, p) => sum + length(p), 0);
              }
              let at = top;
              let total = 0;
              const blocks = chapters.flatMap((chapter) => {
                const id = String(chapter.id).split("/").pop() as string;
                const piece = score.actions.find((p) => p.id === id);
                if (!piece) return [];
                const label = (Object.values(chapter.label ?? {}).flat() as string[])[0];
                const from = at;
                const to = from + Math.max(length(piece) * scale, least);
                at = to;
                const when = total;
                total += length(piece);
                return [{id, piece, label, from, to, when}];
              });
              // Whatever is playing, however it came to be (a seek, a touch, a move
              // mid-performance), the bar is full from 0′ 00″ up to it.
              const sounding = blocks.findIndex((block) => block.id === now);
              const pointed = blocks.find((block) => block.id === pointing);
              // Not while a slip is carried: the line would only chase it.
              const spot = pointed && !lifted && places[pointed.id];
              return (
                <>
                  <ol
                    className="fx-strada__chapters"
                    aria-label={text.chapters}
                    style={{"--top": top, "--length": bottom - top} as React.CSSProperties}
                  >
                    {blocks.map(({id, piece, label, from, to, when}, i) => (
                      <li key={id} style={{"--from": from, "--to": to} as React.CSSProperties}>
                        <button
                          type="button"
                          className={spot && pointed?.id === id ? "is-pointed" : undefined}
                          data-chapter={id}
                          style={{"--done": played.has(id) || i < sounding ? 1 : 0} as React.CSSProperties}
                          title={`${clock(when)} ${label}`}
                          aria-label={`${clock(when)} ${label}`}
                          disabled={!ready}
                          onClick={() => seek(piece)}
                          onPointerEnter={() => setPointing(id)}
                          onPointerLeave={() => unpoint(id)}
                          onFocus={() => setPointing(id)}
                          onBlur={() => unpoint(id)}
                        />
                      </li>
                    ))}
                  </ol>
                  <span className="fx-strada__total" style={{"--y": Math.max(at, top)} as React.CSSProperties}>
                    {clock(total)}
                  </span>
                </>
              );
            })()}
          </div>
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
                onFocus={() => setPointing(piece.id)}
                onBlur={() => unpoint(piece.id)}
              />
            );
          })}
          {/* The marker's line and brace between the pointed block and its action,
              their edges roughened a little, as felt-tip is on paper. */}
          <svg ref={sketch} className="fx-strada__sketch" aria-hidden="true" focusable="false">
            {drawn && (
              <>
                <filter id="fx-strada-marker" x="-5%" y="-20%" width="110%" height="140%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="1964" />
                  <feDisplacementMap in="SourceGraphic" scale={drawn.rough} xChannelSelector="R" yChannelSelector="G" />
                </filter>
                <g filter="url(#fx-strada-marker)">
                  <path d={drawn.line} />
                  <path d={drawn.brace} />
                </g>
              </>
            )}
          </svg>
        </div>
      </div>

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
