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
import type { KeptKind } from './album';
import { Brackets } from './brackets';
import type { Game } from './game';
import { checkInvariants } from './invariants';
import { seeded } from './random';
import type { Grade } from './score';
import type { ViewfinderState } from './viewfinder';
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
  /** The way it faces across the ground, anticlockwise from +x, and its angle from straight down, in radians. */
  azimuth: number;
  tilt: number;
  /** How far the player has turned it from behind the rover's heading, in radians: nought once it has come back. */
  offset: number;
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

/** A picture's grade, as the card shows it: the total out of a hundred, the stars, what it is of, and each term. */
export interface PhotoGrade {
  total: number;
  stars: number;
  /** The oddity it is of, by its index among `oddities()`, or -1 with none in frame. */
  best: number;
  /** Its name, or null with none in frame. */
  name: string | null;
  terms: Record<string, number>;
}

/** A picture taken, as the shutter tells of it: its grade, and what the album made of it. */
export interface ShutterResult extends PhotoGrade {
  /** Kept as the first of its oddity, kept over a worse one (`replaced` is that one's total), or not kept. */
  kept: { kind: KeptKind; replaced: number };
}

/** The album as it stands: how many pictures it can hold and holds, and a page for each, in the world's order. */
export interface AlbumState {
  capacity: number;
  count: number;
  pages: { name: string; total: number; stars: number; t: number }[];
}

/** The album over the game: whether it is open, the page shown (counted from nought) and how many there are. */
export interface AlbumOpenState {
  open: boolean;
  page: number;
  pages: number;
}

/** The viewfinder as it stands, and what it brackets. */
export interface ViewfinderView extends ViewfinderState {
  /** Where the focus mark is on the screen, across and up from the middle, minus one to one. */
  mark: [number, number];
  /** The focus as a depth along the view, which the blur is drawn at. */
  focusDepth: number;
  /** Whether the frame is drawn blurred: off out of the viewfinder, and at a frame-time rung that gave the blur up. */
  blurred: boolean;
  /** Every oddity bracketed: its name, its box on the screen (x0, y0, x1, y1, y up), and whether it is in focus. */
  framed: { name: string; box: [number, number, number, number]; sharp: boolean }[];
}

/** An oddity, where it is now: a UFO where its bob has lifted it. */
export interface OddityState {
  name: string;
  kind: string;
  x: number;
  y: number;
  /** Its foot, in units. */
  z: number;
  /** Which way its front faces, anticlockwise from +x. */
  yaw: number;
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
  /** How many tracked trees and buildings are cut down out of the camera's way now. */
  cuts(): number;
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
  /** The camera turned round the rover by `turn` radians and tilted by `tilt`, as a drag on the view or Q and E do. */
  orbit(turn: number, tilt: number): void;
  /** What has happened since this was last asked, a line each: a picture taken is `photo <total> <name>`. */
  events(): string[];

  /**
   * Into the viewfinder or out of it, as F or the camera button does. Resolves once the depth-of-field passes the
   * viewfinder draws with are built, so a picture taken after it is blurred as a player sees it.
   */
  photo(on: boolean): Promise<void>;
  /** The view turned by `turn` radians anticlockwise and tilted by `tilt` up, as a drag in the viewfinder does. */
  aim(turn: number, tilt: number): void;
  /** The lens's focal length multiplied by `factor`, as the wheel or a pinch does in the viewfinder. */
  lens(factor: number): void;
  /** Focus set on what is under the screen point (nx, ny), minus one to one, y up, and held: a click without a drag. */
  focusAt(nx: number, ny: number): void;
  /** Back to auto focus, as A or the AF button does. */
  autoFocus(): void;
  /**
   * The shutter, as Space or the shutter button: the picture graded, kept in the album if it is the best yet of its
   * oddity, and its card shown; null out of the viewfinder.
   */
  shutter(): ShutterResult | null;
  /** The viewfinder as it stands. */
  viewfinder(): ViewfinderView;
  /** Every oddity in the world, by name, where it is now. */
  oddities(): OddityState[];
  /** The rules that must always hold, broken; empty when all is well. */
  invariants(): string[];

