import type { EQ3, FeedbackDelay, Gain, PitchShift, Player } from 'tone';
import type { Sprite, Ticker } from 'pixi.js';

export interface SpriteAudio {
  player: Tone.Player;
  pitch: Tone.PitchShift;
  eq: Tone.EQ3;
  delay: Tone.FeedbackDelay;
  gain: Tone.Gain;
}

export interface AudioManager {
  // Associates a audio file with a sprite. Call before start()
  attach(sprite: Sprite, audioPath: string): SpriteAudio;
  // Unlocks AudioContext so the browser will allow audio to play.
  start(): Promise<void>;
  // recalculate all sprite audio effects.
  updateAudio(screenHeight: number, screenWidth: number): void;
  // Clean up audio nodes.
  dispose(): void;
}

export async function createAudioManager(): Promise<AudioManager> {
  // Dynamic import
  const Tone = await import('tone');

  const audioBySprite = new Map<Sprite, SpriteAudio>();
  let started = false;

  function attach(sprite: Sprite, audioPath: string): SpriteAudio {
    const player = new Tone.Player({ url: audioPath, loop: true });
    // audio fx
    const pitch = new Tone.PitchShift({ pitch: 0 });         // semitones
    const eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 });    // dB per band
    const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0 });
    const gain = new Tone.Gain(0);                           // linear 0..1

    player.chain(pitch, eq, delay, gain, Tone.getDestination());

    const audio: SpriteAudio = { player, pitch, eq, delay, gain };
    audioBySprite.set(sprite, audio);

    return audio;
  }

  // prompt input to start audio playback
  async function start(): Promise<void> {
    if (started) return; // already started.

    started = true;

    await Tone.start();    // unlocks the AudioContext
    await Tone.loaded();   // waits for all buffers
    const startTime = Tone.now() + 0.1;   // start together so loops stay in sync
    // Start every audio playback
    for (const { player } of audioBySprite.values()) {
      player.start(startTime);
    }
  }

  // called every 'update'
  function updateAudio(screenHeight: number, screenWidth: number): void {
    // for each sprite
    for (const [sprite, { gain, pitch }] of audioBySprite) {
      // JS's Math lib doesn't include clamp?????
      const y = Math.min(1, Math.max(0, sprite.y / screenHeight));
      const x = Math.min(1, Math.max(0, sprite.x / screenWidth));

      // modify based on coords
      gain.gain.rampTo((1 - y), 0.05); // smooth audio volume adjustment.
      pitch.pitch = (0.5 - x) * -48; // range of -24 to +24 cents
    }
  }

  // dispose all audio playback
  function dispose(): void {
    for (const { player, pitch, eq, delay, gain } of audioBySprite.values()) {
      player.stop();
      [player, pitch, eq, delay, gain].forEach((node) => node.dispose());
    }
    audioBySprite.clear();
  }

  return { attach, start, updateAudio, dispose };
}
