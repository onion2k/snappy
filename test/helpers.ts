/** What the tests share: a new game in memory, from a seed. */
import { Game } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';

export const DT = 1 / 60;

export function newGame(seed = 1, json: string | null = null) {
  const store = memoryStore(json);
  const game = new Game(new Progress(store), { random: seeded(seed) });
  return { game, store };
}

/** Play `frames` frames. */
export function settle(game: Game, frames = 120) {
  for (let f = 0; f < frames; f++) game.step(DT);
}
