import type { Application, FederatedPointerEvent, Sprite, Texture } from 'pixi.js';
//import {withBasePath} from "@nulib/canopy/base-path";
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import { createAudioManager, type AudioManager } from "./SuonareLaCittaAudio";
// ---------------------------------------------------------------------------
// The exhibit
// ---------------------------------------------------------------------------
// TODO
// Implement 'dock' threshold of 0 volume
// Test out effects for making audio sound 'far' away or through a wall at low volume
// Test out blur as a visual indicator of the volume level
// Test out visual response to eq
// Test out tempo instead of pitch
// Implement title label on sonicobject drag
// randomize start times.
export default function SuonareLaCitta() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    return mountApplication(element);
  });

  return (
    <section style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </section>
  );
}

function mountApplication(container: HTMLElement): () => void {
  let disposed = false;
  let app: Application | null = null;
  let audio: AudioManager | null = null;

  const unlockAudio = (): void => { void audio?.start(); };

  void (async (): Promise<void> => {
    // Dynamic Import
    const { Application, Assets, Sprite } = await import('pixi.js');

    const newApp: Application = new Application();
    await newApp.init({ background: '#dce0e8', resizeTo: container });
    const newAudio = await createAudioManager();

    // Component unmounted while Pixi was initializing
    if (disposed) {
      newApp.destroy(true, { children: true });
      newAudio.dispose();
      return;
    }
    app = newApp;
    app.canvas.style.touchAction = 'none'; // stop page scroll/zoom while dragging, mobile devices only
    audio = newAudio;

    container.appendChild(app.canvas);

    // Sprite currently being dragged.
    let dragTarget: Sprite | null = null;

    // Dragging Functions for sprites

    // Handle Drag Movement
    function onDragMove(event: FederatedPointerEvent): void {
      // Drag target exists
      if (!dragTarget || !dragTarget.parent) {
        return;
      }
      // Move the sprite
      dragTarget.parent.toLocal(event.global, undefined, dragTarget.position);
      // Tint based on x
      // X: blue -> red
      const y = Math.min(1, Math.max(0, dragTarget.y / app.screen.height));
      const x = Math.min(1, Math.max(0, dragTarget.x / app.screen.width));
      dragTarget.tint = `rgb(${Math.round(x * 255)}, 0, ${Math.round((1 - x) * 255)})`;
      // Alpha based on y
      // Y: alpha 0.25 -> 1
      const alpha =  Math.min(1, Math.max(0.25, 1 - (.75 * y)));
      dragTarget.alpha = alpha;
      return;
    }

    // Handle Drag Target Assignment
    function onDragStart(this: Sprite): void {
      // TODO change Z value, so that the last moved sprite is on top.
      // Make transparent for visual feedback
      //this.alpha = 0.5;
      // Assign drag target
      dragTarget = this;
      // Add event listener
      app?.stage.on('pointermove', onDragMove);

      return;
    }

    // Handle Drag Target Unassignment
    function onDragEnd(): void {
      // Check if drag target exists.
      if (!dragTarget){
        return;
      }
      // Reset transparency.
      //dragTarget.alpha = 1;
      // Unassign drag target
      dragTarget = null;
      // Remove event listener
      app?.stage.off('pointermove', onDragMove);

      return;
    }

    // Create Object
    // Default audio: ../../assets/suonarelacitta/audio/lakemichiganwaves.mp3
    function createSonicObject(x: number, y: number, texture: Texture, audioPath: string): void {
      const sonicObject: Sprite = new Sprite({
        texture,
        anchor: 0.5,
        eventMode: 'static', // Button/UI style event handling.
        cursor: 'pointer', // show the 'hand' cursor on hover.
        scale: 0.5, // arbitrary size
        x,
        y
      });

      // Hook drag start event.
      sonicObject.on('pointerdown', onDragStart, sonicObject);

      app?.stage.addChild(sonicObject);
      audio?.attach(sonicObject, audioPath);

      return;
    }

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    // Hook events
    app.stage.on('pointerup', onDragEnd); // release dragging
    app.stage.on('pointerupoutside', onDragEnd); // release dragging when cursor leaves app area.

    // Generate the Sonic Objects, randomly assign positions.
    createSonicObject(
      Math.floor(Math.random() * app.screen.width), // x pos
      Math.floor(Math.random() * app.screen.height), // y pos
      await Assets.load('https://images-understory.dc.library.northwestern.edu/iiif/3/image/5d574442-d2bc-445e-a4ac-f22eb155c414/cd7cc255-0b4e-444c-811a-ba5f96ecd3a5/0,0,2048,990/512,247/0/default.jpg'),
      "https://cdn.freesound.org/previews/880/880644_5828667-lq.mp3"
    );

    createSonicObject(
      Math.floor(Math.random() * app.screen.width), // x pos
      Math.floor(Math.random() * app.screen.height), // y pos
      await Assets.load('https://images-understory.dc.library.northwestern.edu/iiif/3/image/5d574442-d2bc-445e-a4ac-f22eb155c414/cd7cc255-0b4e-444c-811a-ba5f96ecd3a5/0,0,2048,990/512,247/0/default.jpg'),
      "https://cdn.freesound.org/previews/879/879869_17398983-lq.mp3"
    );

    // On 'Update', update audio
    app.ticker.add(() => audio?.updateAudio(app!.screen.height, app!.screen.width));

    // Hook event to unlock audio
    container.addEventListener('pointerdown', unlockAudio, { once: true });
  })();

  // Cleanup function
  return () => {
    disposed = true;
    if (!app){
      return;
    }
    container.removeEventListener('pointerdown', unlockAudio);
    audio?.dispose();
    audio = null;
    app.destroy(true, { children: true }); // don't mind me, just casually destroying some children.
    app = null;
    return;
  }
}
