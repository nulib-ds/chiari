import type { Application, FederatedPointerEvent, Graphics, GraphicsContext } from 'pixi.js';
import React, { useEffect, useRef } from 'react';
import { withBasePath } from '@nulib/canopy/base-path';
import { createAudioManager, type AudioManager } from './SuonareLaCittaAudio';
import { colorizeMark, loadSafeSvgGraphicsContext, saturatedColor } from './SuonareLaCittaSvg';

// ---------------------------------------------------------------------------
// The exhibit
// ---------------------------------------------------------------------------
// TODO
// Rework ../scripts/glyphs/annotations.py to accept an aspect ratio param.
// Implement 'dock' threshold of 0 volume.
// Test out effects for making audio sound 'far' away or through a wall at low volume.
// Test out blur as a visual indicator of the volume level, instead of alpha.
// Add background 'circle' to annotations, making it significantly easier to drag.
// Test out visual response to eq.
// Test out tempo instead of pitch.
// Implement title label on SonicObject drag.
// Randomize audio start times.

export default function SuonareLaCitta() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    return mountApplication(element);
  }, []);

  return (
    <section style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </section>
  );
}

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function mountApplication(container: HTMLElement): () => void {
  let disposed = false;
  let app: Application | null = null;
  let audio: AudioManager | null = null;

  const unlockAudio = (): void => { void audio?.start(); };
  const marksPath = '/images/marks/';
  const audioFilesPath = '/suonarelacitta/audio/';
  const audioFiles = [
    'airshow.mp3',
    'beethovencarspeaker.mp3',
    'birdsbugsplanes.mp3',
    'churchbellsflorence.mp3',
    'classicaloutdoors.mp3',
    'comedyclub.mp3',
    'construction.mp3',
    'ctabrownline.mp3',
    'folkfestival.mp3',
    'lakemichiganwaves.mp3',
    'percussion.mp3',
    'policesirens.mp3',
    'radioad.mp3',
    'sirenchicago.mp3',
    'streetnoises.mp3',
  ];

  void (async (): Promise<void> => {
    const { Application, Graphics } = await import('pixi.js');
    const newApp = new Application();
    await newApp.init({ background: '#acb0be', resizeTo: container });
    const newAudio = await createAudioManager();

    if (disposed) {
      newApp.destroy(true, { children: true });
      newAudio.dispose();
      return;
    }

    app = newApp;
    audio = newAudio;
    app.canvas.style.touchAction = 'none';
    container.appendChild(app.canvas);

    let dragTarget: Graphics | null = null;
    const contexts = new WeakMap<Graphics, GraphicsContext>();

    function onDragMove(event: FederatedPointerEvent): void {
      if (!dragTarget || !dragTarget.parent || !app) return;

      dragTarget.parent.toLocal(event.global, undefined, dragTarget.position);

      const x = Math.min(1, Math.max(0, dragTarget.x / app.screen.width));
      const y = Math.min(1, Math.max(0, dragTarget.y / app.screen.height));
      const svgContext = contexts.get(dragTarget);

      // Change the actual vector fills/strokes instead of multiplying a tint.
      // if (svgContext) colorizeMark(dragTarget, svgContext, saturatedColor(x * 360));

      dragTarget.alpha = Math.min(1, Math.max(0.25, 1 - (0.75 * y)));
    }

    function onDragStart(this: Graphics): void {
      dragTarget = this;
      app?.stage.on('pointermove', onDragMove);
    }

    function onDragEnd(): void {
      if (!dragTarget) return;
      dragTarget = null;
      app?.stage.off('pointermove', onDragMove);
    }

    function createSonicObject(
      x: number,
      y: number,
      svgContext: GraphicsContext,
      audioPath: string,
    ): void {
      const sonicObject = new Graphics();
      const color = saturatedColor(Math.random() * 360);
      colorizeMark(sonicObject, svgContext, color);

      // Graphics has no `anchor` property: center using its geometry bounds.
      const bounds = sonicObject.getLocalBounds();
      sonicObject.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      sonicObject.position.set(x, y);
      sonicObject.scale.set(0.5);
      sonicObject.eventMode = 'static';
      sonicObject.cursor = 'pointer';
      // Do not use blendMode='screen': it washes saturated colors out on light backgrounds.

      contexts.set(sonicObject, svgContext);
      sonicObject.on('pointerdown', onDragStart, sonicObject);
      app?.stage.addChild(sonicObject);
      // If AudioManager.attach is typed `Sprite`, change that parameter to `Container`:
      // Graphics and Sprite both extend PixiJS Container and expose x/y/position.
      audio?.attach(sonicObject, audioPath);
    }

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerup', onDragEnd);
    app.stage.on('pointerupoutside', onDragEnd);

    const markFilenames = [
      'annotate-01.svg',
      'annotate-02.svg',
      'annotate-03.svg',
      'annotate-04.svg',
      'annotate-05.svg',
      'annotate-06.svg',
      'annotate-07.svg',
      'annotate-08.svg',
      'annotate-09.svg',
      'annotate-10.svg',
      'annotate-11.svg',
      'annotate-12.svg',
      'annotate-13.svg',
      'annotate-14.svg',
      'annotate-15.svg',
      'annotate-16.svg',
      'annotate-17.svg',
      'annotate-18.svg',
      'annotate-19.svg',
      'annotate-20.svg',
    ];

    // Each mark is unique until the list is exhausted, then marks are recycled.
    const selectedMarks = shuffled(markFilenames).slice(0, audioFiles.length);
    if (selectedMarks.length === 0) {
      console.warn('No SVG marks available.');
      return;
    }

    // Fetch and repair malformed point-only paths before PixiJS parses SVG geometry.
    let svgContexts: GraphicsContext[];
    try {
      svgContexts = await Promise.all(
        selectedMarks.map((filename) =>
          loadSafeSvgGraphicsContext(
            withBasePath(`${marksPath}${encodeURIComponent(filename)}`)
          )
        ),
      );
    } catch (error) {
      console.error('Unable to load SVG marks:', error);
      return;
    }

    if (disposed) return;

    audioFiles.forEach((audioFile, index) => {
      createSonicObject(
        Math.floor(Math.random() * app!.screen.width),
        // Keep the docked-at-bottom initial placement from the uploaded file.
        app!.screen.height,
        svgContexts[index % svgContexts.length],
        withBasePath(`${audioFilesPath}${audioFile}`),
      );
    });

    app.ticker.add(() => audio?.updateAudio(app!.screen.height, app!.screen.width));
    container.addEventListener('pointerdown', unlockAudio, { once: true });
  })().catch((error) => {
    console.error('Unable to initialize SuonareLaCitta:', error);
  });

  return () => {
    disposed = true;
    container.removeEventListener('pointerdown', unlockAudio);
    audio?.dispose();
    audio = null;
    if (app) {
      app.destroy(true, { children: true });
      app = null;
    }
  };
}
