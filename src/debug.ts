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
import type { Game } from './game';
import { checkInvariants } from './invariants';
import { seeded } from './random';
import { standable } from './world/drive';
import { SURFACE } from './world/types';

/** Each surface's name, by its number. */
const SURFACE_NAMES: string[] = [];
for (const [name, n] of Object.entries(SURFACE)) SURFACE_NAMES[n] = name;

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
  /** The world's edge, in units. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Where the rover starts, and which way it faces. */
  start: { x: number; y: number; yaw: number };
  /** The places worth finding, by name. */
  landmarks: { name: string; kind: string; x: number; y: number }[];
  waterLevel: number;
}

/** The rover as it stands. */
export interface RoverState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  pitch: number;
  roll: number;
  /** What the ground under it is made of, by name. */
  surface: string;
  /** How deep the water it stands in is, in units: nought when dry. */
  wet: number;
  /** Whether its last move was refused, all or in part. */
  blocked: boolean;
  /** How many track marks lie in the world. */
  tracks: number;
}

/** The camera as it follows. */
export interface CameraState {
  target: [number, number, number];
  position: [number, number, number];
  /** How far back it is, in units. */
  distance: number;
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
  rover(): RoverState;
  camera(): CameraState;
  /** The ground at a point: its height, what it is made of, the water over it, and whether the rover could stand there. */
  ground(x: number, y: number): { height: number; surface: string; water: number; standable: boolean };

  /** Drive as if the keys were held, `throttle` and `steer` each from -1 to 1, until `release`. */
  drive(throttle: number, steer: number): void;
  /** Let go of the controls `drive` took: the keys and the stick drive again. */
  release(): void;
  /** Put the rover at a point, facing `yaw`, or at the nearest place it can stand; the camera follows at once. */
  teleport(x: number, y: number, yaw?: number): void;
  /** The camera's distance multiplied by `factor`, as the wheel or a pinch does. */
  zoom(factor: number): void;
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
  camera(): CameraState;
  /** The test's controls, over the keys and the stick, or null to hand them back. */
  override(drive: { throttle: number; steer: number } | null): void;
  /** The camera put behind the rover at once, as after a teleport. */
  snap(): void;
  zoom(factor: number): void;
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
    content: () => ({
      bounds: { ...game.ground.bounds },
      start: { ...game.map.start },
      landmarks: game.map.landmarks.map((l) => ({ ...l })),
      waterLevel: game.map.waterLevel,
    }),
    rover() {
      const r = game.rover;
      return {
        x: r.x,
        y: r.y,
        z: r.z,
        yaw: r.yaw,
        speed: r.speed,
        pitch: r.pitch,
        roll: r.roll,
        surface: SURFACE_NAMES[game.ground.surfaceAt(r.x, r.y)],
        wet: game.ground.waterDepthAt(r.x, r.y),
        blocked: r.blocked,
        tracks: game.tracks.count,
      };
    },
    camera: () => host.camera(),
    ground(x, y) {
      const g = game.ground;
      return {
        height: g.heightAt(x, y),
        surface: SURFACE_NAMES[g.surfaceAt(x, y)],
        water: g.waterDepthAt(x, y),
        standable: standable(g, x, y),
      };
    },
    drive: (throttle, steer) => host.override({ throttle, steer }),
    release: () => host.override(null),
    teleport(x, y, yaw = game.rover.yaw) {
      game.rover.teleport(x, y, yaw);
      host.snap();
    },
    zoom: (factor) => host.zoom(factor),
    events() {
      return host.events.splice(0);
    },
    invariants: () => checkInvariants(game, host.camera()),

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
