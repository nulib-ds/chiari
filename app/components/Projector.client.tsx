import React, {useEffect, useId, useRef, useState} from "react";
import {withBasePath} from "@nulib/canopy/base-path";
import {Canvas, decodeContentState, initCloverI18n} from "./clover";
import {roughBox, roughLine, roughLoop, roughRun, seeded, smooth} from "./roughLines";
import type {Pt, Rand} from "./roughLines";

/**
 * The Watch page: a projector drawn in a few ink lines, its screen above it.
 * The visitor loads a film cartridge from the shelf, then presses Play; the
 * reels turn and the film runs between them while it plays.
 *
 * The screen is Clover's Canvas, which plays a Manifest's first Canvas, video
 * or sound, with its own seek bar, volume and full screen. Eject and Play are
 * push buttons on the projector's body with an interlock, as on a tape deck:
 * Play stays down while the film runs and Eject while the gate is empty, so
 * pressing one lets the other up. They drive the Canvas's media element and
 * follow it, so its own play button and the projector's agree.
 *
 * The first cartridge is loaded to begin with. The page's address names what
 * is on the screen and how far into it, so it can be shared:
 * `?iiif-content=<the Manifest>&t=<seconds>`. `iiif-content` is IIIF Content
 * State's parameter, and may also carry a content state, as Clover writes one.
 * Only a film on the shelf is loaded from a link.
 *
 * <Projector
 *   cartridges={[
 *     {manifest: "https://…/manifest.json", work: "Per Arco", by: "Charlotte Moorman", date: "1983", href: "/works/per-arco-performance-1.html"},
 *   ]}
 *   labels={{items: "Items to view", play: "Play", eject: "Eject"}}
 * />
 */

export type Cartridge = {
  /** The recording's IIIF Manifest; the screen plays its first Canvas. */
  manifest: string;
  /** The work it is of, such as "Per Arco". */
  work: string;
  /** Who performs it, or made it. */
  by?: string;
  date?: string;
  /** Its work page, root-relative (the base path is added). */
  href?: string;
};

type Labels = {
  /** The shelf's name, for screen readers: it is not shown. */
  items: string;
  play: string;
  eject: string;
  /** In the middle of the screen while nothing is loaded. */
  empty: string;
  /** Before the loaded film's name. */
  showing: string;
};

const DEFAULT_LABELS: Labels = {
  items: "Items to view",
  play: "Play",
  eject: "Eject",
  empty: "Load a film, then press Play.",
  showing: "Now showing",
};

const credit = (c: Cartridge) => [c.by, c.date].filter(Boolean).join(", ");

/** The site's twenty annotation gestures (annotations.css) and its paints. */
const GESTURES = Array.from({length: 20}, (_, i) => i + 1);
const PAINTS = ["blue", "green", "yellow", "pink"];

/** Any one of `items` but `not`, so the same mark never comes twice running. */
function pick<T>(items: T[], not?: T): T {
  const pool = items.filter((item) => item !== not);
  return pool[Math.floor(Math.random() * pool.length)];
}

type Mark = {gesture: number; color: string; key: number};

/** A new mark, unlike the last in both gesture and paint. */
const nextMark = (last: Mark | null): Mark => ({
  gesture: pick(GESTURES, last?.gesture),
  color: pick(PAINTS, last?.color),
  key: (last?.key || 0) + 1,
});

const first = (v: any) => (Array.isArray(v) ? v[0] : v);

/** How long the lamp takes to die on eject; watch.css's fx-lamp-off. */
const LAMP_OFF_MS = 900;

/**
 * The page's language, as Canopy sets it on <html> for each locale (en, it).
 * Clover would rather speak the browser's language where it has strings for
 * it, so an English browser would hear English controls on the Italian page;
 * the language toggle is the visitor's choice, so the page's wins.
 */
const pageLanguage = () => (typeof document !== "undefined" && document.documentElement.lang) || "en";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* --- The shareable address ------------------------------------------- */

const CONTENT_PARAM = "iiif-content";
const TIME_PARAM = "t";

/** Seconds, from a number or its text; null unless past the start. */
function secondsOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * What the page's address asks the screen to show: `iiif-content` as a
 * Manifest's URI, or as a content state (JSON or base64url, which Clover
 * decodes) whose target names its Manifest and perhaps a time; and `t`,
 * seconds in, which wins over the content state's time.
 */
