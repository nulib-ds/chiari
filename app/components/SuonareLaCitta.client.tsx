import type { Application, FederatedPointerEvent, Sprite, Texture } from 'pixi.js';
//import {withBasePath} from "@canopy-iiif/app/base-path";
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
// ---------------------------------------------------------------------------
// The exhibit
// ---------------------------------------------------------------------------

export default function SuonareLaCitta() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    return mountApplication(element);
  });

  return (
    <section style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
    </section>
  );
}

function mountApplication(container: HTMLElement): () => void {
  let disposed = false;
  let app: Application | null = null;

  void (async (): Promise<void> => {
    // Dynamic Import
    const { Application, Assets, Sprite } = await import('pixi.js');

    const newApp: Application = new Application();
    await newApp.init({ background: '#dce0e8', resizeTo: container });

    // Component unmounted while Pixi was initializing
    if (disposed) {
      newApp.destroy(true, { children: true });
      return;
    }

    app = newApp;
    app.canvas.style.touchAction = 'none'; // stop page scroll/zoom while dragging, mobile devices only
    container.appendChild(app.canvas);

    //TODO PLACEHOLDER TEXTURE ASSET.
    const placeholderTexture: Texture = await Assets.load('https://images-understory.dc.library.northwestern.edu/iiif/3/image/5d574442-d2bc-445e-a4ac-f22eb155c414/cd7cc255-0b4e-444c-811a-ba5f96ecd3a5/0,0,2048,990/512,247/0/default.jpg');

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
      // TODO Handle audio changes.
      return;
    }

    // Handle Drag Target Assignment
    function onDragStart(this: Sprite): void {
      // TODO change Z value, so that the last moved sprite is on top.
      // Make transparent for visual feedback
      this.alpha = 0.5;
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
      dragTarget.alpha = 1;
      // Unassign drag target
      dragTarget = null;
      // Remove event listener
      app?.stage.off('pointermove', onDragMove);

      return;
    }

    // Create Object
    // Default audio: ../../assets/suonarelacitta/audio/lakemichiganwaves.mp3
    function createSonicObject(x: number, y: number, texture: Texture = placeholderTexture, soundPath: string = "https://nulib-ds.github.io/chiari/suonarelacitta/audio/lakemichiganwaves.mp3"): void {
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

      return;
    }

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    // Hook events
    app.stage.on('pointerup', onDragEnd); // release dragging
    app.stage.on('pointerupoutside', onDragEnd); // release dragging when cursor leaves app area.

    // Generate the Sonic Objects, randomly assign positions.
    for ( let i = 0; i < 5; i++) {
      createSonicObject(
        Math.floor(Math.random() * app.screen.width), // x pos
        Math.floor(Math.random() * app.screen.height) // y pos
      );
    }

    // Cleanup function
    return () => {
      disposed = true;
      if (!app){
        return;
      }
      app.destroy(true, { children: true }); // don't mind me, just casually destroying some children.
      app = null;
      return;
    }
  })();
}
