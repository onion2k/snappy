/**
 * What must stay bounded over a long game, and the tool that watches it. The run itself is too long for a unit test —
 * `npm run leaks` does that — so what is tested here is the measuring: that the sizes are read off the game properly,
 * that the thing which decides what is growing says so when it is, and holds its tongue when it is not, and that a
 * short run takes pictures and keeps some.
 */
import { describe, expect, it } from 'vitest';
import { WATCH, grew, leakRun, sizes, trouble } from '../scripts/leaks';
import { LENS, LOOK } from '../src/viewfinder';
import { TERMS } from '../src/score';
import { TRACKS } from '../src/tracks';
import { ODDITIES } from '../src/world/oddities';
import { newGame } from './helpers';

describe('what must stay bounded', () => {
  it('reads the sizes off a game, and has a ceiling for every one', () => {
    const { game } = newGame();
    const now = sizes(game);
    for (const key of ['album pictures', 'save bytes', 'save bytes a picture', 'tracks', 'heap MB']) {
      expect(Object.keys(now), `${key} measured`).toContain(key);
      expect(Number.isFinite(now[key])).toBe(true);
      expect(Object.keys(WATCH), `a ceiling for ${key}`).toContain(key);
    }
    expect(WATCH['album pictures']!.ceiling).toBe(ODDITIES.length);
    expect(WATCH.tracks!.ceiling).toBe(TRACKS.capacity);
    expect(now['album pictures']).toBe(0);
    game.album.load([
      {
        name: ODDITIES[0].name,
        eye: [1, 2, 3],
        yaw: 0,
        pitch: 0,
        focal: 50,
        aspect: 1.6,
        focus: 20,
        mark: [0, 0],
        t: 1,
        total: 50,
        stars: 1,
        terms: { inFrame: 1, seen: 1, size: 1, placement: 1, facing: 1, focus: 1, steady: 1, light: 0.5 },
      },
    ]);
    game.progress.save.album = game.album.toSave();
    const after = sizes(game);
    expect(after['album pictures']).toBe(1);
    expect(now['save bytes a picture'], 'of an album of nothing').toBe(0);
    expect(after['save bytes a picture']).toBe(JSON.stringify(game.progress.save.album[0]).length);
    expect(after['save bytes']).toBeGreaterThan(now['save bytes'] + 200);
  });

  it('holds the save to the longest a full album can make it, and an entry to the longest one can be', () => {
    const { game } = newGame();
    const b = game.ground.bounds;
    // every number at its most digits as the album rounds it: the eye at the world's far corner (its height taken as
    // far, which it never is), the yaw wrapped, the pitch at the look's lowest, the lens and focus at their longest,
    // the mark at a corner, a game of a day, and every term at two places
    const far = -(Math.max(-b.minX, b.maxX, -b.minY, b.maxY) - 0.001);
    const longest = (name: string) => ({
      name,
      eye: [far, far, far],
      yaw: -3.14159,
      pitch: -Math.round(LOOK.down * 1e5) / 1e5,
      focal: LENS.most - 0.001,
      aspect: 0.4618,
      focus: 4999.999,
      mark: [-0.9999, -0.9999],
      t: 99999.999,
      total: 100,
      stars: 3,
      terms: Object.fromEntries(TERMS.map((t) => [t, 0.99])),
    });
    const names = ODDITIES.map((o) => o.name);
    const worst = JSON.stringify({ muted: false, volume: 0.30000000000000004, album: names.map(longest) }).length;
    const entry = Math.max(...names.map((n) => JSON.stringify(longest(n)).length)) + 1;
    const save = WATCH['save bytes']!.ceiling,
      each = WATCH['save bytes a picture']!.ceiling;
    expect(save, `the longest full save is ${worst}`).toBeGreaterThanOrEqual(worst);
    expect(save - worst, 'and short of a thirteenth picture over it').toBeLessThan(entry);
    expect(each, `the longest entry is ${entry}`).toBeGreaterThanOrEqual(entry);
    expect(each - entry, 'with a little room').toBeLessThanOrEqual(10);
  });

  it('knows a size that grows from one that wanders', () => {
    expect(grew([10, 10, 10, 10, 10, 10, 10, 10, 10])).toBe(false);
    expect(grew([10, 12, 9, 11, 10, 12, 9, 11, 10])).toBe(false);
    expect(grew([0, 20, 40, 60, 50, 50, 50, 50, 50]), 'filled up early and settled').toBe(false);
    expect(grew([10, 20, 30, 40, 50, 60, 70, 80, 90]), 'creeping all the way through').toBe(true);
    expect(grew([1, 2, 3]), 'too short to say').toBe(false);
  });

  it('reports a size over its ceiling, and a steady one still climbing', () => {
    expect(trouble({ tracks: [10, 10, 10] })).toEqual([]);
    expect(trouble({ tracks: [10, TRACKS.capacity + 1, 10] }).join('\n')).toMatch(/tracks went to 2049/);
    expect(trouble({ 'album pictures': [1, 13] }).join('\n')).toMatch(/album pictures went to 13/);
    expect(trouble({ 'save bytes': [300, 5000] }).join('\n')).toMatch(/save bytes went to 5000/);
    expect(trouble({ 'heap MB': [10, 40, 70, 100, 130, 160, 190, 220, 250] }).join('\n')).toMatch(/grew all the way/);
    // a slow leak in the heap, read after a collection: 20 kB a game minute over the hour, from a heap that wanders by
    // a tenth or two as a real one does, is caught; the wander alone is not
    const wander = (k: number) => [0, 0.1, -0.1, 0.1, 0][k % 5];
    const hour = (leak: number) => Array.from({ length: 60 }, (_, k) => 8.7 + wander(k) + (leak * k) / 1000);
    expect(trouble({ 'heap MB': hour(0) })).toEqual([]);
    expect(trouble({ 'heap MB': hour(20) }).join('\n')).toMatch(/heap MB grew all the way/);
    // and an entry of the save growing with play, a few bytes at a time, under its ceiling
    const creep = Array.from({ length: 60 }, (_, k) => 280 + Math.floor(k / 3));
    expect(trouble({ 'save bytes a picture': creep }).join('\n')).toMatch(/save bytes a picture grew/);
    expect(trouble({ 'save bytes a picture': creep.map(() => 281) })).toEqual([]);
    // the whole save is held by its ceiling and not by its growing, which it does as the album fills
    expect(trouble({ 'save bytes': Array.from({ length: 60 }, (_, k) => 300 + k * 50) })).toEqual([]);
    // a size that only ever climbs is held by its ceiling alone
    expect(trouble({ 'album pictures': [1, 2, 3, 4, 5, 6, 7, 8, 9] })).toEqual([]);
  });

  it('plays a short game, stopping to take pictures and keeping some, reloading, and samples it each minute', () => {
    const r = leakRun({ seed: 1, minutes: 2, reloadMinutes: 0.5 });
    expect(r.problems).toEqual([]);
    expect(r.reloads, 'saved and loaded again every half minute, the album coming back as it went').toBe(4);
    expect(r.samples['album pictures']).toHaveLength(2);
    expect(r.pictures).toBeGreaterThan(0);
    expect(r.kept).toBeGreaterThan(0);
    expect(r.samples['album pictures'].at(-1)).toBeGreaterThan(0);
  });
});