function readAddress(): {manifest: string; time: number | null} | null {
  const params = new URLSearchParams(window.location.search);
  const content = params.get(CONTENT_PARAM);
  if (!content) return null;
  let manifest: string | null = null;
  let time: number | null = null;
  if (/^https?:\/\//i.test(content)) {
    manifest = content;
  } else {
    const state = decodeContentState(content);
    const target = first(state?.target) ?? state;
    const source = first(target?.source) ?? target;
    manifest = source?.type === "Manifest" ? source.id : first(source?.partOf)?.id || null;
    const fragment = String(source?.id || target?.id || "").match(/[#&]t=([\d.]+)/);
    time = secondsOf(fragment?.[1]) ?? secondsOf(first(target?.selector)?.t);
  }
  if (!manifest) return null;
  return {manifest, time: secondsOf(params.get(TIME_PARAM)) ?? time};
}

/**
 * Write what is loaded, and the whole seconds into it, to the address, in
 * place: no new history entries. The other parameters and the hash stay.
 */
function writeAddress(manifest: string | null, time: number | null) {
  const url = new URL(window.location.href);
  if (manifest) url.searchParams.set(CONTENT_PARAM, manifest);
  else url.searchParams.delete(CONTENT_PARAM);
  const seconds = time == null ? 0 : Math.floor(time);
  if (manifest && seconds > 0) url.searchParams.set(TIME_PARAM, String(seconds));
  else url.searchParams.delete(TIME_PARAM);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

/**
 * The poster frame a Manifest offers for its recording: the first Canvas's
 * thumbnail, else the Manifest's own (Presentation 3, or 2's sequences).
 */
function posterOf(manifest: any): string | null {
  const idOf = (v: any) => {
    const t = first(v);
    if (!t) return null;
    return typeof t === "string" ? t : t.id || t["@id"] || null;
  };
  const canvas = first(manifest?.items) || first(first(manifest?.sequences)?.canvases);
  return idOf(canvas?.thumbnail) || idOf(manifest?.thumbnail);
}

/* --- The drawing ---------------------------------------------------------
 * Everything is drawn by roughLines.ts: strokes whose ends land a little off
 * and run past their corners, circles that don't quite close. Weights vary,
 * from the body's bold outline to thin details, and the bolder lines are gone
 * over a second time, lighter, without quite following the first.
 * ---------------------------------------------------------------------- */

/** A drawn line: its path, its weight, and for bolder lines a second pass. */
type Line = {d: string; w: number; again?: string};

/** Draw the same stroke twice, as a marker goes back over an outline. */
const twice = (make: () => string, w: number): Line => ({d: make(), w, again: make()});

type ReelArt = {cx: number; cy: number; lines: Line[]};

/** A reel: rim, hub and three holes. */
function drawReel(rand: Rand, cx: number, cy: number, r: number): ReelArt {
  const lines: Line[] = [
    twice(() => roughLoop(rand, cx, cy, r, r, {jitter: 0.016, overlap: 0.5}), 2.1),
    {d: roughLoop(rand, cx, cy, r * 0.12, r * 0.12, {jitter: 0.1}), w: 1.6},
  ];
  for (const deg of [0, 120, 240]) {
    const a = ((deg - 90) * Math.PI) / 180;
    const hole = roughLoop(rand, cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5, r * 0.2, r * 0.2, {jitter: 0.07});
    lines.push({d: hole, w: 1.3});
  }
  return {cx, cy, lines};
}

/** The projector, drawn once: the same on every load. */
const PROJECTOR = (() => {
  const rand = seeded(1926);
  const body: Pt[] = [[38, 93.5], [190.5, 92.5], [191, 139], [37.5, 139.5]];
  const neck: Pt[] = [[191, 124.5], [206.5, 124], [206, 17], [194, 17.5], [194, 104], [191, 104]];
  const gate: Pt[] = [[52, 101], [100, 100.5], [100.5, 132], [51.5, 132.5]];
  return {
    // Arms holding the reels above the body.
    arms: [
      {d: roughLine(rand, [68, 46], [84, 93], {jitter: 0.5, over: 1.5}), w: 2},
      {d: roughLine(rand, [156, 52], [140, 93], {jitter: 0.5, over: 1.5}), w: 1.7},
    ] as Line[],
    front: drawReel(rand, 68, 46, 36),
    rear: drawReel(rand, 156, 52, 29),
    // Body, and the lens: out of the front, then up a long neck past the
    // reels, looking up at the screen.
    body: twice(() => roughBox(rand, body, {jitter: 0.7, over: 3}), 2.4),
    neck: twice(() => roughRun(rand, neck, {jitter: 0.6, over: 1.8}), 1.9),
    lens: {d: roughLoop(rand, 200, 15, 9, 2.8, {jitter: 0.05, overlap: 0.7}), w: 1.7} as Line,
    feet: [
      {d: roughLine(rand, [52, 139.5], [48, 146], {jitter: 0.4, over: 1}), w: 2.4},
      {d: roughLine(rand, [184, 139], [188, 146], {jitter: 0.4, over: 1}), w: 2.2},
    ] as Line[],
    // The gate, where a cartridge goes.
    gate: roughBox(rand, gate, {jitter: 0.5, over: 1.4}),
  };
})();

/** Where a key's cap stands when it is out, and how far down and right its seat is. */
const KEY_CAP: Pt[] = [[5, 5], [31, 5], [31, 31], [5, 31]];
const KEY_TRAVEL = 4;

/**
 * A push button on the body: a cap standing proud of its seat, up and to the
 * left of it, with its sign on it. Pressed, the cap sits down into the seat
 * (watch.css moves it by KEY_TRAVEL). Each key is drawn on its own.
 */
const drawKey = (seed: number, sign: "play" | "eject") => {
  const rand = seeded(seed);
  const seat = KEY_CAP.map(([x, y]): Pt => [x + KEY_TRAVEL, y + KEY_TRAVEL]);
  const signs =
    sign === "play"
      ? [roughBox(rand, [[13.5, 10.5], [24.5, 18], [13.5, 25.5]], {jitter: 0.5, over: 0.8})]
      : [
          roughBox(rand, [[11, 19.5], [18, 10.5], [25, 19.5]], {jitter: 0.5, over: 0.8}),
          roughLine(rand, [11, 24.5], [25, 24.5], {jitter: 0.5, over: 0.6}),
        ];
  return {
    seat: roughBox(rand, seat, {jitter: 0.5, over: 1.2}),
    cap: roughBox(rand, KEY_CAP, {jitter: 0.5, over: 1.4}),
    signs,
  };
};
const KEYS = {eject: drawKey(29, "eject"), play: drawKey(11, "play")};

/** A key's drawing: its seat, and over it the cap, which moves. */
function KeyDrawing({art}: {art: ReturnType<typeof drawKey>}) {
  return (
    <svg className="fx-key__drawing" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path className="fx-key__seat" d={art.seat} />
      <g className="fx-key__cap">
        {/* The cap is paper, so it hides the seat it stands over. */}
        <path className="fx-key__face" d={`M${KEY_CAP.map((p) => p.join(" ")).join(" L")} Z`} />
        <path className="fx-key__edge" d={art.cap} />
        {art.signs.map((d, k) => (
          <path key={k} className="fx-key__sign" d={d} />
        ))}
      </g>
    </svg>
  );
}

type CartridgeArt = {tilt: number; lines: Line[]};
const drawnCartridges = new Map<number, CartridgeArt>();

/**
 * One film's cartridge. All keep the rough shape, a box with two reels and a
 * label, but no two are drawn alike: each has its own corners, its own tilt
 * and line weights, its tape wound further onto one reel or the other, and
 * one of five labels (a line, two lines, a box, a scribble, a line and a
 * dot). `variant` is the film's place on the shelf, so a film keeps its
 * cartridge from load to load, and takes it into the gate.
 */
function drawCartridge(variant: number): CartridgeArt {
  const drawn = drawnCartridges.get(variant);
  if (drawn) return drawn;
  const rand = seeded(4099 + variant * 7919);
  const nudge = (n: number, by: number) => n + (rand() - 0.5) * 2 * by;
  const corners = ([[3.5, 3.5], [56.5, 3.5], [56.5, 36.5], [3.5, 36.5]] as Pt[]).map(
    ([x, y]): Pt => [nudge(x, 1.6), nudge(y, 1.6)],
  );
  const wound = 0.15 + rand() * 0.7;
  const left = {x: nudge(19, 1.2), y: nudge(16.5, 1), r: 5 + wound * 4.5};
  const right = {x: nudge(41, 1.2), y: nudge(16.5, 1), r: 5 + (1 - wound) * 4.5};
  const reelWeight = 1.3 + rand() * 0.6;
  const lines: Line[] = [
    twice(() => roughBox(rand, corners, {jitter: 0.6, over: 2.6}), 2 + rand() * 0.9),
    {d: roughLoop(rand, left.x, left.y, left.r, left.r, {jitter: 0.05}), w: reelWeight},
    {d: roughLoop(rand, right.x, right.y, right.r, right.r, {jitter: 0.05}), w: reelWeight},
    {d: roughLoop(rand, left.x, left.y, 1.4, 1.4, {jitter: 0.15}), w: 1.2},
    {d: roughLoop(rand, right.x, right.y, 1.4, 1.4, {jitter: 0.15}), w: 1.2},
  ];
  const labelKinds: Array<() => string[]> = [
    () => [roughLine(rand, [11, 31], [49, 31], {jitter: 0.7, over: 1.5})],
    () => [
      roughLine(rand, [11, 29.5], [42, 29.5], {jitter: 0.6}),
      roughLine(rand, [11, 33.5], [30, 33.5], {jitter: 0.6}),
    ],
    () => [roughBox(rand, [[13, 27.5], [47, 27.5], [47, 34], [13, 34]], {jitter: 0.5, over: 1.2})],
    () => [smooth(Array.from({length: 9}, (_, k): Pt => [nudge(13 + k * 4.2, 0.6), nudge(k % 2 ? 33.5 : 28.5, 0.7)]))],
    () => [
      roughLine(rand, [14, 31], [36, 31], {jitter: 0.6, over: 1}),
      roughLoop(rand, 45, 31, 1.8, 1.8, {jitter: 0.12}),
    ],
  ];
  const labelWeight = 1.3 + rand() * 0.9;
  for (const d of labelKinds[variant % labelKinds.length]()) lines.push({d, w: labelWeight});
  const art = {tilt: (rand() - 0.5) * 6, lines};
  drawnCartridges.set(variant, art);
  return art;
}

/** A drawn line, and its second pass where it has one. */
function Stroke({line}: {line: Line}) {
  return (
    <>
      <path d={line.d} strokeWidth={line.w} />
      {line.again ? <path className="fx-rough__again" d={line.again} strokeWidth={line.w * 0.5} /> : null}
    </>
  );
}

/** A film cartridge, as drawn on the shelf and in the projector's gate. */
function CartridgeShape({
  className,
  variant,
  box,
  filter,
}: {
  className: string;
  variant: number;
  box?: {x: number; y: number; width: number; height: number};
  filter?: string;
}) {
  const art = drawCartridge(variant);
  return (
    <svg className={className} viewBox="0 0 60 40" {...box} aria-hidden="true" focusable="false">
      <g transform={`rotate(${art.tilt.toFixed(1)} 30 20)`} filter={filter}>
        {art.lines.map((line, k) => (
          <Stroke key={k} line={line} />
        ))}
      </g>
    </svg>
  );
}

/** A reel, turning about its hub. */
function Reel({art, className}: {art: ReelArt; className: string}) {
  return (
    <g className={`fx-reel ${className}`} style={{transformOrigin: `${art.cx}px ${art.cy}px`}}>
      {art.lines.map((line, k) => (
        <Stroke key={k} line={line} />
      ))}
    </g>
  );
}

export default function Projector({
  cartridges = [],
  labels: given = {},
}: {
  cartridges?: Cartridge[];
  labels?: Partial<Labels>;
}) {
  const labels = {...DEFAULT_LABELS, ...given};

  // Clover's controls on the screen (play, seek, volume, captions, full
  // screen, the keys) speak the page's language. Clover holds the choice for
  // this page only, and the language toggle loads the other page.
  const [language] = useState(pageLanguage);
  useEffect(() => {
    initCloverI18n().chooseInterfaceLanguage(language);
  }, [language]);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const wobble = `fx-wobble-${uid}`;
  const shelfLabel = `fx-items-${uid}`;

  // What to load first: the film a shared link names, at its time, else the
  // first on the shelf. (A client component renders in the browser only.)
  const [start] = useState(() => {
    const asked = readAddress();
    const index = asked ? cartridges.findIndex((c) => c.manifest === asked.manifest) : -1;
    if (asked && index >= 0) return {index, time: asked.time};
    return {index: cartridges.length ? 0 : null, time: null};
  });

  const [loaded, setLoaded] = useState<number | null>(start.index);
  const [media, setMedia] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [poster, setPoster] = useState<string | null>(null);
  // The paint mark laid over a cartridge's empty place once it is loaded.
  const [mark, setMark] = useState<Mark | null>(() => (start.index == null ? null : nextMark(null)));
  // A shared link's time, until the film is far enough along to go to it.
  const seekTo = useRef<number | null>(start.time);
  // Ejecting: the lamp dies, then the cartridge leaves.
  const [dimming, setDimming] = useState(false);
  const dimTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (dimTimer.current) window.clearTimeout(dimTimer.current);
  }, []);

  const current = loaded == null ? null : cartridges[loaded] || null;

  // Play follows the film, whichever control plays or pauses it.
  useEffect(() => {
    if (!media) {
      setPlaying(false);
      return;
    }
    const sync = () => setPlaying(!media.paused && !media.ended);
    const events = ["play", "playing", "pause", "ended", "emptied"];
    events.forEach((e) => media.addEventListener(e, sync));
    sync();
    return () => events.forEach((e) => media.removeEventListener(e, sync));
  }, [media]);

  // The loaded film's poster frame, when its Manifest has one. Clover loads
  // the same Manifest for the screen, so this is usually the browser's copy.
  const manifest = current?.manifest;
  useEffect(() => {
    setPoster(null);
    if (!manifest) return;
    const controller = new AbortController();
    fetch(manifest, {signal: controller.signal})
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => setPoster(json ? posterOf(json) : null))
      .catch(() => {});
    return () => controller.abort();
  }, [manifest]);

  // Shown on the screen until the film starts, as a projector's first frame.
  useEffect(() => {
    if (media && poster) media.poster = poster;
  }, [media, poster]);

  // A shared link's time: go there once the film knows its length.
  useEffect(() => {
    if (!media || seekTo.current == null) return;
    const go = () => {
      const time = seekTo.current;
      if (time == null) return;
      seekTo.current = null;
      media.currentTime = Number.isFinite(media.duration) ? Math.min(time, media.duration) : time;
    };
    if (media.readyState >= 1) go();
    else media.addEventListener("loadedmetadata", go, {once: true});
    return () => media.removeEventListener("loadedmetadata", go);
  }, [media]);

  // The address names the loaded film, so it can be shared, and an unseen
  // shared time stays in it until the film has gone there.
  useEffect(() => {
    writeAddress(manifest ?? null, seekTo.current);
  }, [manifest]);

  // ...and how far in the film is, in whole seconds: at most once a second
  // while it plays, and on every pause and seek.
  useEffect(() => {
    if (!media || !manifest) return;
    let last = -1;
    const note = () => {
      if (seekTo.current != null) return;
      const seconds = Math.floor(media.currentTime || 0);
      if (seconds === last) return;
      last = seconds;
      writeAddress(manifest, seconds);
    };
    const events = ["timeupdate", "seeked", "pause"];
    events.forEach((e) => media.addEventListener(e, note));
    return () => events.forEach((e) => media.removeEventListener(e, note));
  }, [media, manifest]);

  const unload = () => {
    if (media) media.pause();
    setMedia(null);
  };

  const stopDimming = () => {
    if (dimTimer.current) window.clearTimeout(dimTimer.current);
    dimTimer.current = null;
    setDimming(false);
  };

  const finishEject = () => {
    stopDimming();
    unload();
    seekTo.current = null;
    setLoaded(null);
  };

  // The lamp dies on the paused film, then the screen is left black and the
  // cartridge comes out. At once, for a reader who asks for reduced motion.
  const eject = () => {
    if (!current || dimming) return;
    if (media) media.pause();
    if (reducedMotion()) {
      finishEject();
      return;
    }
    setDimming(true);
    dimTimer.current = window.setTimeout(finishEject, LAMP_OFF_MS);
  };

  // A cartridge on the shelf: the loaded one goes back (eject); any other
  // takes its place at once, and its lamp warms up.
  const load = (index: number) => {
    if (index === loaded) {
      eject();
      return;
    }
    stopDimming();
    unload();
    seekTo.current = null;
    setLoaded(index);
    setMark(nextMark);
  };

  const toggle = () => {
    if (!media || dimming) return;
    if (media.paused || media.ended) media.play().catch(() => {});
    else media.pause();
  };

  const state = [current ? "is-loaded" : "", playing ? "is-playing" : "", dimming ? "is-dimming" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`fx-projector ${state}`.trim()}>
      <div className="fx-projector__screen">
        {current ? (
          // The lamp: each film warms up on its own, from black (watch.css).
          <div className="fx-projector__film" key={current.manifest}>
            <Canvas
              iiifContent={current.manifest}
              language={language}
              label={[current.work, credit(current)].filter(Boolean).join(", ")}
              className="fx-projector__canvas"
              onMediaElement={setMedia}
              options={{hideDelay: 2000}}
            />
          </div>
        ) : (
          // Nothing loaded: what to do, in the middle of the dark screen. The
          // caption below says the same to a screen reader, once.
          <p className="fx-projector__idle" aria-hidden="true">
            {labels.empty}
          </p>
        )}
      </div>

      {/* The film's name, under the screen. With nothing loaded the line is
          empty but keeps its height, so loading and ejecting move nothing. */}
      <p className="fx-projector__caption" aria-live="polite">
        {current ? (
          <>
            {labels.showing}:{" "}
            {current.href ? <a href={withBasePath(current.href)}>{current.work}</a> : current.work}
            {credit(current) ? `. ${credit(current)}.` : "."}
          </>
        ) : (
          <span className="sr-only">{labels.empty}</span>
        )}
      </p>

      <div className="fx-projector__deck">
        <div className="fx-projector__machine">
          <svg className="fx-projector__drawing" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
            <defs>
              {/* As <Hand>'s wet edge: a slow wobble over the drawn lines, which
                  the shelf's cartridges share. */}
              <filter id={wobble} x="-8%" y="-8%" width="116%" height="116%">
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} result="edge" />
                <feDisplacementMap in="SourceGraphic" in2="edge" scale={2} xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            <g filter={`url(#${wobble})`}>
              {PROJECTOR.arms.map((line, k) => (
                <Stroke key={k} line={line} />
              ))}
              <Reel art={PROJECTOR.front} className="fx-reel--front" />
              <Reel art={PROJECTOR.rear} className="fx-reel--rear" />
              {/* The film, threaded from reel to reel through the gate. */}
              <path className="fx-film" d="M33 58 C28 86, 54 90, 76 87 C100 84, 122 89, 142 85 C164 81, 188 76, 185 52" />
              <Stroke line={PROJECTOR.body} />
              <Stroke line={PROJECTOR.neck} />
              <Stroke line={PROJECTOR.lens} />
              {PROJECTOR.feet.map((line, k) => (
                <Stroke key={k} line={line} />
              ))}
              <path className="fx-gate" d={PROJECTOR.gate} />
            </g>
            {current && loaded != null ? (
              <g className="fx-gate__film" key={current.manifest}>
                <CartridgeShape
                  className="fx-gate__cartridge"
                  variant={loaded}
                  box={{x: 54, y: 102, width: 44, height: 29.3}}
                  filter={`url(#${wobble})`}
                />
              </g>
            ) : null}
          </svg>

          {/* Eject is down while the gate is empty, Play while the film runs:
              pressing either lets the other up. */}
          <button
            type="button"
            className="fx-key fx-key--eject"
            aria-pressed={!current || dimming}
            aria-disabled={current && !dimming ? undefined : true}
            onClick={eject}
          >
            <KeyDrawing art={KEYS.eject} />
            <span className="fx-key__label">{labels.eject}</span>
          </button>
          <button
            type="button"
            className="fx-key fx-key--play"
            aria-pressed={playing}
            aria-disabled={media && !dimming ? undefined : true}
            onClick={toggle}
          >
            <KeyDrawing art={KEYS.play} />
            <span className="fx-key__label">{labels.play}</span>
          </button>
        </div>

        <div className="fx-projector__shelf" role="group" aria-labelledby={shelfLabel}>
          <p className="sr-only" id={shelfLabel}>
            {labels.items}
          </p>
          <ul role="list">
            {cartridges.map((c, i) => (
              <li key={c.manifest}>
                <button
                  type="button"
                  className="fx-cartridge"
                  aria-pressed={loaded === i}
                  data-fx-ann-color={loaded === i && mark ? mark.color : undefined}
                  onClick={() => load(i)}
                >
                  <span className="fx-cartridge__face">
                    <CartridgeShape className="fx-cartridge__shape" variant={i} filter={`url(#${wobble})`} />
                    {loaded === i && mark ? (
                      <span
                        key={mark.key}
                        className="fx-cartridge__mark"
                        data-fx-ann={mark.gesture}
                        data-fx-ann-color={mark.color}
                        aria-hidden="true"
                      />
                    ) : null}
                  </span>
                  <span className="fx-cartridge__work">{c.work}</span>
                  {credit(c) ? <span className="fx-cartridge__by">{credit(c)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
