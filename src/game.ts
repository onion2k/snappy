/**
 * The game itself, without the picture or the page: the world, the rover
 * driven about it and the tracks it leaves, the clock, the physics world
 * holding the ground, and the save, a step at a time.
 *
 * Nothing here waits on the page, so the same game runs in the page and in
 * Node, and what the tests try is what is played. Nothing happens in it yet
 * that it tells of; the first thing that does (a picture taken) adds the
 * events the page shows.
 */
import { makeWorld, type World } from './physics';
import { Progress } from './progress';
import type { Random } from './random';
import { Rover, type Drive } from './rover';
import { Tracks } from './tracks';
import { buildWorld } from './world/generate';
import { groundOf } from './world/ground';
import type { Ground, WorldMap } from './world/types';

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
  /** The world to play in: the real one unless a test hands it a fixture. */
  map?: WorldMap;
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

  constructor(
    readonly progress: Progress,
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.map = options.map ?? theWorld();
    this.ground = groundOf(this.map);
    this.world = makeWorld(this.map, () => this.random());
    this.rover = new Rover(this.ground, this.map.start);
    this.tracks = new Tracks(this.ground);
  }

  /** One frame of `dt` seconds, driven as asked. */
  step(dt: number, drive: Drive = IDLE) {
    this.t += dt;
    this.rover.step(dt, drive);
    this.tracks.follow(this.rover, this.t);
    // no body is in the world yet, and nothing falls out of it, so there is nothing to collect
    this.world.step(dt, () => {});
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
  }
}
