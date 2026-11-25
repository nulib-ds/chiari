import {withBasePath} from "@nulib/canopy/base-path";
import React, {useEffect, useRef, useState} from "react";
import {localise, rebaser} from "./LaStrada.client";

/**
 * For debugging, not part of the exhibit: Clover 4's own viewer, showing the
 * arrangement <LaStrada> makes, as it is made. The exhibit announces a
 * "la-strada:manifest" event whenever the arrangement changes (a slip let go,
 * Original, Clear, Shuffle, Reset), with the manifest that carries the new
 * annotation page and its chapters; each one is handed to the viewer, so what
 * Clover reads back (the annotations in order, their regions and times, the
 * chapters) can be checked against the sheet. Its images and sounds are named
 * where the site is published; they are given to the viewer from wherever this
 * page is served, as the exhibit plays them, so it works on localhost too.
 *
 * It uses Clover's <clover-viewer> web component, which brings its own React,
 * so the exhibit's bundle stays the helpers' size (see app/components/clover.ts).
 * It is loaded from jsDelivr at the version in package.json. Remove
 * <LaStradaDebug /> from the page to take it away.
 */

const CLOVER = "https://cdn.jsdelivr.net/npm/@nulib/clover@4.10.2/dist/web-components/viewer/index.umd.js";

type Arrangement = {items: any[]; [key: string]: unknown};

/** Clover's viewer, once, for however many debuggers are on the page. */
function loadClover(): Promise<void> {
  if (customElements.get("clover-viewer")) return Promise.resolve();
  if (!document.querySelector(`script[src="${CLOVER}"]`)) {
    const script = document.createElement("script");
    script.src = CLOVER;
    document.head.appendChild(script);
  }
  return Promise.race([
    customElements.whenDefined("clover-viewer").then(() => undefined),
    new Promise<void>((_, reject) => window.setTimeout(() => reject(new Error("Clover did not load")), 20000)),
  ]);
}

/** `manifest` is the exhibit's own, as <LaStrada> is given it, to learn where its resources are served. */
export default function LaStradaDebug({manifest = "/la-strada/manifest.json"}: {manifest?: string}) {
  const viewer = useRef<HTMLElement & {iiifContent?: unknown}>(null);
  const latest = useRef<Arrangement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [updates, setUpdates] = useState(0);
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    loadClover().then(
      () => live && setReady(true),
      () => live && setFailed(true)
    );
    const url = new URL(withBasePath(manifest), window.location.href).href;
    const rebase = fetch(url)
      .then((response) => response.json())
      .then((json) => rebaser(json, url))
      .catch(() => (id: string) => id);
    let seen = 0;
    const take = async (e: Event) => {
      const arranged = localise((e as CustomEvent<Arrangement>).detail, await rebase);
      if (!live) return;
      // Clover keeps a manifest it has read by its id and would show the first
      // arrangement for ever, so each is given to it under an id of its own.
      arranged.id = `${arranged.id}?debug=${++seen}`;
      latest.current = arranged;
      if (viewer.current) viewer.current.iiifContent = arranged;
      // The order the annotation page now gives, as its annotations' last path parts.
      const page = arranged.items?.[0]?.annotations?.[0];
      setOrder((page?.items ?? []).map((a: any) => String(a.id).split("/").pop()));
      setUpdates((n) => n + 1);
    };
    document.addEventListener("la-strada:manifest", take);
    return () => {
      live = false;
      document.removeEventListener("la-strada:manifest", take);
    };
  }, [manifest]);

  // The viewer is drawn once Clover is defined: give it whatever came before.
  useEffect(() => {
    if (ready && viewer.current && latest.current) viewer.current.iiifContent = latest.current;
  }, [ready]);

  return (
    <section className="fx-strada-debug" aria-label="Debugging: the arrangement in Clover">
      <p className="fx-strada-debug__note">
        <strong>Debugging</strong> The arrangement as Clover 4 reads it, rebuilt {updates}{" "}
        {updates === 1 ? "time" : "times"}: {order.length} annotations in order
        {order.length ? `, ${order.join(" → ")}` : ""}.
      </p>
      {failed ? (
        <p className="fx-strada-debug__note">Clover's viewer could not be loaded from {CLOVER}.</p>
      ) : ready ? (
        React.createElement("clover-viewer", {ref: viewer, class: "fx-strada-debug__viewer", "panel-open": ""})
      ) : (
        <p className="fx-strada-debug__note">Loading Clover…</p>
      )}
    </section>
  );
}
