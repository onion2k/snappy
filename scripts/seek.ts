/**
 * A player out to photograph an oddity: stood somewhere in sight of it, a few of its heights off, the viewfinder
 * raised and the view tilted onto it, as a drag would, and held still for the lens to settle, as a player waits for
 * the focus. Shared by the fuzzer and the leak run, which both want pictures worth keeping: shots at random are almost
 * all of nothing, or of an oddity behind the trees.
 *
 * Only puts the player there and waits; the shutter is the caller's, so each can count what it took.
 */
import type { Game } from '../src/game';
import { standable } from '../src/world/drive';

const DT = 1 / 60;
/** How many frames the lens is given to settle before the shutter. */
export const SETTLE = 30;

/**
 * Stand in sight of oddity `i` and look at it through the viewfinder, trying up to fifty places round it at between
 * three and fourteen of its heights off, each chosen by `between` (the caller's chance). `placed` is called as soon as
 * the rover is put down, before the viewfinder is raised, for a chase camera to be snapped to it. False, with nothing
 * done, if no place tried was one the rover could stand.
 */
export function seek(game: Game, i: number, between: (a: number, b: number) => number, placed?: () => void): boolean {
  const s = game.subjects,
    { bounds } = game.ground;
  const odd = new Float64Array(3);
  s.middle(i, odd);
  for (let tries = 0; tries < 50; tries++) {
    const reach = s.height[i] * between(3, 14) + s.radius[i],
      bearing = between(0, Math.PI * 2);
    const x = odd[0] + Math.cos(bearing) * reach,
      y = odd[1] + Math.sin(bearing) * reach;
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
    if (!standable(game.ground, x, y)) continue;
    game.photo(false);
    game.rover.teleport(x, y, bearing + Math.PI);
    placed?.();
    game.photo(true);
    const eye = game.viewfinder.eye;
    const dx = odd[0] - eye[0],
      dy = odd[1] - eye[1];
    game.viewfinder.look(0, Math.atan2(odd[2] - eye[2], Math.sqrt(dx * dx + dy * dy)));
    for (let f = 0; f < SETTLE; f++) game.step(DT);
    return true;
  }
  return false;
}
