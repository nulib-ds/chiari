import React, {useEffect, useId, useRef, useState} from "react";
import {withBasePath} from "@nulib/canopy/base-path";
import {Canvas, decodeContentState, initCloverI18n} from "./clover";

/**
 * The Watch page: a projector drawn in a few ink lines, its screen above it.
 * The visitor loads a film cartridge from the shelf, then turns the play knob;
 * the reels turn and the film runs between them while it plays.
 *
 * The screen is Clover's Canvas, which plays a Manifest's first Canvas, video
 * or sound, with its own seek bar, volume and full screen. The knobs drive its
 * media element and follow it, so its own play button and the knob agree.
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
  /** Under the screen while nothing is loaded. */
  empty: string;
  /** Before the loaded film's name. */
  showing: string;
};

const DEFAULT_LABELS: Labels = {
  items: "Items to view",
  play: "Play",
  eject: "Eject",
  empty: "Load a film, then turn the play knob.",
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

/** A film cartridge, as drawn on the shelf and in the projector's gate. */
function CartridgeShape({className, box}: {className: string; box?: {x: number; y: number; width: number; height: number}}) {
  return (
    <svg className={className} viewBox="0 0 60 40" {...box} aria-hidden="true" focusable="false">
      <path d="M3 2.5 L57.5 3 L57 37.5 L2.5 37 Z" />
      <circle cx="19" cy="17" r="7.5" />
      <circle cx="41" cy="17" r="7.5" />
      <circle cx="19" cy="17" r="1.5" />
      <circle cx="41" cy="17" r="1.5" />
      <path d="M12 31 L48 31" />
    </svg>
  );
}

/** A reel: rim, hub and three holes, turning about its own center. */
function Reel({cx, cy, r, className}: {cx: number; cy: number; r: number; className: string}) {
  const holes = [0, 120, 240].map((deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return <circle key={deg} cx={cx + Math.cos(a) * r * 0.5} cy={cy + Math.sin(a) * r * 0.5} r={r * 0.2} />;
  });
  return (
    <g className={`fx-reel ${className}`}>
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r * 0.12} />
      {holes}
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

  // The knob follows the film, whichever control plays or pauses it.
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
        ) : null}
        <svg className="fx-projector__frame" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path d="M0.3 0.6 L159.7 0.2 L159.6 89.7 L0.2 89.5 Z" />
        </svg>
      </div>

      <p className="fx-projector__caption" aria-live="polite">
        {current ? (
          <>
            {labels.showing}:{" "}
            {current.href ? <a href={withBasePath(current.href)}>{current.work}</a> : current.work}
            {credit(current) ? `. ${credit(current)}.` : "."}
          </>
        ) : (
          labels.empty
        )}
      </p>

      <div className="fx-projector__deck">
        <div className="fx-projector__machine">
          <svg className="fx-projector__drawing" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
            <defs>
              {/* As <Hand>'s wet edge: a slow wobble, so the lines read as drawn. */}
              <filter id={wobble} x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={3} result="edge" />
                <feDisplacementMap in="SourceGraphic" in2="edge" scale={1.6} xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            <g filter={`url(#${wobble})`}>
              {/* Arms holding the reels above the body. */}
              <path d="M68 46 L84 93" />
              <path d="M156 52 L140 93" />
              <Reel cx={68} cy={46} r={36} className="fx-reel--front" />
              <Reel cx={156} cy={52} r={29} className="fx-reel--rear" />
              {/* The film, threaded from reel to reel through the gate. */}
              <path className="fx-film" d="M33 58 C28 86, 54 90, 76 87 C100 84, 122 89, 142 85 C164 81, 188 76, 185 52" />
              {/* Body, and the lens: out of the front, then up a long neck past
                  the reels, looking up at the screen. */}
              <path d="M38 93.5 L190.5 92.5 L191 139 L37.5 139.5 Z" />
              <path d="M191 124.5 L206.5 124 L206 17 L194 17.5 L194 104 L191 104" />
              <ellipse cx={200} cy={15} rx={9} ry={2.8} />
              {/* Feet. */}
              <path d="M52 139.5 L48 146" />
              <path d="M184 139 L188 146" />
              {/* The gate, where a cartridge goes. */}
              <path className="fx-gate" d="M52 101 L100 100.5 L100.5 132 L51.5 132.5 Z" />
            </g>
            {current ? (
              <g className="fx-gate__film" key={current.manifest}>
                <CartridgeShape className="fx-gate__cartridge" box={{x: 54, y: 102, width: 44, height: 29.3}} />
              </g>
            ) : null}
          </svg>

          <button
            type="button"
            className="fx-knob fx-knob--play"
            aria-pressed={playing}
            aria-disabled={media && !dimming ? undefined : true}
            onClick={toggle}
          >
            <svg className="fx-knob__dial" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
              <circle cx="20" cy="20" r="17" />
              <path className="fx-knob__pointer" d="M20 20 L20 6" />
            </svg>
            <span className="fx-knob__label">{labels.play}</span>
          </button>
          <button
            type="button"
            className="fx-knob fx-knob--eject"
            aria-disabled={current && !dimming ? undefined : true}
            onClick={eject}
          >
            <svg className="fx-knob__dial" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
              <circle cx="20" cy="20" r="17" />
              <path className="fx-knob__pointer" d="M20 20 L20 6" />
            </svg>
            <span className="fx-knob__label">{labels.eject}</span>
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
                    <CartridgeShape className="fx-cartridge__shape" />
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
