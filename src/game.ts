/**
 * The game itself, without the picture or the page: the clock, the physics
 * world holding the floor and the rock, and the save, a step at a time.
 *
 * Nothing here waits on the page, so the same game runs in the page and in
 * Node, and what the tests try is what is played. Nothing happens in it yet
 * that it tells of; a feature that makes something happen adds the events
 * the page shows.
 */
import { buildRock } from './arena';
import { makeWorld, type World } from './physics';
import { Progress } from './progress';
import type { Random } from './random';

export interface GameOptions {
  /** Chance; Math.random unless told otherwise, and the tests always tell. */
  random?: Random;
}

export class Game {
  readonly world: World;
  /** Game time, in seconds. */
  t = 0;
  /** Where chance comes from: replaced by the test API's `seed`. */
  random: Random;

  constructor(
    readonly progress: Progress,
    options: GameOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.world = makeWorld(buildRock(), () => this.random());
  }

  /** One frame of `dt` seconds. */
  step(dt: number) {
    this.t += dt;
    // no body is in the world yet, and nothing falls out of it, so there is nothing to collect
    this.world.step(dt, () => {});
  }

  /** The save written now. */
  persist() {
    this.progress.persist();
  }
}
