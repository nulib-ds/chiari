import type { EQ3, FeedbackDelay, Gain, PitchShift, Player } from 'tone';
import type { Container } from 'pixi.js';

export interface SpriteAudio {
  player: Player;
  pitch: PitchShift;
  eq: EQ3;
  delay: FeedbackDelay;
  gain: Gain;
}

export interface AudioManager {
  // Associate an audio file with a Pixi object; newly added objects play after unlock.
  attach(sprite: Container, audioPath: string): SpriteAudio;
  // Stop and dispose one object's audio when it is erased.
  remove(sprite: Container): void;
  // Unlock the browser's audio context and start all loaded players.
  start(): Promise<void>;
  updateAudio(screenHeight: number, screenWidth: number): void;
  dispose(): void;
}

export async function createAudioManager(): Promise<AudioManager> {
  const Tone = await import('tone');

  const audioBySprite = new Map<Container, SpriteAudio>();
  const playingPlayers = new WeakSet<Player>();
  let started = false;
  let disposed = false;
  let startPromise: Promise<void> | null = null;

  function startPlayer(sprite: Container, audio: SpriteAudio, time = Tone.now() + 0.1): void {
    const { player } = audio;
    if (
      disposed || !started || !player.loaded || player.disposed ||
      audioBySprite.get(sprite) !== audio || playingPlayers.has(player)
    ) return;

    playingPlayers.add(player);
    player.start(time);
  }

  function attach(sprite: Container, audioPath: string): SpriteAudio {
    const player = new Tone.Player({
      url: audioPath,
      loop: true,
      onload: () => {
        // Also handle files that finish loading after the app has started.
        const audio = audioBySprite.get(sprite);
        if (audio) startPlayer(sprite, audio);
      },
    });
    const pitch = new Tone.PitchShift({ pitch: 0 });
    const eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0 });
    const gain = new Tone.Gain(0);

    player.chain(pitch, eq, delay, gain, Tone.getDestination());

    const audio: SpriteAudio = { player, pitch, eq, delay, gain };
    audioBySprite.set(sprite, audio);
    // Covers cached buffers whose onload fired before the entry was registered.
    startPlayer(sprite, audio);
    return audio;
  }

  async function start(): Promise<void> {
    if (disposed) return;
    if (startPromise) return startPromise;

    startPromise = (async () => {
      await Tone.start();
      await Tone.loaded();
      if (disposed) return;

      started = true;
      const startTime = Tone.now() + 0.1;
      for (const [sprite, audio] of audioBySprite) {
        startPlayer(sprite, audio, startTime);
      }
    })().catch((error: unknown) => {
      startPromise = null;
      throw error;
    });
    return startPromise;
  }

  function updateAudio(screenHeight: number, screenWidth: number): void {
    if (disposed || screenHeight <= 0 || screenWidth <= 0) return;
    for (const [sprite, { gain, pitch, player }] of audioBySprite) {
      const y = Math.min(1, Math.max(0, sprite.y / screenHeight));
      const x = Math.min(1, Math.max(0, sprite.x / screenWidth));

      gain.gain.rampTo(1 - y, 0.05);
      // pitch.pitch = (0.5 - x) * -48;
      player.playbackRate = 0.5 + x * 1.5;
    }
  }

  function remove(sprite: Container): void {
    const audio = audioBySprite.get(sprite);
    if (!audio) return;
    audioBySprite.delete(sprite);

    if (playingPlayers.has(audio.player)) audio.player.stop();
    audio.player.dispose();
    audio.pitch.dispose();
    audio.eq.dispose();
    audio.delay.dispose();
    audio.gain.dispose();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const sprite of Array.from(audioBySprite.keys())) remove(sprite);
  }

  return { attach, remove, start, updateAudio, dispose };
}
