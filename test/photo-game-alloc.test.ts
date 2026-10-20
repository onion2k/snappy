/**
 * The game's step in the viewfinder makes nothing: the UFOs' bob, the head held to the view, the rover stood, and the
 * viewfinder's focus and turn rate. The shutter is a press and not a frame, and is not pressed here: the grade it makes
 * is held to nothing by `photo-alloc.test.ts`. Played on the real world's oddities over a gentle plane
 * of its own, as `alloc.test.ts` plays the rover: a real ground's reads are not inlined, and each hands back its number
 * boxed, which is the ground's and not the frame's (on the fixture's, five kilobytes a frame of the lens's rays). In a
 * file of its own so no other ground has made the calls polymorphic, and warmed up long, since the
 * lens's rays were seen still settling into their optimised code twenty thousand frames in.
 *
 * The game's step out of the viewfinder is not nothing: the physics world's step, with no body in it, makes some three
 * hundred bytes a frame of its own (2026-10-20, artshape-physics 0.8.0), which is that package's to mend. So what is
 * held here is what the viewfinder adds to a step: nothing, against the same game's step out of it.
 */
import { UNDER_MUTATION } from './helpers';
import { getHeapSpaceStatistics } from 'node:v8';
import { expect, it } from 'vitest';
import { Game, theWorld } from '../src/game';
import { Progress, memoryStore } from '../src/progress';
import { seeded } from '../src/random';
import type { Ground } from '../src/world/types';

const plane: Ground = {
  bounds: { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 },
  heightAt: (x, y) => 0.001 * x + 0.002 * y,
  slopeAt: (_x, _y, o) => {
    o[0] = 0.001;
    o[1] = 0.002;
  },
  surfaceAt: () => 0,
  waterDepthAt: () => 0,
  solidAt: () => false,
  topAt: (x, y) => 0.001 * x + 0.002 * y,
};

const young = () => getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

/**
 * What the young heap grows by a frame of `frame`, after warming it up: the middle of eight windows of 2000 frames,
 * leaving out a window in which the heap was emptied (it shrank), so the physics world's own bytes are counted the same
 * way in both games and a window cut by a scavenge does not stand for the frame.
 */
function perFrame(frame: (f: number) => void): number {
  for (let f = 0; f < 100_000; f++) frame(f);
  const rates: number[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = young();
    for (let f = 0; f < 2000; f++) frame(f);
    const grew = young() - before;
    if (grew >= 0) rates.push(grew / 2000);
  }
  rates.sort((x, y) => x - y);
  return rates[rates.length >> 1];
}

// a number boxed a frame is sixteen bytes; the two games' rates differ by up to five from run to run with nothing
// boxed (seen 2026-10-20), as the optimiser settles each a little differently
const NOTHING = 10;

const gameOnPlane = () => {
  const game = new Game(new Progress(memoryStore()), { random: seeded(1), map: theWorld(), ground: plane });
  // facing the mill pond duck from thirty off, its UFOs bobbing somewhere off the frame
  const duck = game.oddityNames.indexOf('mill pond duck');
  game.rover.teleport(game.subjects.x[duck] + 32, game.subjects.y[duck], Math.PI);
  return game;
};

it.skipIf(UNDER_MUTATION)('makes nothing more in a step of the game in the viewfinder, than out of it', () => {
  const out = gameOnPlane();
  const plain = perFrame(() => out.step(1 / 60));
  const game = gameOnPlane();
  game.photo(true);
  const vf = game.viewfinder;
  // the shutter is left out: a press every thirty frames keeps the grade's walk through the world's trees in code not
  // yet optimised, which boxes some three hundred bytes a press, and that is a press's cost and not a frame's; the
  // grade warmed is held to nothing by `photo-alloc.test.ts` (2026-10-20)
  const frame = (f: number) => {
    if (f % 400 < 200) vf.look(0.002, -0.001);
    else vf.look(-0.002, 0.001);
    game.step(1 / 60);
  };
  expect(perFrame(frame) - plain).toBeLessThan(NOTHING);
});
