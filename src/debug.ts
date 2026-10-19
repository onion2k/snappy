/**
 * `window.game`: the game, for tests and for poking at from the console.
 * Everything a test needs to set a scene, play it exactly and read back
 * what happened, so no test waits on a clock or reaches into the game's
 * insides.
 *
 * Time is the test's to keep: `pause` stops the game where it is, and
 * `step` plays it on a frame at a time, exactly, drawing the last. `seed`
 * makes chance repeat. Anything that changes the game goes through here,
 * and `state`, `events` and `invariants` read it back.
 *
 * The types are shared with the smoke tests, so a test that calls something
 * that is not here does not compile.
 */
import { FLOOR } from './arena';
import type { Game } from './game';
import { checkInvariants } from './invariants';
import { seeded } from './random';

declare global {
  interface Window {
    game?: GameApi;
  }
}

export interface GameState {
  /** Game time, in seconds. */
  t: number;
  frame: number;
  paused: boolean;
}

/** Where things are, for setting a scene without importing the game's source. */
export interface Content {
  floor: { minX: number; minY: number; maxX: number; maxY: number };
}

/** The sound as the game stands: for a test to read, since what is heard cannot be. */
export interface SoundState {
  /** Whether the context has been made: it is, on the first gesture or `wake`, and not before. */
  awake: boolean;
  /** How many sounds are playing now, the music's notes among them. */
  voices: number;
  muted: boolean;
  volume: number;
  /** Where the music is, in beats from its start: it moves with the game's time and stops when the game does. */
  beat: number;
}

export interface GameApi {
  readonly version: 1;
  /** Booted, and the frame loop running. */
  readonly ready: boolean;
  /** How long the boot took, from the page's start to ready, in milliseconds; 0 until it has. */
  readonly bootMs: number;

  pause(): void;
  resume(): void;
  /** Play `frames` frames of 1/60 s exactly, and draw the last. */
  step(frames?: number): void;
  /** Chance from a seed from now on. */
  seed(n: number): void;

  state(): GameState;
  content(): Content;
  /** What has happened since this was last asked, a line each; the page tells of nothing yet. */
  events(): string[];
  /** The rules that must always hold, broken; empty when all is well. */
  invariants(): string[];

  /** The save written now, and what it is. */
  save(): string;
  /** The sound as it stands. */
  sound(): SoundState;
  /** The sound turned off or on, as the `m` key does, and the save written. */
  mute(on: boolean): void;
  /** Stands in for the first gesture, which the API presses no key for: makes the context, once. */
  wake(): void;

  /** The camera looking at a point, from `azimuth` round and `polar` down, `radius` away, at once. */
  look(x: number, y: number, view?: { azimuth?: number; polar?: number; radius?: number }): void;
  /**
   * What drawing a frame of the scene as it stands costs, in milliseconds, once the GPU has been kept drawing for
   * `warm` of them: a quarter of a second unless told otherwise, which is what one that sat idle while the page
   * booted needs. A test that measures scene after scene may ask for less after the first.
   */
  measureFrame(warm?: number): Promise<number>;
}

/** What the page gives the API that is not the game's: time, the camera and the renderer. */
export interface DebugHost {
  game: Game;
  ready(): boolean;
  bootMs(): number;
  paused(): boolean;
  setPaused(paused: boolean): void;
  /** Play one frame of `dt`, without drawing. */
  simulate(dt: number): void;
  draw(dt: number): void;
  frame(): number;
  look(x: number, y: number, view: { azimuth?: number; polar?: number; radius?: number }): void;
  measureFrame(warm?: number): Promise<number>;
  sound(): SoundState;
  mute(on: boolean): void;
  wake(): void;
  events: string[];
}

export function createApi(host: DebugHost): GameApi {
  const { game } = host;
  const { progress } = game;
  return {
    version: 1,
    get ready() {
      return host.ready();
    },
    get bootMs() {
      return host.bootMs();
    },
    pause: () => host.setPaused(true),
    resume: () => host.setPaused(false),
    step(frames = 1) {
      for (let f = 0; f < frames; f++) host.simulate(1 / 60);
      host.draw(1 / 60);
    },
    seed(n) {
      game.random = seeded(n);
    },

    state() {
      return {
        t: game.t,
        frame: host.frame(),
        paused: host.paused(),
      };
    },
    content: () => ({ floor: { ...FLOOR } }),
    events() {
      return host.events.splice(0);
    },
    invariants: () => checkInvariants(game),

    save() {
      game.persist();
      return JSON.stringify(progress.save);
    },

    sound: () => host.sound(),
    mute: (on) => host.mute(on),
    wake: () => host.wake(),

    look: (x, y, view = {}) => host.look(x, y, view),
    measureFrame: (warm) => host.measureFrame(warm),
  };
}
