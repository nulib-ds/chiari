import type { Application, FederatedPointerEvent, Graphics, GraphicsContext } from 'pixi.js';
import React, { useEffect, useRef, useState } from 'react';
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

type ToolMode = 'move' | 'pencil' | 'eraser';

const toolButtonStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 44,
  height: 44,
  padding: 0,
  borderRadius: 8,
  border: '1px solid rgba(0, 0, 0, 0.2)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  cursor: 'pointer',
  touchAction: 'manipulation',
};

export default function SuonareLaCitta() {
  const containerRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<ToolMode>('move');
  const [mode, setMode] = useState<ToolMode>('move');

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    return mountApplication(element, () => modeRef.current);
  }, []);

  function toggleTool(tool: 'pencil' | 'eraser'): void {
    // Clicking the currently selected tool returns to drag/move mode.
    const nextMode: ToolMode = modeRef.current === tool ? 'move' : tool;
    modeRef.current = nextMode;
    setMode(nextMode);
  }

  return (
    <section style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
      {/* Nerd Fonts official webfont stylesheet, for browsers without local fonts. */}
      <link rel="stylesheet" href="https://www.nerdfonts.com/assets/css/webfont.css" />
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Position is relative to the app container, not the Pixi scene. */}
      <div
        role="toolbar"
        aria-label="Sonic object tools"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button
          type="button"
          aria-label="Pencil tool"
          aria-pressed={mode === 'pencil'}
          title="Pencil: click the canvas to add a sonic object"
          onClick={() => toggleTool('pencil')}
          style={{
            ...toolButtonStyle,
            background: mode === 'pencil' ? '#2b405e' : 'rgba(255, 255, 255, 0.93)',
            color: mode === 'pencil' ? '#fff' : '#2b2d35',
          }}
        >
          <i className="nf nf-fa-pencil" aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }} />
        </button>
        <button
          type="button"
          aria-label="Eraser tool"
          aria-pressed={mode === 'eraser'}
          title="Eraser: click within 10 pixels of a sonic object to remove it"
          onClick={() => toggleTool('eraser')}
          style={{
            ...toolButtonStyle,
            background: mode === 'eraser' ? '#2b405e' : 'rgba(255, 255, 255, 0.93)',
            color: mode === 'eraser' ? '#fff' : '#2b2d35',
          }}
        >
          <i className="nf nf-fa-eraser" aria-hidden="true" style={{ fontSize: 22, lineHeight: 1 }} />
        </button>
      </div>
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

function mountApplication(container: HTMLElement, getMode: () => ToolMode): () => void {
  let disposed = false;
  let app: Application | null = null;
  let audio: AudioManager | null = null;

  const unlockAudio = (): void => {
    void audio?.start().catch((error: unknown) => console.error('Unable to start audio:', error));
  };
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
    container.addEventListener('pointerdown', unlockAudio, { once: true });

    let dragTarget: Graphics | null = null;
    const contexts = new WeakMap<Graphics, GraphicsContext>();
    const sonicObjects = new Set<Graphics>();
    let svgContexts: GraphicsContext[] = [];

    function onDragMove(event: FederatedPointerEvent): void {
      if (!dragTarget || !dragTarget.parent || !app || getMode() !== 'move') return;

      dragTarget.parent.toLocal(event.global, undefined, dragTarget.position);

      const x = Math.min(1, Math.max(0, dragTarget.x / app.screen.width));
      const y = Math.min(1, Math.max(0, dragTarget.y / app.screen.height));
      const svgContext = contexts.get(dragTarget);

      // Change the actual vector fills/strokes instead of multiplying a tint.
      // if (svgContext) colorizeMark(dragTarget, svgContext, saturatedColor(x * 360));

      dragTarget.alpha = Math.min(1, Math.max(0.25, 1 - (0.75 * y)));
    }

    function onDragStart(this: Graphics): void {
      if (getMode() !== 'move') return;
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
      sonicObjects.add(sonicObject);
      sonicObject.on('pointerdown', onDragStart, sonicObject);
      app?.stage.addChild(sonicObject);
      audio?.attach(sonicObject, audioPath);
    }

    function eraseClosestSonicObject(x: number, y: number): void {
      const margin = 10;
      let closest: Graphics | null = null;
      let closestBoundsDistance = Infinity;
      let closestCenterDistance = Infinity;

      for (const sonicObject of sonicObjects) {
        // Test the visible SVG bounds, expanded by +/- 10 screen units.
        const box = sonicObject.getBounds();
        const dx = Math.max(box.x - x, 0, x - (box.x + box.width));
        const dy = Math.max(box.y - y, 0, y - (box.y + box.height));
        if (dx > margin || dy > margin) continue;

        const boundsDistance = dx * dx + dy * dy;
        const centerDistance = (sonicObject.x - x) ** 2 + (sonicObject.y - y) ** 2;
        if (
          boundsDistance < closestBoundsDistance ||
          (boundsDistance === closestBoundsDistance && centerDistance < closestCenterDistance)
        ) {
          closest = sonicObject;
          closestBoundsDistance = boundsDistance;
          closestCenterDistance = centerDistance;
        }
      }

      if (!closest) return;
      if (dragTarget === closest) onDragEnd();
      sonicObjects.delete(closest);
      audio?.remove(closest);
      closest.destroy();
    }

    function onStagePointerDown(event: FederatedPointerEvent): void {
      if (!app || getMode() === 'move') return;
      const { x, y } = app.stage.toLocal(event.global);

      if (getMode() === 'pencil') {
        if (svgContexts.length === 0) return;
        const context = svgContexts[Math.floor(Math.random() * svgContexts.length)];
        const audioFile = audioFiles[Math.floor(Math.random() * audioFiles.length)];
        createSonicObject(x, y, context, withBasePath(`${audioFilesPath}${audioFile}`));
      } else if (getMode() === 'eraser') {
        eraseClosestSonicObject(x, y);
      }
    }

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', onStagePointerDown);
    app.stage.on('pointerup', onDragEnd);
    app.stage.on('pointerupoutside', onDragEnd);

    // Generate background paper svg.
    const paperBgContext = await loadSafeSvgGraphicsContext('/suonarelacitta/college_ruled_letter.svg');
    if (disposed) return;
    const paperBg = new Graphics(paperBgContext);
    const bounds = paperBg.getLocalBounds();
    paperBg.pivot.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    paperBg.eventMode = 'none';
    app.stage.addChild(paperBg);

    let paperScreenWidth = -1;
    let paperScreenHeight = -1;
    function updatePaperBg(): void {
      if (!app) return;
      const { width, height } = app.screen;
      if (width === paperScreenWidth && height === paperScreenHeight) return;

      paperBg.scale.set(height / bounds.height);
      paperBg.position.set(width / 2, height / 2);
      app.stage.hitArea = app.screen;
      paperScreenWidth = width;
      paperScreenHeight = height;
    }
    updatePaperBg();

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

    // audioFiles.forEach((audioFile, index) => {
    //   createSonicObject(
    //     Math.floor(Math.random() * app!.screen.width),
    //     // Keep the docked-at-bottom initial placement from the uploaded file.
    //     app!.screen.height,
    //     svgContexts[index % svgContexts.length],
    //     withBasePath(`${audioFilesPath}${audioFile}`),
    //   );
    // });

    app.ticker.add(() => {
      updatePaperBg();
      audio?.updateAudio(app!.screen.height, app!.screen.width);
    });
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
