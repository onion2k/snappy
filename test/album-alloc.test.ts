/**
 * The album judging and keeping a picture makes nothing, however often the shutter is pressed: the grade read, the
 * slot compared, and a better picture's lens, time and grade rounded into the slot. Writing the save allocates, and is
 * the game's, only when a picture is kept. Measured as `photo-alloc.test.ts` measures the grade, warmed up first, in a
 * file of its own.
 */
import { UNDER_MUTATION } from './helpers';
import { getHeapSpaceStatistics } from 'node:v8';
import { expect, it } from 'vitest';
import { Album } from '../src/album';
import { Grade, starsOf } from '../src/score';
import { Shot } from '../src/viewfinder';
import { ODDITIES } from '../src/world/oddities';

const young = () => getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

/** The least the young heap grows over 4000 presses of `press`, after warming it up. */
function grows(press: (f: number) => void): number {
  for (let f = 0; f < 50_000; f++) press(f);
  let least = Infinity;
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = young();
    for (let f = 0; f < 4000; f++) press(f);
    const grew = young() - before;
    if (grew >= 0) least = Math.min(least, grew);
  }
  return least;
}

// one number boxed a press would be 64 kB over the 4000; a press that makes nothing leaves a few bytes of the runtime's
const NOTHING = 8000;

it.skipIf(UNDER_MUTATION)('makes nothing considering a picture, kept or not', () => {
  const album = new Album(ODDITIES.map((o) => o.name));
  const g = new Grade(),
    shot = new Shot(),
    mark = new Float64Array([0.123456, -0.654321]);
  shot.eye[0] = 101.23456;
  shot.eye[1] = -55.98765;
  shot.eye[2] = 4.321;
  shot.focus = 31.4159;
  g.terms.fill(0.876543);
  const press = (f: number) => {
    // every oddity in turn, each a total climbing to a hundred and starting again once the album is emptied, so of
    // every twelve presses some are first, some better and some not kept
    const i = f % album.capacity;
    const total = ((f / album.capacity) | 0) % 100;
    if (i === 0 && total === 0) album.clear();
    g.values[0] = total;
    g.values[1] = starsOf(total);
    g.values[2] = f % 7 === 0 ? -1 : i;
    shot.v[0] = (f % 628) / 100;
    album.consider(g, shot, mark, f / 60);
  };
  expect(grows(press)).toBeLessThan(NOTHING);
  expect(album.count).toBeGreaterThan(0);
});