  /** The album: the best picture of each oddity, kept. */
  album(): AlbumState;
  /**
   * The album opened over the game, which stops, or closed, and the game as it was, as Tab or the album button does.
   * Opening resolves once the first page's picture is drawn with everything it needs built.
   */
  openAlbum(on: boolean): Promise<void>;
  /**
   * The open album turned to page `n`, counted from nought, the nearest there is, as the arrows or a swipe turn it.
   * Resolves once the page's frame is drawn and the GPU has finished it, so the time it takes is a page turn's.
   */
  albumPage(n: number): Promise<void>;
  /** Whether the album is open, and its page. */
  albumState(): AlbumOpenState;

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
  cuts(): number;
  /** The test's controls, over the keys and the stick, or null to hand them back. */
  override(drive: { throttle: number; steer: number } | null): void;
  /** The camera put behind the rover at once, as after a teleport. */
  snap(): void;
  zoom(factor: number): void;
  orbit(turn: number, tilt: number): void;
  measureFrame(warm?: number): Promise<number>;
  sound(): SoundState;
  mute(on: boolean): void;
  wake(): void;
  events: string[];
  /**
   * The viewfinder raised or lowered by the page, as F does, so its marks, buttons and blur go with it; resolves once
   * the blur's passes are built. Named apart from the API's `photo`, which it stands behind.
   */
  raise(on: boolean): Promise<void>;
  /** Whether the viewfinder's frame is blurred now: false at a rung that has given the blur up. */
  blurred(): boolean;
  /** The album opened or closed by the page, as Tab does. */
  openAlbum(on: boolean): Promise<void>;
  /** The open album turned to page `n`; resolves once its frame is drawn and finished. */
  albumPage(n: number): Promise<void>;
  albumState(): AlbumOpenState;
}

/** A grade as plain numbers, with the name of what it is of. */
export function photoGrade(game: Game, g: Grade): PhotoGrade {
  const { total, stars, best, terms } = g.toJSON();
  return { total, stars, best, name: best >= 0 ? game.oddityNames[best] : null, terms };
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
    cuts: () => host.cuts(),
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
    orbit: (turn, tilt) => host.orbit(turn, tilt),
    events() {
      return host.events.splice(0);
    },

    photo: (on) => host.raise(on),
    aim(turn, tilt) {
      game.viewfinder.look(turn, tilt);
    },
    lens(factor) {
      game.viewfinder.zoomBy(factor);
    },
    focusAt(nx, ny) {
      game.viewfinder.focusAt(nx, ny, game.ground, game.subjects);
    },
    autoFocus() {
      game.viewfinder.auto();
    },
    shutter() {
      const g = game.shutter();
      if (!g) return null;
      // read at once, as the next picture writes it again
      const { kind, replaced } = game.album.last;
      return { ...photoGrade(game, g), kept: { kind, replaced } };
    },
    viewfinder() {
      const vf = game.viewfinder;
      const b = new Brackets();
      if (vf.active) b.update(vf.shot, game.subjects, game.ground);
      const framed: ViewfinderView['framed'] = [];
      for (let k = 0; k < b.count; k++)
        framed.push({
          name: game.oddityNames[b.which[k]],
          box: [b.box[k * 4], b.box[k * 4 + 1], b.box[k * 4 + 2], b.box[k * 4 + 3]],
          sharp: b.sharp[k] === 1,
        });
      return {
        ...vf.state(),
        mark: [vf.mark[0], vf.mark[1]],
        focusDepth: vf.focusDepth,
        blurred: host.blurred(),
        framed,
      };
    },
    oddities() {
      const s = game.subjects;
      return game.oddityNames.map((name, i) => ({
        name,
        kind: s.kinds[i],
        x: s.x[i],
        y: s.y[i],
        z: s.foot[i] + s.lift[i],
        yaw: s.yaw[i],
      }));
    },
    invariants() {
      // in the viewfinder the camera is the lens, held to the camera's rules from its eye to the rover's body it is on
      const vf = game.viewfinder,
        r = game.rover;
      const camera = vf.active ? { position: vf.eye, target: [r.x, r.y, r.z + 2] } : host.camera();
      return checkInvariants(game, camera);
    },

    album() {
      const a = game.album;
      const at = new Int32Array(a.capacity);
      const n = a.pictured(at);
      const pages: AlbumState['pages'] = [];
      for (let k = 0; k < n; k++) {
        const i = at[k];
        pages.push({ name: a.nameOf(i), total: a.totalOf(i), stars: a.starsOf(i), t: a.timeOf(i) });
      }
      return { capacity: a.capacity, count: a.count, pages };
    },
    openAlbum: (on) => host.openAlbum(on),
    albumPage: (n) => host.albumPage(n),
    albumState: () => host.albumState(),

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
