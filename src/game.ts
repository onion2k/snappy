/**
 * The game itself, without the picture or the page: the world, the rover
 * driven about it and the tracks it leaves, the clock, the physics world
 * holding the ground, and the save, a step at a time.
 *
 * Nothing here waits on the page, so the same game runs in the page and in
 * Node, and what the tests try is what is played.
 *
 * The photo mode is the game's too: the oddities as the lens and the grade
 * read them (`subjects`), the UFOs among them bobbing by game time; the
 * viewfinder, raised and lowered by `photo`, which stops the rover while the
 * player looks and turns its head with the view; and the shutter, which
 * grades the picture and tells of it (`GameEvents.photo`). The page draws
 * the viewfinder and the card, and decides nothing of them.
 */
import { makeWorld, type World } from './physics';
import { Progress } from './progress';
import type { Random } from './random';
import { Rover, type Drive } from './rover';
import { Grade, grade } from './score';
import { Subjects } from './sight';
import { SUN } from './sun';
import { Tracks } from './tracks';
import { Viewfinder } from './viewfinder';
import { buildWorld } from './world/generate';
import { groundOf } from './world/ground';
import { ODDITIES, ufoBob } from './world/oddities';
import { SUBJECTS, type Ground, type WorldMap } from './world/types';

/**
 * What the game tells of as it happens, for whoever is showing it: the page's card, the test API's log. The first
 * is a picture taken; the grade is the game's own, graded into again by the next, so it is read when it is told.
 */
export interface GameEvents {
  photo(grade: Grade): void;
}

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
  /** The world to play in: the real one unless a test hands it a fixture. */
  map?: WorldMap;
  /** Who is told of what happens. */
  events?: GameEvents;
  /**
   * The ground the rover and the lens read, over the map's own: only for the allocation test, whose plane's reads V8
   * inlines, so what it measures is the game's and not a real ground's boxed answers.
   */
  ground?: Ground;
}

/** Standing still, for a step with nobody at the controls. */
const IDLE: Drive = { throttle: 0, steer: 0 };

/**
 * The world is the same every game and is never written, and it takes a
 * quarter of a second to make, so it is made once a process and shared:
 * a fuzzer reloading a game a hundred times does not make it a hundred
 * times, and no game can leave anything in it for the next.
 */
let made: WorldMap | null = null;
export function theWorld(): WorldMap {
  return (made ??= buildWorld());
}

export class Game {
  readonly map: WorldMap;
  readonly ground: Ground;
  readonly world: World;
  readonly rover: Rover;
  readonly tracks: Tracks;
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;
  /** Who is told of what happens: the page sets it, and nobody need be. */
  events: GameEvents | null;
  /** The oddities as the lens and the grade read them, the UFOs lifted by their bob each step. */
  readonly subjects: Subjects;
  /** Each oddity's name: the world's, or its kind's and a count where the world gives none (a test's fixture). */
  readonly oddityNames: readonly string[];
  readonly viewfinder = new Viewfinder();
  /** The last picture's grade, graded into again by each: nothing is kept of a picture past the next. */
  readonly picture = new Grade();
  /** Which oddities bob (one) and which do not, and the vary each bobs by, read once from their placements. */
  private readonly bobs: Uint8Array;
  private readonly vary: Float64Array;

  constructor(
    readonly progress: Progress,
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.map = options.map ?? theWorld();
    this.ground = options.ground ?? groundOf(this.map);
    this.world = makeWorld(this.map, () => this.random());
    this.rover = new Rover(this.ground, this.map.start);
    this.tracks = new Tracks(this.ground);
    this.events = options.events ?? null;
    this.subjects = Subjects.of(this.map);
    const s = this.subjects;
    this.bobs = Uint8Array.from(s.kinds, (k) => (k === 'ufo' ? 1 : 0));
    this.vary = Float64Array.from(s.placements, (p) => p.vary);
    this.oddityNames = namesOf(s);
  }

  /** Whether the player is looking through the viewfinder. */
  get photographing(): boolean {
    return this.viewfinder.active;
  }

  /**
   * Into the viewfinder or out of it. In, the rover is stopped dead where it stands, and the view starts level along
   * its heading; asked again while in, nothing changes. Out, the controls and the head are the rover's again.
   */
  photo(on: boolean): void {
    const vf = this.viewfinder;
    if (on === vf.active) return;
    if (on) {
      this.rover.halt();
      vf.enter(this.rover);
    } else {
      vf.leave();
      this.rover.hold[0] = 0;
    }
  }

  /**
   * The picture taken: graded, the grade told, and handed back; nothing if the viewfinder is down. Each press is a
   * picture of its own, graded into the one grade, which the next replaces.
   */
  shutter(): Grade | null {
    if (!this.viewfinder.active) return null;
    grade(this.viewfinder.shot, this.subjects, this.ground, SUN, this.picture);
    this.events?.photo(this.picture);
    return this.picture;
  }

  /**
   * One frame of `dt` seconds, driven as asked: or, in the viewfinder, stood still with the head where the view
   * looks, and the viewfinder's focus and turn rate brought up to date with the UFOs where they now are.
   */
  step(dt: number, drive: Drive = IDLE) {
    this.t += dt;
    const s = this.subjects;
    for (let i = 0; i < s.count; i++) if (this.bobs[i]) s.lift[i] = ufoBob(this.t, this.vary[i]);
    const vf = this.viewfinder,
      rover = this.rover;
    if (vf.active) {
      rover.hold[0] = 1;
      rover.hold[1] = vf.headYaw;
      rover.hold[2] = vf.headPitch;
      rover.step(dt, IDLE);
      vf.update(dt, this.ground, s);
    } else rover.step(dt, drive);
    this.tracks.follow(rover, this.t);
    // no body is in the world yet, and nothing falls out of it, so there is nothing to collect
    this.world.step(dt, () => {});
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
  }
}

/**
 * The oddities' names: the world's own, where its oddities are the ones `ODDITIES` lays, in its order; otherwise each
 * kind's name and a count, so a test's fixture still names each one.
 */
function namesOf(s: Subjects): string[] {
  const laid = s.count === ODDITIES.length && s.kinds.every((k, i) => ODDITIES[i].kind === k);
  if (laid) return ODDITIES.map((o) => o.name);
  const seen = new Map<string, number>();
  return s.kinds.map((k) => {
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${SUBJECTS[k].name} ${n}`;
  });
}
